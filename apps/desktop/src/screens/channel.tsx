import { useState } from "react";
import {
  Hash,
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

export function ChannelScreen() {
  const { activeChannelId, toggleRightPanel } = useUIStore(
    useShallow((s) => ({
      activeChannelId: s.activeChannelId,
      toggleRightPanel: s.toggleRightPanel,
    })),
  );

  const { data: user } = useMe();
  const { data: channels } = useChannels();
  const channel =
    channels?.find((c) => c.id === activeChannelId) ?? channels?.[0];
  const { data: messages } = useMessages(channel?.id);
  const sendMessage = useSendMessage();
  const [draft, setDraft] = useState("");

  function send() {
    if (!channel || !draft.trim()) return;
    sendMessage.mutate({ channelId: channel.id, content: draft.trim() });
    setDraft("");
  }

  return (
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
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
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
                    <div
                      className={cn(
                        "mt-0.5 rounded-lg px-3 py-2 text-sm",
                        isMe
                          ? "bg-primary text-white"
                          : "bg-surface-elevated text-text",
                      )}
                    >
                      {m.content}
                    </div>
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
            <Button variant="ghost" size="icon">
              <Paperclip className="h-4 w-4" />
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
  );
}
