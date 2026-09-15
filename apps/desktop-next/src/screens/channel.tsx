import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  FileText,
  Hash,
  Info,
  LayoutDashboard,
  Link2,
  ListTodo,
  Lock,
  MessageSquare,
  Mic,
  Plus,
  Star,
  UserPlus,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { useShallow } from "zustand/shallow";
import {
  useChannels,
  useCreateChannel,
  useCreateMeeting,
  useCreateVoiceRoom,
  useDeleteChannel,
  useDeleteMessage,
  useFiles,
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
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { getActiveOrganisation } from "@/lib/api";
import { useRealtime } from "@/hooks/useRealtime";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasPermission } from "@teamspace-one/authorization";
import type { Message } from "@/lib/api";
import { cn, getUserDisplayName } from "@/lib/utils";

type ChannelTab = "messages" | "files" | "tasks" | "events" | "links" | "polls" | "board";

const TABS: { id: ChannelTab; label: string; icon: LucideIcon }[] = [
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "files", label: "Files", icon: FileText },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "events", label: "Events", icon: CalendarDays },
  { id: "links", label: "Links", icon: Link2 },
  { id: "polls", label: "Polls", icon: BarChart3 },
  { id: "board", label: "Board", icon: LayoutDashboard },
];

const URL_RE = /https?:\/\/[^\s<>"']+/g;

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function ChannelScreen() {
  const { activeChannelId, activeWorkspaceId, toggleRightPanel, setActiveView } = useUIStore(
    useShallow((s) => ({
      activeChannelId: s.activeChannelId,
      activeWorkspaceId: s.activeWorkspaceId,
      toggleRightPanel: s.toggleRightPanel,
      setActiveView: s.setActiveView,
    })),
  );

  const { data: user } = useMe();
  const { data: channels } = useChannels();
  const { data: members } = useMembers(getActiveOrganisation() ?? undefined);
  const createChannel = useCreateChannel();
  const channelUserIds = useMemo(() => [...new Set((members ?? []).map((m) => m.userId))], [members]);
  const { data: channelUsers } = useUsers(channelUserIds);
  const userMap = useMemo(() => new Map((channelUsers ?? []).map((u) => [u.id, u])), [channelUsers]);
  const channel =
    channels?.find((c) => c.id === activeChannelId) ?? channels?.[0];
  const [tab, setTab] = useState<ChannelTab>("messages");
  const { data: messages, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(channel?.id);
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
  const { data: allFiles } = useFiles();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [privateChannel, setPrivateChannel] = useState(false);
  const [channelMemberIds, setChannelMemberIds] = useState<string[]>([]);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newPrivateChannel, setNewPrivateChannel] = useState(false);
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);

  const { onRealtimeEvent, sendPresence, sendCallRing } = useRealtime();
  const { user: authzUser } = usePermissionContext();
  const canSendMessage = authzUser ? hasPermission(authzUser, "collaboration.message.send") : false;
  const canUploadFile = authzUser ? hasPermission(authzUser, "collaboration.file.upload") : false;
  const canManageChannel = authzUser ? hasPermission(authzUser, "collaboration.channel.manage") : false;
  const canDeleteChannel = authzUser ? hasPermission(authzUser, "collaboration.channel.delete") : false;
  const canCreateMeeting = authzUser ? hasPermission(authzUser, "collaboration.meeting.create") : false;
  const canPinMessage = authzUser ? hasPermission(authzUser, "collaboration.message.edit") : false;
  const canCreateChannel = authzUser ? hasPermission(authzUser, "collaboration.channel.create") : false;

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
    const inviteeIds = channel.members.map((m) => m.userId).filter((id) => id !== user?.id);
    createVoiceRoom.mutate({ title, inviteeIds }, { onSuccess: (meeting) => { ringChannelMembers(meeting.id, "audio", title); setActiveView("voice", { meetingId: meeting.id }); } });
  }

  function startVideoCall() {
    if (!channel) return;
    const title = `${channel.name} video call`;
    const inviteeIds = channel.members.map((m) => m.userId).filter((id) => id !== user?.id);
    createMeeting.mutate({ title, inviteeIds }, { onSuccess: (meeting) => { ringChannelMembers(meeting.id, "video", title); setActiveView("meeting", { meetingId: meeting.id }); } });
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

  function openCreateChannel() {
    setNewChannelName("");
    setNewPrivateChannel(false);
    setNewMemberIds([]);
    createChannel.reset();
    setCreateOpen(true);
  }

  function submitCreateChannel() {
    const name = newChannelName.trim();
    if (!name) return;
    createChannel.mutate(
      {
        name,
        workspaceId: activeWorkspaceId ?? channel?.workspaceId ?? undefined,
        type: newPrivateChannel ? "private" : "public",
        memberIds: newMemberIds,
      },
      {
        onSuccess: (c) => {
          setCreateOpen(false);
          setActiveView("channel", { channelId: c.id });
        },
      },
    );
  }

  // Channel-scoped files: FileRecord rows carry resourceType/resourceId.
  const channelFiles = useMemo(
    () =>
      (allFiles ?? []).filter(
        (f) => f.resourceType === "channel" && f.resourceId === channel?.id,
      ),
    [allFiles, channel?.id],
  );

  // Links extracted from loaded message content (real data).
  const channelLinks = useMemo(() => {
    const out: { url: string; messageId: string; senderId: string; createdAt: string }[] = [];
    for (const m of messages ?? []) {
      if (m.deletedAt) continue;
      for (const url of m.content.match(URL_RE) ?? []) {
        out.push({ url, messageId: m.id, senderId: m.senderId, createdAt: m.createdAt });
      }
    }
    return out;
  }, [messages]);

  const channelMemberUsers = useMemo(
    () => (channel?.members ?? []).map((m) => userMap.get(m.userId)).filter(Boolean),
    [channel?.members, userMap],
  );

  // Channel list pane (admin/hr shells have no workspace sidebar).
  const listChannels = (channels ?? []).filter((c) => c.type !== "direct");

  const stackUsers = channelMemberUsers.slice(0, 3);
  const extraMembers = Math.max(0, (channel?.members.length ?? 0) - stackUsers.length);
  const isPrivate = channel?.type === "private";

  return (
    <>
    <div className="flex h-full">
      {/* Channel list pane (the role sidebar has no workspace sidebar). */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-surface md:flex lg:w-60">
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <h2 className="text-base font-semibold text-text">Channels</h2>
            {canCreateChannel ? (
              <button
                type="button"
                onClick={openCreateChannel}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-subtle text-primary hover:bg-primary hover:text-white"
                aria-label="Create channel"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-4">
            <p className="mb-1 mt-3 px-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Channels</p>
            <div className="flex flex-col gap-0.5">
              {listChannels.slice(0, 5).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveView("channel", { channelId: c.id })}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                    channel?.id === c.id
                      ? "bg-primary-subtle text-primary"
                      : "text-text-secondary hover:bg-surface-elevated hover:text-text",
                  )}
                >
                  {c.type === "private" ? <Lock className="h-3.5 w-3.5 shrink-0" /> : <Hash className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                </button>
              ))}
            </div>
            {listChannels.length > 5 && (
              <div className="flex flex-col gap-0.5">
                {listChannels.slice(5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveView("channel", { channelId: c.id })}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      channel?.id === c.id
                        ? "bg-primary-subtle text-primary"
                        : "text-text-secondary hover:bg-surface-elevated hover:text-text",
                    )}
                  >
                    {c.type === "private" ? <Lock className="h-3.5 w-3.5 shrink-0" /> : <Hash className="h-3.5 w-3.5 shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      <div className="flex min-w-0 flex-1 flex-col">
      {/* Channel header */}
      <header className="flex h-[72px] shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            {isPrivate ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold text-text">
                {channel?.name ?? "Channel"}
              </h1>
              <Star className="h-4 w-4 shrink-0 text-text-muted hover:text-warning" />
            </div>
            <p className="truncate text-xs text-text-muted capitalize">
              {channel?.type ?? "public"} channel · {channel?.members.length ?? 0} members
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden items-center -space-x-2 sm:flex">
            {stackUsers.map((u) => (
              <UserAvatar key={u!.id} user={u} className="h-7 w-7 border-2 border-surface" />
            ))}
            {extraMembers > 0 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-elevated text-[10px] font-semibold text-text-secondary">
                +{extraMembers}
              </div>
            )}
          </div>
          <div className="flex items-center rounded-lg border border-border bg-surface">
            {canCreateMeeting ? (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={createVoiceRoom.isPending} onClick={startVoiceCall} aria-label="Start voice call">
                  <Mic className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={createMeeting.isPending} onClick={startVideoCall} aria-label="Start video call">
                  <Video className="h-4 w-4" />
                </Button>
              </>
            ) : null}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleRightPanel} aria-label="Channel details">
              <Info className="h-4 w-4" />
            </Button>
            {canManageChannel || canDeleteChannel ? (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setChannelName(channel?.name ?? ""); setPrivateChannel(channel?.type === "private"); setChannelMemberIds(channel?.members.map((m) => m.userId) ?? []); setSettingsOpen(true); }} aria-label="Add people">
                <UserPlus className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-border px-4 sm:px-5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "relative flex h-full shrink-0 items-center gap-2 px-3 text-xs font-medium transition-colors",
              tab === id ? "text-text" : "text-text-muted hover:text-text-secondary",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            {tab === id && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
        <button
          type="button"
          className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="Add tab"
        >
          <Plus className="h-4 w-4" />
        </button>
      </nav>

      {tab === "messages" ? (
        <>
          <div className="relative flex min-h-0 flex-1">
            <div className="flex flex-1 flex-col">
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {hasNextPage ? (
                  <div className="mb-3 text-center"><Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchingNextPage ? "Loading…" : "Load older messages"}</Button></div>
                ) : null}
                <div className="mb-4 flex justify-center">
                  <span className="rounded-full border border-border bg-surface px-4 py-1.5 text-[11px] font-medium text-text-secondary">
                    {new Date().toLocaleDateString([], { day: "numeric", month: "short", year: "numeric", weekday: undefined }) === new Date().toLocaleDateString() ? "Today, " : ""}
                    {new Date().toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                </div>
                <div className="space-y-4">
                  {visibleMessages && visibleMessages.length > 0 ? (
                    visibleMessages.map((m, index) => {
                      const prev = visibleMessages[index - 1];
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
                          onPin={canPinMessage ? handlePin : undefined}
                          onCallBack={(kind) => (kind === "video" ? startVideoCall() : startVoiceCall())}
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
              <div className="p-3 pt-0">
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
        </>
      ) : tab === "files" ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {channelFiles.length === 0 ? (
            <EmptyState icon={FileText} title="No files" description="Files shared in this channel will appear here." />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {channelFiles.map((f) => (
                <a
                  key={f.id}
                  href={f.downloadUrl ?? f.url ?? "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:bg-surface-elevated"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{f.originalName}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {new Date(f.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })} · {formatBytes(f.size)}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      ) : tab === "links" ? (
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {channelLinks.length === 0 ? (
            <EmptyState icon={Link2} title="No links" description="Links shared in messages will appear here." />
          ) : (
            <div className="flex flex-col gap-2">
              {channelLinks.map((l, i) => (
                <a
                  key={`${l.messageId}-${i}`}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3 hover:bg-surface-elevated"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                    <Link2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-primary">{l.url}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {getUserDisplayName(userMap.get(l.senderId))} · {new Date(l.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <EmptyState
            icon={(TABS.find((t) => t.id === tab)?.icon ?? LayoutDashboard) as typeof LayoutDashboard}
            title={`No ${TABS.find((t) => t.id === tab)?.label.toLowerCase() ?? "content"} yet`}
            description="This tab needs a channel-scoped API that does not exist yet."
          />
        </div>
      )}
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
    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>Create channel</DialogTitle>
          <DialogDescription>Create a public or private space for your team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-4 pb-4">
          <Input value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="Channel name" autoFocus />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={newPrivateChannel} onChange={(e) => setNewPrivateChannel(e.target.checked)} />
            Private channel
          </label>
          {newPrivateChannel ? (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {members?.map((member) => (
                <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-elevated">
                  <input
                    type="checkbox"
                    checked={newMemberIds.includes(member.userId)}
                    onChange={() => setNewMemberIds((ids) => ids.includes(member.userId) ? ids.filter((id) => id !== member.userId) : [...ids, member.userId])}
                  />
                  <span className="flex-1 truncate">{getUserDisplayName(userMap.get(member.userId))}</span>
                  {/client|external/i.test(member.role.name) ? (
                    <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">External</span>
                  ) : (
                    <span className="text-xs text-text-muted">{member.role.name}</span>
                  )}
                </label>
              ))}
              {!members?.length ? <p className="p-2 text-sm text-text-muted">No organisation members available.</p> : null}
            </div>
          ) : null}
          {createChannel.error ? <p className="text-sm text-error">{createChannel.error.message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={submitCreateChannel} disabled={!newChannelName.trim() || createChannel.isPending}>
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
