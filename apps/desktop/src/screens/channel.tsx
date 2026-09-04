import { useState } from "react";
import {
  Hash,
  Info,
  MoreHorizontal,
  Paperclip,
  Phone,
  Search,
  Send,
  Video,
} from "lucide-react";
import { useUIStore } from "../stores/ui";
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
  useReplaceChannelMembers,
  useSendMessage,
  useUpdateChannel,
  useUpdateMessage,
  useUploadFile,
} from "../hooks/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { MessageItem } from "../components/chat/message";
import { ThreadPanel } from "../components/chat/thread-panel";
import { getActiveOrganisation } from "../lib/api";
import type { Message } from "../lib/api";

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
  const channel =
    channels?.find((c) => c.id === activeChannelId) ?? channels?.[0];
  const { data: messages, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(channel?.id);
  const sendMessage = useSendMessage();
  const updateMessage = useUpdateMessage();
  const deleteMessage = useDeleteMessage();
  const uploadFile = useUploadFile();
  const createMeeting = useCreateMeeting();
  const createVoiceRoom = useCreateVoiceRoom();
  const updateChannel = useUpdateChannel();
  const replaceMembers = useReplaceChannelMembers();
  const deleteChannel = useDeleteChannel();
  const [draft, setDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [privateChannel, setPrivateChannel] = useState(false);
  const [channelMemberIds, setChannelMemberIds] = useState<string[]>([]);
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);

  function send() {
    if (!channel || !draft.trim()) return;
    sendMessage.mutate({ channelId: channel.id, content: draft.trim() });
    setDraft("");
  }

  function attach(file?: File) {
    if (!file || !channel) return;
    uploadFile.mutate(file, {
      onSuccess: (uploaded) => sendMessage.mutate({ channelId: channel.id, content: "", attachmentIds: [uploaded.id] }),
    });
  }

  function startVoiceCall() {
    if (!channel) return;
    createVoiceRoom.mutate({ title: `${channel.name} voice` }, { onSuccess: (meeting) => setActiveView("voice", { meetingId: meeting.id }) });
  }

  function startVideoCall() {
    if (!channel) return;
    createMeeting.mutate({ title: `${channel.name} video call` }, { onSuccess: (meeting) => setActiveView("meeting", { meetingId: meeting.id }) });
  }

  const visibleMessages = searchQuery.trim() ? messages?.filter((message) => message.content.toLowerCase().includes(searchQuery.trim().toLowerCase())) : messages;

  function handleEdit(messageId: string, content: string) {
    if (!channel) return;
    updateMessage.mutate({ messageId, channelId: channel.id, content });
  }

  function handleDelete(messageId: string) {
    if (!channel) return;
    deleteMessage.mutate({ messageId, channelId: channel.id });
  }

  return (
    <>
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <Hash className="h-5 w-5 text-text-muted" />
          <div>
            <h1 className="text-base font-semibold text-text">
              {channel?.name ?? "Channel"}
            </h1>
            <p className="text-xs text-text-muted capitalize">
              {channel?.type ?? "public"} channel
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant={searchOpen ? "secondary" : "ghost"} size="icon" onClick={() => setSearchOpen((open) => !open)}>
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={createVoiceRoom.isPending} onClick={startVoiceCall}>
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={createMeeting.isPending} onClick={startVideoCall}>
            <Video className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleRightPanel}>
            <Info className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => { setChannelName(channel?.name ?? ""); setPrivateChannel(channel?.type === "private"); setChannelMemberIds(channel?.members.map((member) => member.userId) ?? []); setSettingsOpen(true); }}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </header>
      {searchOpen ? <div className="border-b p-2"><Input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search messages in this channel" /></div> : null}

      <div className="flex min-h-0 flex-1">
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
                visibleMessages.map((m) => (
                  <MessageItem
                    key={m.id}
                    message={m}
                    user={user}
                    onReply={() => setThreadMessage(m)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))
              ) : (
                <div className="py-8 text-center text-sm text-text-muted">
                  No messages yet. Say hello.
                </div>
              )}
            </div>
          </div>

          <div className="border-t p-3">
            <div className="flex items-end gap-2 rounded-lg border bg-surface p-2">
              <div className="flex-1">
                <Input
                  placeholder={`Message #${channel?.name ?? "channel"}`}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  className="border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
                />
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" asChild>
                  <label aria-label="Attach file" className="cursor-pointer">
                    <Paperclip className="h-4 w-4" />
                    <input type="file" className="hidden" onChange={(e) => { attach(e.target.files?.[0]); e.currentTarget.value = ""; }} />
                  </label>
                </Button>
                <Button size="icon" onClick={send} disabled={!channel || sendMessage.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-text-muted">
              Enter to send · Shift + Enter for new line
            </p>
          </div>
        </div>

        {threadMessage && channel ? (
          <ThreadPanel
            channelId={channel.id}
            parentMessage={threadMessage}
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
          <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={privateChannel} onChange={(e) => setPrivateChannel(e.target.checked)} />
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
                    disabled={member.userId === channel?.createdBy}
                    onChange={() => setChannelMemberIds((ids) => ids.includes(member.userId) ? ids.filter((id) => id !== member.userId) : [...ids, member.userId])}
                  />
                  <span className="flex-1 truncate">{member.userId}</span>
                  <span className="text-xs text-text-muted">{member.role.name}</span>
                </label>
              ))}
            </div>
          </div>
          {(updateChannel.error || replaceMembers.error) ? <p className="text-sm text-error">{(updateChannel.error ?? replaceMembers.error)?.message}</p> : null}
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              className="text-error"
              disabled={!channel || deleteChannel.isPending}
              onClick={() => channel && deleteChannel.mutate(channel.id, { onSuccess: () => { setSettingsOpen(false); useUIStore.getState().setActiveView("home"); } })}
            >
              Delete channel
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button
                disabled={!channel || !channelName.trim() || updateChannel.isPending || replaceMembers.isPending}
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
