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
import { directMessages, messages } from "../lib/data";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { cn } from "../lib/utils";

const statusClasses: Record<string, string> = {
  online: "bg-online",
  away: "bg-away",
  offline: "bg-offline",
};

export function DirectMessageScreen() {
  const { activeChannelId, toggleRightPanel } = useUIStore(
    useShallow((s) => ({
      activeChannelId: s.activeChannelId,
      toggleRightPanel: s.toggleRightPanel,
    })),
  );

  const contact =
    directMessages.find((dm) => dm.id === activeChannelId) ??
    directMessages[0];
  const [draft, setDraft] = useState("");

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{contact.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span
              className={cn(
                "absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-surface",
                statusClasses[contact.status],
              )}
            />
          </div>
          <div>
            <h1 className="text-base font-semibold text-text">{contact.name}</h1>
            <p className="text-xs text-text-muted capitalize">{contact.status}</p>
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
          {messages.slice(0, 2).map((m) => (
            <div key={m.id} className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{m.author.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="flex max-w-[80%] flex-col">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-text">{m.author}</span>
                  <span className="text-xs text-text-muted">{m.time}</span>
                </div>
                <div className="mt-0.5 rounded-lg bg-surface-elevated px-3 py-2 text-sm text-text">
                  {m.content}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-text-muted">
          <span className="h-px w-12 bg-border" />
          <span>Last active 10 minutes ago</span>
          <span className="h-px w-12 bg-border" />
        </div>
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2 rounded-lg border bg-surface p-2">
          <div className="flex-1">
            <Input
              placeholder={`Message ${contact.name}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
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
            <Button size="icon" onClick={() => setDraft("")}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
