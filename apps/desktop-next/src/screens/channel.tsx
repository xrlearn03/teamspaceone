import { useEffect, useMemo, useState } from "react";
import {
  Hash,
  Info,
  MoreHorizontal,
  Phone,
  Search,
  Video,
} from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { useShallow } from "zustand/shallow";
import {
  useChannels,
  useCreateMeeting,
  useCreateVoiceRoom,
  useDeleteChannel,
  useDeleteMessage,
  useMe,
  useMembers,
  useMessages,
  usePinMessage,
  useReplaceChannelMembers,
  useSendMessageOrQueue,
  useUnpinMessage,
  useUpdateChannel,
  useUpdateMessage,
  useUploadFile,
  useUsers,
} from "@/hooks/api";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@teamspace-one/ui/dialog";
import { MessageItem } from "@/components/chat/message";
import { Composer } from "@/components/chat/composer";
import { ThreadPanel } from "@/components/chat/thread-panel";
import { getActiveOrganisation } from "@/lib/api";
import { useRealtime } from "@/hooks/useRealtime";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasPermission } from "@teamspace-one/authorization";
import type { Message } from "@/lib/api";
import { getUserDisplayName } from "@/lib/utils";

export function ChannelScreen() {
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
  const channelUserIds = useMemo(() => [...new Set((members ?? []).map((m) => m.userId))], [members]);
  const { data: channelUsers } = useUsers(channelUserIds);
  const userMap = useMemo(() => new Map((channelUsers ?? []).map((u) => [u.id, u])), [channelUsers]);
  const channel =
    channels?.find((c) => c.id === activeChannelId) ?? channels?.[0];
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const search = searchQuery.trim() || undefined;
  const { data: messages, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(channel?.id, search);
  const { sendOrQueue, isPending: sending } = useSendMessageOrQueue();
  const updateMessage = useUpdateMessage();
  const deleteMessage = useDeleteMessage();
  const pinMessage = usePinMessage();
  const unpinMessage = useUnpinMessage();
  const uploadFile = useUploadFile();
  const createMeeting = useCreateMeeting();
  const createVoiceRoom = useCreateVoiceRoom();
  const updateChannel = useUpdateChannel();
  const replaceMembers = useReplaceChannelMembers();
  const deleteChannel = useDeleteChannel();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [privateChannel, setPrivateChannel] = useState(false);
  const [channelMemberIds, setChannelMemberIds] = useState<string[]>([]);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const { onRealtimeEvent, sendPresence, sendCallRing } = useRealtime();
  const { user: authzUser } = usePermissionContext();
  const canSendMessage = authzUser ? hasPermission(authzUser, "collaboration.message.send") : false;
  const canUploadFile = authzUser ? hasPermission(authzUser, "collaboration.file.upload") : false;
  const canManageChannel = authzUser ? hasPermission(authzUser, "collaboration.channel.manage") : false;
  const canDeleteChannel = authzUser ? hasPermission(authzUser, "collaboration.channel.delete") : false;
  const canCreateMeeting = authzUser ? hasPermission(authzUser, "collaboration.meeting.create") : false;
  const canPinMessage = authzUser ? hasPermission(authzUser, "collaboration.message.edit") : false;

  useEffect(() => {
    if (!channel) return;
    sendPresence(channel.id, "online");
    return onRealtimeEvent("typing", (payload) => {
      if (payload.room !== `channel:${channel.id}` || payload.userId === user?.id) return;
      setTypingUsers((prev) =>
        payload.isTyping ? [...new Set([...prev, payload.userId])] : prev.filter((id) => id !== payload.userId),
      );
      if (payload.isTyping) {
        setTimeout(() => setTypingUsers((prev) => prev.filter((id) => id !== payload.userId)), 4000);
      }
    });
  }, [channel?.id, user?.id, onRealtimeEvent, sendPresence]);

  function send(content: string) {
    if (!channel) return;
    void sendOrQueue({ channelId: channel.id, content, senderId: user?.id });
  }

  function attach(file?: File) {
    if (!file || !channel) return;
    uploadFile.mutate(
      { file, resource: { resourceType: "channel", resourceId: channel.id, workspaceId: channel.workspaceId ?? undefined } },
      {
        onSuccess: (uploaded) => void sendOrQueue({ channelId: channel.id, content: "", attachmentIds: [uploaded.id], senderId: user?.id }),
      },
    );
  }

  function ringChannelMembers(meetingId: string, kind: "audio" | "video", title: string) {
    if (!channel) return;
    const userIds = channel.members.map((m) => m.userId).filter((id) => id !== user?.id);
    if (userIds.length === 0) return;
    const callerName = user ? getUserDisplayName(user) : undefined;
    sendCallRing({ meetingId, kind, title, channelId: channel.id, callerName, userIds });
  }

  function startVoiceCall() {
    if (!channel) return;
    const title = `${channel.name} voice`;
    createVoiceRoom.mutate({ title }, { onSuccess: (meeting) => { ringChannelMembers(meeting.id, "audio", title); setActiveView("voice", { meetingId: meeting.id }); } });
  }

  function startVideoCall() {
    if (!channel) return;
    const title = `${channel.name} video call`;
    createMeeting.mutate({ title }, { onSuccess: (meeting) => { ringChannelMembers(meeting.id, "video", title); setActiveView("meeting", { meetingId: meeting.id }); } });
  }

  const visibleMessages = messages;

  function handleEdit(messageId: string, content: string) {
    if (!channel) return;
    updateMessage.mutate({ messageId, channelId: channel.id, content });
  }

  function handleDelete(messageId: string) {
    if (!channel) return;
    deleteMessage.mutate({ messageId, channelId: channel.id });
  }

  function handlePin(message: Message) {
    if (!channel) return;
    if (message.pinnedAt) {
      unpinMessage.mutate(message.id);
    } else {
      pinMessage.mutate(message.id);
    }
  }

  return (
    <>
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Hash className="h-5 w-5 shrink-0 text-text-muted" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-text">
              {channel?.name ?? "Channel"}
            </h1>
            <p className="text-xs text-text-muted capitalize">
              {channel?.type ?? "public"} channel
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant={searchOpen ? "secondary" : "ghost"} size="icon" onClick={() => setSearchOpen((open) => !open)}>
            <Search className="h-4 w-4" />
          </Button>
          {canCreateMeeting ? (
            <>
              <Button variant="ghost" size="icon" disabled={createVoiceRoom.isPending} onClick={startVoiceCall}>
                <Phone className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" disabled={createMeeting.isPending} onClick={startVideoCall}>
                <Video className="h-4 w-4" />
              </Button>
            </>
          ) : null}
          <Button variant="ghost" size="icon" onClick={toggleRightPanel}>
            <Info className="h-4 w-4" />
          </Button>
          {canManageChannel || canDeleteChannel ? (
            <Button variant="ghost" size="icon" onClick={() => { setChannelName(channel?.name ?? ""); setPrivateChannel(channel?.type === "private"); setChannelMemberIds(channel?.members.map((member) => member.userId) ?? []); setSettingsOpen(true); }}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </header>
      {searchOpen ? <div className="border-b p-2"><Input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search messages in this channel" /></div> : null}

      <div className="relative flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {hasNextPage ? (
              <div className="mb-3 text-center"><Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchingNextPage ? "Loading…" : "Load older messages"}</Button></div>
            ) : null}
            <div className="mb-4 flex items-center gap-2 text-xs text-text-muted">
              <span className="h-px flex-1 bg-border" />
              <span>Today</span>
              <span className="h-px flex-1 bg-border" />
            </div>

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
                      onPin={canPinMessage ? handlePin : undefined}
                    />
                  );
                })
              ) : (
                <div className="py-8 text-center text-sm text-text-muted">
                  No messages yet. Say hello.
                </div>
              )}
            </div>
          </div>

          <div className="border-t p-3">
            {typingUsers.length > 0 ? (
              <p className="px-1 pb-1 text-xs italic text-text-muted">
                {typingUsers.map((id) => getUserDisplayName(userMap.get(id))).join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing…
              </p>
            ) : null}
            <Composer
              placeholder={`Message #${channel?.name ?? "channel"}`}
              draftKey={channel ? `channel:${channel.id}` : undefined}
              channelId={channel?.id}
              members={(members ?? []).map((m) => ({ id: m.userId, name: getUserDisplayName(userMap.get(m.userId)) }))}
              sending={sending}
              disabled={!channel || !canSendMessage}
              onSend={send}
              onAttach={canUploadFile ? attach : undefined}
            />
          </div>
        </div>

        {threadMessage && channel ? (
          <ThreadPanel
            channelId={channel.id}
            parentMessage={threadMessage}
            userMap={userMap}
            onClose={() => setThreadMessage(null)}
          />
        ) : null}
      </div>
    </div>
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>Channel settings</DialogTitle>
          <DialogDescription>Rename the channel, change its visibility, or permanently remove it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-4 pb-4">
          <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} disabled={!canManageChannel} />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={privateChannel} onChange={(e) => setPrivateChannel(e.target.checked)} disabled={!canManageChannel} />
            Private channel
          </label>
          <div>
            <p className="mb-1 text-xs font-medium text-text-muted">Members</p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
              {members?.map((member) => (
                <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-surface-elevated">
                  <input
                    type="checkbox"
                    checked={channelMemberIds.includes(member.userId)}
                    disabled={!canManageChannel || member.userId === channel?.createdBy}
                    onChange={() => setChannelMemberIds((ids) => ids.includes(member.userId) ? ids.filter((id) => id !== member.userId) : [...ids, member.userId])}
                  />
                  <span className="flex-1 truncate">{getUserDisplayName(userMap.get(member.userId))}</span>
                  {/client|external/i.test(member.role.name) ? (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">External</span>
                  ) : (
                    <span className="text-xs text-text-muted">{member.role.name}</span>
                  )}
                </label>
              ))}
            </div>
          </div>
          {(updateChannel.error || replaceMembers.error) ? <p className="text-sm text-error">{(updateChannel.error ?? replaceMembers.error)?.message}</p> : null}
          <div className="flex justify-between gap-2">
            {canDeleteChannel ? (
              <Button
                variant="ghost"
                className="text-error"
                disabled={!channel || deleteChannel.isPending}
                onClick={() => channel && deleteChannel.mutate(channel.id, { onSuccess: () => { setSettingsOpen(false); useUIStore.getState().setActiveView("home"); } })}
              >
                Delete channel
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button
                disabled={!canManageChannel || !channel || !channelName.trim() || updateChannel.isPending || replaceMembers.isPending}
                onClick={() => {
                  if (!channel) return;
                  void updateChannel.mutateAsync({ channelId: channel.id, body: { name: channelName.trim(), type: privateChannel ? "private" : "public" } })
                    .then(() => replaceMembers.mutateAsync({ channelId: channel.id, memberIds: channelMemberIds }))
                    .then(() => setSettingsOpen(false));
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
