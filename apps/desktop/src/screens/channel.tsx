import { useState } from "react";
import {
  Hash,
  Info,
  MoreHorizontal,
  Check,
  Paperclip,
  Pencil,
  Phone,
  Search,
  Send,
  Smile,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import { useChannels, useDeleteChannel, useDeleteMessage, useMe, useMembers, useMessages, useReplaceChannelMembers, useSendMessage, useUpdateChannel, useUpdateMessage, useUploadFile } from "../hooks/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { MessageAttachment } from "../components/ui/message-attachment";
import { getActiveOrganisation } from "../lib/api";
import { cn } from "../lib/utils";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChannelScreen() {
  const { activeChannelId, toggleRightPanel } = useUIStore(
    useShallow((s) => ({
      activeChannelId: s.activeChannelId,
      toggleRightPanel: s.toggleRightPanel,
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
  const updateChannel = useUpdateChannel();
  const replaceMembers = useReplaceChannelMembers();
  const deleteChannel = useDeleteChannel();
  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [privateChannel, setPrivateChannel] = useState(false);
  const [channelMemberIds, setChannelMemberIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

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

  function saveEdit() {
    if (!channel || !editingId || !editDraft.trim()) return;
    updateMessage.mutate(
      { messageId: editingId, channelId: channel.id, content: editDraft.trim() },
      { onSuccess: () => setEditingId(null) },
    );
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
          <Button variant="ghost" size="icon">
            <Search className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
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
          {messages && messages.length > 0 ? (
            messages.map((m) => {
              const isMe = m.senderId === user?.id;
              const author = m.senderId.slice(0, 8);
              return (
                <div key={m.id} className={cn("flex gap-3", isMe && "flex-row-reverse")}>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{author.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className={cn("flex max-w-[80%] flex-col", isMe && "items-end")}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text">{author}</span>
                      <span className="text-xs text-text-muted">{formatTime(m.createdAt)}</span>
                    </div>
                    {editingId === m.id ? (
                      <div className="mt-1 flex items-center gap-1">
                        <Input
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit();
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          className="h-8"
                          autoFocus
                        />
                        <Button size="icon" variant="ghost" onClick={saveEdit} aria-label="Save message"><Check className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel edit"><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <div className="group flex items-center gap-1">
                        <div
                          className={cn(
                            "mt-0.5 rounded-lg px-3 py-2 text-sm",
                            isMe ? "bg-primary text-white" : "bg-surface-elevated text-text",
                            m.deletedAt && "italic opacity-60",
                          )}
                        >
                          {m.deletedAt ? "Message deleted" : m.content}
                          {m.editedAt && !m.deletedAt ? <span className="ml-1 text-[10px] opacity-70">(edited)</span> : null}
                          {m.attachments.map((attachment) => <MessageAttachment key={attachment.id} fileId={attachment.fileId} />)}
                        </div>
                        {isMe && !m.deletedAt ? (
                          <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                            <Button size="icon" variant="ghost" onClick={() => { setEditingId(m.id); setEditDraft(m.content); }} aria-label="Edit message"><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => channel && deleteMessage.mutate({ messageId: m.id, channelId: channel.id })} aria-label="Delete message"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
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
            <Button variant="ghost" size="icon">
              <Smile className="h-4 w-4" />
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
