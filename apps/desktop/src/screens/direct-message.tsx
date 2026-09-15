import { useEffect, useMemo, useState } from "react";
import {
  Info,
  Phone,
  Plus,
  Video,
} from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import { useChannels, useCreateDirectChannel, useCreateMeeting, useCreateVoiceRoom, useDeleteMessage, useMe, useMembers, useMessages, useSendMessageOrQueue, useUpdateMessage, useUploadFile, useUsers } from "../hooks/api";
import { Button } from "@teamspace-one/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@teamspace-one/ui/dialog";
import { MessageItem } from "../components/chat/message";
import { Composer } from "../components/chat/composer";
import { ThreadPanel } from "../components/chat/thread-panel";
import { UserAvatar } from "../components/user-avatar";
import { getActiveOrganisation } from "../lib/api";
import { useRealtime } from "../hooks/useRealtime";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasPermission } from "@teamspace-one/authorization";
import { cn, getUserDisplayName } from "../lib/utils";
import type { Channel, Message, UserDto } from "../lib/api";

const PRESENCE_DOT: Record<string, string> = {
  online: "bg-online",
  away: "bg-away",
  busy: "bg-busy",
  offline: "bg-offline",
};

const PRESENCE_STALE_MS = 2 * 60 * 60 * 1000;

function formatConversationTime(iso: string) {
  const date = new Date(iso);
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { day: "numeric", month: "short" });
}

