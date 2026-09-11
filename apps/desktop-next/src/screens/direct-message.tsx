import { useEffect, useMemo, useState } from "react";
import {
  Info,
  Phone,
  Search,
  Video,
} from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { useShallow } from "zustand/shallow";
import { useChannels, useCreateMeeting, useCreateVoiceRoom, useDeleteMessage, useMe, useMembers, useMessages, useSendMessageOrQueue, useUpdateMessage, useUploadFile, useUsers } from "@/hooks/api";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { MessageItem } from "@/components/chat/message";
import { Composer } from "@/components/chat/composer";
import { ThreadPanel } from "@/components/chat/thread-panel";
import { getActiveOrganisation } from "@/lib/api";
import { useRealtime } from "@/hooks/useRealtime";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasPermission } from "@teamspace-one/authorization";
import { cn, getUserDisplayName } from "@/lib/utils";
import type { Message } from "@/lib/api";

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
  const directChannels = channels?.filter((c) => c.type === "direct") ?? [];
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, { status: string; at: number }>>({});
  const [readMap, setReadMap] = useState<Record<string, { messageId: string; readAt: string }>>({});
  const { onRealtimeEvent, sendPresence, sendReadReceipt, sendCallRing } = useRealtime();
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
  const otherPresence = otherMemberId ? presenceMap[otherMemberId] : undefined;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const status = useMemo(() => {
    if (!otherPresence) return "offline";
    if (now - otherPresence.at > 2 * 60 * 60 * 1000) return "offline";
    if (["online", "away", "busy"].includes(otherPresence.status)) return otherPresence.status;
    return "offline";
  }, [otherPresence, now]);

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
    const unsubscribePresence = onRealtimeEvent("presence", (payload) => {
      if (payload.room !== `channel:${contact.id}` || payload.userId === user?.id) return;
      setPresenceMap((prev) => ({ ...prev, [payload.userId]: { status: payload.status, at: Date.now() } }));
      // Respond so the other side learns our presence too.
      sendPresence(contact.id, "online");
    });
    const unsubscribeRead = onRealtimeEvent("read-receipt", (payload) => {
      if (payload.room !== `channel:${contact.id}` || payload.userId === user?.id) return;
      setReadMap((prev) => ({ ...prev, [payload.userId]: { messageId: payload.messageId, readAt: payload.readAt } }));
    });
    return () => {
      unsubscribeTyping();
      unsubscribePresence();
      unsubscribeRead();
      sendPresence(contact.id, "offline");
    };
  }, [contact?.id, user?.id, onRealtimeEvent, sendPresence]);

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
    const ring = (meetingId: string) => {
      const userIds = contact.members.map((m) => m.userId).filter((id) => id !== user?.id);
      if (userIds.length === 0) return;
      const callerName = user ? getUserDisplayName(user) : undefined;
      sendCallRing({ meetingId, kind: video ? "video" : "audio", title, channelId: contact.id, callerName, userIds });
    };
    if (video) createMeeting.mutate({ title }, { onSuccess: (meeting) => { ring(meeting.id); setActiveView("meeting", { meetingId: meeting.id }); } });
    else createVoiceRoom.mutate({ title }, { onSuccess: (meeting) => { ring(meeting.id); setActiveView("voice", { meetingId: meeting.id }); } });
  }

  const visibleMessages = searchQuery.trim() ? messages?.filter((message) => message.content.toLowerCase().includes(searchQuery.trim().toLowerCase())) : messages;

  function handleEdit(messageId: string, content: string) {
    if (!contact) return;
    updateMessage.mutate({ messageId, channelId: contact.id, content });
  }

  function handleDelete(messageId: string) {
    if (!contact) return;
    deleteMessage.mutate({ messageId, channelId: contact.id });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {contactName.charAt(0).toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface",
                status === "online"
                  ? "bg-online"
                  : status === "away"
                    ? "bg-away"
                    : status === "busy"
                      ? "bg-busy"
                      : "bg-offline",
              )}
            />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text">{contactName}</h1>
            <p className="text-xs text-text-muted capitalize">
              {typingUsers.length > 0
                ? "typing…"
                : status}
              {otherPresence && status !== "online"
                ? ` · last seen ${new Date(otherPresence.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant={searchOpen ? "secondary" : "ghost"} size="icon" onClick={() => setSearchOpen((open) => !open)}>
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={createVoiceRoom.isPending} onClick={() => startCall(false)}>
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={createMeeting.isPending} onClick={() => startCall(true)}>
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleRightPanel}>
            <Info className="h-4 w-4" />
          </Button>
        </div>
      </header>
      {searchOpen ? <div className="border-b p-2"><Input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search this conversation" /></div> : null}

      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {hasNextPage ? (
              <div className="mb-3 text-center"><Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchingNextPage ? "Loading…" : "Load older messages"}</Button></div>
            ) : null}
            <div className="space-y-4">
              {visibleMessages && visibleMessages.length > 0 ? (
                visibleMessages.map((m, index) => {
                  const prev = visibleMessages[index - 1];
                  const compact =
                    !searchQuery.trim() &&
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
  );
}
