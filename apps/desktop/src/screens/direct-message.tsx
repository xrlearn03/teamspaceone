import { useState } from "react";
import {
  Check,
  Info,
  Paperclip,
  Pencil,
  Phone,
  Search,
  Send,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import { useChannels, useCreateMeeting, useCreateVoiceRoom, useDeleteMessage, useMe, useMessages, useSendMessage, useUpdateMessage, useUploadFile } from "../hooks/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { MessageAttachment } from "../components/ui/message-attachment";
import { cn } from "../lib/utils";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  const directChannels = channels?.filter((c) => c.type === "direct") ?? [];
  const contact =
    directChannels.find((c) => c.id === activeChannelId) ??
    directChannels[0];
  const { data: messages, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(contact?.id);
  const sendMessage = useSendMessage();
  const updateMessage = useUpdateMessage();
  const deleteMessage = useDeleteMessage();
  const uploadFile = useUploadFile();
  const createMeeting = useCreateMeeting();
  const createVoiceRoom = useCreateVoiceRoom();
  const [draft, setDraft] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  function send() {
    if (!contact || !draft.trim()) return;
    sendMessage.mutate({ channelId: contact.id, content: draft.trim() });
    setDraft("");
  }

  function attach(file?: File) {
    if (!file || !contact) return;
    uploadFile.mutate(file, {
      onSuccess: (uploaded) => sendMessage.mutate({ channelId: contact.id, content: "", attachmentIds: [uploaded.id] }),
    });
  }

  function startCall(video: boolean) {
    if (!contact) return;
    const title = `${contact.name} ${video ? "video call" : "voice call"}`;
    if (video) createMeeting.mutate({ title }, { onSuccess: (meeting) => setActiveView("meeting", { meetingId: meeting.id }) });
    else createVoiceRoom.mutate({ title }, { onSuccess: (meeting) => setActiveView("voice", { meetingId: meeting.id }) });
  }

  function saveEdit() {
    if (!contact || !editingId || !editDraft.trim()) return;
    updateMessage.mutate(
      { messageId: editingId, channelId: contact.id, content: editDraft.trim() },
      { onSuccess: () => setEditingId(null) },
    );
  }

  const visibleMessages = searchQuery.trim() ? messages?.filter((message) => message.content.toLowerCase().includes(searchQuery.trim().toLowerCase())) : messages;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {contact?.name?.charAt(0).toUpperCase() ?? "?"}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface",
                "bg-online",
              )}
            />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text">{contact?.name ?? "Direct message"}</h1>
            <p className="text-xs text-text-muted capitalize">online</p>
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

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {hasNextPage ? (
          <div className="mb-3 text-center"><Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchingNextPage ? "Loading…" : "Load older messages"}</Button></div>
        ) : null}
        <div className="space-y-4">
          {visibleMessages && visibleMessages.length > 0 ? (
            visibleMessages.map((m) => {
              const isMe = m.senderId === user?.id;
              const author = isMe ? "You" : m.senderId.slice(0, 8);
              return (
                <div key={m.id} className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{author.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex max-w-[80%] flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text">{author}</span>
                      <span className="text-xs text-text-muted">{formatTime(m.createdAt)}</span>
                    </div>
                    {editingId === m.id ? (
                      <div className="mt-1 flex items-center gap-1">
                        <Input value={editDraft} onChange={(e) => setEditDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }} className="h-8" autoFocus />
                        <Button size="icon" variant="ghost" onClick={saveEdit} aria-label="Save message"><Check className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} aria-label="Cancel edit"><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <div className="group flex items-center gap-1">
                        <div className={cn("mt-0.5 rounded-lg px-3 py-2 text-sm", isMe ? "bg-primary text-white" : "bg-surface-elevated text-text", m.deletedAt && "italic opacity-60")}>
                          {m.deletedAt ? "Message deleted" : m.content}
                          {m.editedAt && !m.deletedAt ? <span className="ml-1 text-[10px] opacity-70">(edited)</span> : null}
                          {m.attachments.map((attachment) => <MessageAttachment key={attachment.id} fileId={attachment.fileId} />)}
                        </div>
                        {isMe && !m.deletedAt ? (
                          <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                            <Button size="icon" variant="ghost" onClick={() => { setEditingId(m.id); setEditDraft(m.content); }} aria-label="Edit message"><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => contact && deleteMessage.mutate({ messageId: m.id, channelId: contact.id })} aria-label="Delete message"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="py-8 text-center text-sm text-text-muted">No messages yet.</p>
          )}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-text-muted">
          <span className="h-px w-12 bg-border" />
          <span>End-to-end encrypted</span>
          <span className="h-px w-12 bg-border" />
        </div>
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2 rounded-lg border bg-surface p-2">
          <div className="flex-1">
            <Input
              placeholder={`Message ${contact?.name ?? "contact"}`}
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
            <Button size="icon" onClick={send} disabled={!contact || sendMessage.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
