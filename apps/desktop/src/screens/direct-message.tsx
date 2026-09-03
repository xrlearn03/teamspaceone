import { useState } from "react";
import {
  Info,
  MoreHorizontal,
  Paperclip,
  Phone,
  Search,
  Send,
  Smile,
  Video,
} from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import { useChannels, useMe, useMessages, useSendMessage } from "../hooks/api";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { cn } from "../lib/utils";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function DirectMessageScreen() {
  const { activeChannelId, toggleRightPanel } = useUIStore(
    useShallow((s) => ({
      activeChannelId: s.activeChannelId,
      toggleRightPanel: s.toggleRightPanel,
    })),
  );

  const { data: user } = useMe();
  const { data: channels } = useChannels();
  const directChannels = channels?.filter((c) => c.type === "direct") ?? [];
  const contact =
    directChannels.find((c) => c.id === activeChannelId) ??
    directChannels[0];
  const { data: messages } = useMessages(contact?.id);
  const sendMessage = useSendMessage();
  const [draft, setDraft] = useState("");

  function send() {
    if (!contact || !draft.trim()) return;
    sendMessage.mutate({ channelId: contact.id, content: draft.trim() });
    setDraft("");
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
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-4">
          {messages && messages.length > 0 ? (
            messages.map((m) => {
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
                    <div className={cn(
                      "mt-0.5 rounded-lg px-3 py-2 text-sm",
                      isMe ? "bg-primary text-white" : "bg-surface-elevated text-text"
                    )}>
                      {m.content}
                    </div>
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
            <Button variant="ghost" size="icon">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Smile className="h-4 w-4" />
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