export function DirectMessageScreen() {
  const { activeChannelId, toggleRightPanel, setActiveView } = useUIStore(
    useShallow((s) => ({
      activeChannelId: s.activeChannelId,
      toggleRightPanel: s.toggleRightPanel,
      setActiveView: s.setActiveView,
    })),
  );

  const { data: user } = useMe();
  const { data: channels } = useChannels();
  const { data: members } = useMembers(getActiveOrganisation() ?? undefined);
  const directChannels = useMemo(
    () =>
      (channels ?? [])
        .filter((c) => c.type === "direct")
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [channels],
  );
  const contact =
    directChannels.find((c) => c.id === activeChannelId) ??
    directChannels[0];
  const { data: messages, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(contact?.id);
  const messageUserIds = useMemo(() => [...new Set((messages ?? []).map((m) => m.senderId))], [messages]);
  const memberUserIds = useMemo(() => [...new Set((members ?? []).map((m) => m.userId))], [members]);
  const allUserIds = useMemo(() => [...new Set([...memberUserIds, ...messageUserIds])], [memberUserIds, messageUserIds]);
  const { data: users } = useUsers(allUserIds);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const { sendOrQueue, isPending: sending } = useSendMessageOrQueue();
  const updateMessage = useUpdateMessage();
  const deleteMessage = useDeleteMessage();
  const uploadFile = useUploadFile();
  const createMeeting = useCreateMeeting();
  const createVoiceRoom = useCreateVoiceRoom();
  const createDirectChannel = useCreateDirectChannel();
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, { status: string; at: number }>>({});
  const [readMap, setReadMap] = useState<Record<string, { messageId: string; readAt: string }>>({});
  const { connected, onRealtimeEvent, joinRealtimeChannel, sendPresence, sendReadReceipt, sendCallRing } = useRealtime();
  const { user: authzUser } = usePermissionContext();
  const canSendMessage = authzUser ? hasPermission(authzUser, "collaboration.message.send") : false;
  const canUploadFile = authzUser ? hasPermission(authzUser, "collaboration.file.upload") : false;

  const otherMembers = useMemo(() => contact?.members.filter((m) => m.userId !== user?.id) ?? [], [contact, user]);
  const contactName = useMemo(() => {
    const names = otherMembers.map((m) => getUserDisplayName(userMap.get(m.userId)));
    if (names.length === 0) return contact?.name ?? "Direct message";
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }, [contact, otherMembers, userMap]);
  const otherMemberId = otherMembers[0]?.userId;
  const primaryUser: UserDto | undefined = otherMemberId ? userMap.get(otherMemberId) : undefined;
  const otherPresence = otherMemberId ? presenceMap[otherMemberId] : undefined;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const presenceStatus = (userId: string | undefined) => {
    const entry = userId ? presenceMap[userId] : undefined;
    if (!entry) return "offline";
    if (now - entry.at > PRESENCE_STALE_MS) return "offline";
    if (["online", "away", "busy"].includes(entry.status)) return entry.status;
    return "offline";
  };
  const status = presenceStatus(otherMemberId);

  const dmChannelIds = useMemo(() => directChannels.map((d) => d.id), [directChannels]);
  const dmChannelIdSet = useMemo(() => new Set(dmChannelIds), [dmChannelIds]);

  // Join every conversation room so presence flows for the list pane, not just
  // the open chat. useMessages also joins/leaves the open room, so re-join on
  // contact change to re-assert membership; leaves are left to the sidebar
  // which shares these rooms on the same socket.
  useEffect(() => {
    if (!connected) return;
    for (const id of dmChannelIds) {
      joinRealtimeChannel(id);
      sendPresence(id, "online");
    }
  }, [connected, contact?.id, dmChannelIds, joinRealtimeChannel, sendPresence]);

  useEffect(() => {
    if (!contact) return;
    sendPresence(contact.id, "online");
    const unsubscribeTyping = onRealtimeEvent("typing", (payload) => {
      if (payload.room !== `channel:${contact.id}` || payload.userId === user?.id) return;
      setTypingUsers((prev) =>
        payload.isTyping ? [...new Set([...prev, payload.userId])] : prev.filter((id) => id !== payload.userId),
      );
      if (payload.isTyping) {
        setTimeout(() => setTypingUsers((prev) => prev.filter((id) => id !== payload.userId)), 4000);
      }
    });
    const unsubscribeRead = onRealtimeEvent("read-receipt", (payload) => {
      if (payload.room !== `channel:${contact.id}` || payload.userId === user?.id) return;
      setReadMap((prev) => ({ ...prev, [payload.userId]: { messageId: payload.messageId, readAt: payload.readAt } }));
    });
    return () => {
      unsubscribeTyping();
      unsubscribeRead();
      sendPresence(contact.id, "offline");
    };
  }, [contact?.id, user?.id, onRealtimeEvent, sendPresence]);

  // Presence for every conversation — drives the list-pane status dots and the
  // header status line. Re-announce ourselves so the other side learns our
  // presence too.
  useEffect(() => {
    return onRealtimeEvent("presence", (payload) => {
      if (payload.userId === user?.id || !payload.room.startsWith("channel:")) return;
      const channelId = payload.room.slice("channel:".length);
      if (!dmChannelIdSet.has(channelId)) return;
      setPresenceMap((prev) => ({ ...prev, [payload.userId]: { status: payload.status, at: Date.now() } }));
      sendPresence(channelId, "online");
    });
  }, [user?.id, dmChannelIdSet, onRealtimeEvent, sendPresence]);

  // Emit a read receipt for the latest message whenever it changes.
  const lastMessage = messages?.[messages.length - 1];
  useEffect(() => {
    if (contact && lastMessage && lastMessage.senderId !== user?.id) {
      sendReadReceipt(contact.id, lastMessage.id);
    }
  }, [contact?.id, lastMessage?.id, user?.id, sendReadReceipt]);

  const lastOwnMessage = [...(messages ?? [])].reverse().find((m) => m.senderId === user?.id);
  const seenByOther = Boolean(
    lastOwnMessage &&
      otherMemberId &&
      readMap[otherMemberId] &&
      readMap[otherMemberId].readAt >= lastOwnMessage.createdAt,
  );

  function send(content: string) {
    if (!contact) return;
    void sendOrQueue({ channelId: contact.id, content, senderId: user?.id });
  }

  function attach(file?: File) {
    if (!file || !contact) return;
    uploadFile.mutate(
      { file, resource: { resourceType: "channel", resourceId: contact.id } },
      {
        onSuccess: (uploaded) => void sendOrQueue({ channelId: contact.id, content: "", attachmentIds: [uploaded.id], senderId: user?.id }),
      },
    );
  }

  function startCall(video: boolean) {
    if (!contact) return;
    const title = `${contactName} ${video ? "video call" : "voice call"}`;
    const inviteeIds = contact.members.map((m) => m.userId).filter((id) => id !== user?.id);
    const ring = (meetingId: string) => {
      if (inviteeIds.length === 0) return;
      const callerName = user ? getUserDisplayName(user) : undefined;
      sendCallRing({ meetingId, kind: video ? "video" : "audio", title, channelId: contact.id, callerName, userIds: inviteeIds });
    };
    if (video) createMeeting.mutate({ title, inviteeIds }, { onSuccess: (meeting) => { ring(meeting.id); setActiveView("meeting", { meetingId: meeting.id }); } });
    else createVoiceRoom.mutate({ title, inviteeIds }, { onSuccess: (meeting) => { ring(meeting.id); setActiveView("voice", { meetingId: meeting.id }); } });
  }

  function handleEdit(messageId: string, content: string) {
    if (!contact) return;
    updateMessage.mutate({ messageId, channelId: contact.id, content });
  }

  function handleDelete(messageId: string) {
    if (!contact) return;
    deleteMessage.mutate({ messageId, channelId: contact.id });
  }

  function conversationLabel(dm: Channel) {
    const names = dm.members
      .filter((m) => m.userId !== user?.id)
      .map((m) => getUserDisplayName(userMap.get(m.userId)));
    if (names.length === 0) return dm.name || "Direct message";
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }

  function conversationPreview(dm: Channel) {
    const others = dm.members.filter((m) => m.userId !== user?.id);
    if (others.length > 1) return `${dm.members.length} members`;
    const other = others[0] ? userMap.get(others[0].userId) : undefined;
    return other?.email ?? "Direct message";
  }

  function conversationStatus(dm: Channel) {
    const others = dm.members.filter((m) => m.userId !== user?.id);
    for (const m of others) {
      const s = presenceStatus(m.userId);
      if (s !== "offline") return s;
    }
    return "offline";
  }

  return (
    <>
    <div className="flex h-full">
      {/* Conversation list pane (the role sidebar has no workspace sidebar). */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex lg:w-72">
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <h2 className="text-base font-semibold text-text">Messages</h2>
            <button
              type="button"
              onClick={() => { setSelectedMembers([]); setComposeOpen(true); }}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-primary hover:bg-primary hover:text-white"
              aria-label="New direct message"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4 pt-2">
            {directChannels.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {directChannels.map((dm) => {
                  const other = dm.members.find((m) => m.userId !== user?.id);
                  const otherUser = other ? userMap.get(other.userId) : undefined;
                  const active = contact?.id === dm.id;
                  return (
                    <button
                      key={dm.id}
                      type="button"
                      onClick={() => setActiveView("dm", { channelId: dm.id })}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                        active
                          ? "bg-primary-subtle text-primary"
                          : "text-text-secondary hover:bg-surface-elevated hover:text-text",
                      )}
                    >
                      <span className="relative h-9 w-9 shrink-0">
                        <UserAvatar user={otherUser} className="h-full w-full" />
                        <span
                          className={cn(
                            "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface",
                            PRESENCE_DOT[conversationStatus(dm)] ?? "bg-offline",
                          )}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className={cn("truncate text-sm font-medium", active ? "text-primary" : "text-text")}>
                            {conversationLabel(dm)}
                          </span>
                          <span className="shrink-0 text-[10px] text-text-muted">
                            {formatConversationTime(dm.updatedAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-text-muted">
                          {conversationPreview(dm)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="px-2 py-4 text-center text-xs text-text-muted">No conversations yet.</div>
            )}
          </div>
        </aside>

      <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <UserAvatar user={primaryUser} className="h-11 w-11" />
            <span
              className={cn(
                "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface",
                PRESENCE_DOT[status] ?? "bg-offline",
              )}
            />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-text">{contactName}</h1>
            <p className="truncate text-xs capitalize text-text-muted">
              {typingUsers.length > 0
                ? "typing…"
                : status}
              {otherPresence && status !== "online"
                ? ` · last seen ${new Date(otherPresence.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center rounded-lg border border-border bg-surface">
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={createVoiceRoom.isPending} onClick={() => startCall(false)} aria-label="Start voice call">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" disabled={createMeeting.isPending} onClick={() => startCall(true)} aria-label="Start video call">
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleRightPanel} aria-label="Conversation details">
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {hasNextPage ? (
              <div className="mb-3 text-center"><Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchingNextPage ? "Loading…" : "Load older messages"}</Button></div>
            ) : null}
            <div className="space-y-4">
              {messages && messages.length > 0 ? (
                messages.map((m, index) => {
                  const prev = messages[index - 1];
                  const compact =
                    prev !== undefined &&
                    prev.senderId === m.senderId &&
                    !prev.deletedAt &&
                    new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000;
                  return (
                    <MessageItem
                      key={m.id}
                      message={m}
                      user={user}
                      userMap={userMap}
                      compact={compact}
                      onReply={() => setThreadMessage(m)}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onCallBack={(kind) => startCall(kind === "video")}
                    />
                  );
                })
              ) : (
                <p className="py-8 text-center text-sm text-text-muted">No messages yet.</p>
              )}
            </div>

            {seenByOther ? (
              <p className="mt-1 text-right text-[11px] text-text-muted">Seen</p>
            ) : null}
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-text-muted">
              <span className="h-px w-12 bg-border" />
              <span>End-to-end encrypted</span>
              <span className="h-px w-12 bg-border" />
            </div>
          </div>

          <div className="border-t p-3">
            {typingUsers.length > 0 ? (
              <p className="px-1 pb-1 text-xs italic text-text-muted">
                {typingUsers.map((id) => getUserDisplayName(userMap.get(id))).join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
              </p>
            ) : null}
            <Composer
              placeholder={`Message ${contact?.name ?? "contact"}`}
              draftKey={contact ? `channel:${contact.id}` : undefined}
              channelId={contact?.id}
              members={(members ?? []).map((m) => ({ id: m.userId, name: getUserDisplayName(userMap.get(m.userId)) }))}
              sending={sending}
              disabled={!contact || !canSendMessage}
              onSend={send}
              onAttach={canUploadFile ? attach : undefined}
            />
          </div>
        </div>

        {threadMessage && contact ? (
          <ThreadPanel
            channelId={contact.id}
            parentMessage={threadMessage}
            userMap={userMap}
            onClose={() => setThreadMessage(null)}
          />
        ) : null}
      </div>
      </div>
    </div>

    <Dialog open={composeOpen} onOpenChange={(open) => { setComposeOpen(open); if (!open) setSelectedMembers([]); }}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>New direct message</DialogTitle>
          <DialogDescription>Choose one or more organisation members.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-4 pb-4">
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
            {members?.map((member) => (
              <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-elevated">
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(member.userId)}
                  onChange={() => setSelectedMembers((ids) => ids.includes(member.userId) ? ids.filter((id) => id !== member.userId) : [...ids, member.userId])}
                />
                <span className="flex-1 truncate">{getUserDisplayName(userMap.get(member.userId))}</span>
                <span className="text-xs text-text-muted">{member.role.name}</span>
              </label>
            ))}
            {!members?.length ? <p className="p-2 text-sm text-text-muted">No organisation members available.</p> : null}
          </div>
          {createDirectChannel.error ? <p className="text-sm text-error">{createDirectChannel.error.message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setComposeOpen(false)}>Cancel</Button>
            <Button
              disabled={selectedMembers.length === 0 || createDirectChannel.isPending}
              onClick={() =>
                createDirectChannel.mutate(selectedMembers, {
                  onSuccess: (channel) => {
                    setComposeOpen(false);
                    setSelectedMembers([]);
                    setActiveView("dm", { channelId: channel.id });
                  },
                })
              }
            >
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
