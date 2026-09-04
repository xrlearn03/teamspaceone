import { useState } from "react";
import {
  Info,
  Paperclip,
  Phone,
  Search,
  Send,
  Video,
} from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import { useChannels, useCreateMeeting, useCreateVoiceRoom, useDeleteMessage, useMe, useMessages, useSendMessage, useUpdateMessage, useUploadFile } from "../hooks/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { MessageItem } from "../components/chat/message";
import { ThreadPanel } from "../components/chat/thread-panel";
import { cn } from "../lib/utils";
import type { Message } from "../lib/api";

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
  const [threadMessage, setThreadMessage] = useState<Message | null>(null);

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

      <div className="flex min-h-0 flex-1">
        <div className="flex flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {hasNextPage ? (
              <div className="mb-3 text-center"><Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>{isFetchingNextPage ? "Loading…" : "Load older messages"}</Button></div>
            ) : null}
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

        {threadMessage && contact ? (
          <ThreadPanel
            channelId={contact.id}
            parentMessage={threadMessage}
            onClose={() => setThreadMessage(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
