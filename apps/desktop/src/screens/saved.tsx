import { useState, useEffect, useMemo } from "react";
import { Bookmark, Hash, Trash2 } from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useChannels, useUsers } from "../hooks/api";
import { getSavedMessages, toggleSavedMessage, type SavedMessage } from "../lib/message-local";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { MessageContent } from "../components/chat/message-content";
import { getUserDisplayName } from "../lib/utils";

export function SavedItemsScreen() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: channels } = useChannels();
  const [items, setItems] = useState<SavedMessage[]>([]);
  const senderIds = useMemo(() => [...new Set(items.map((i) => i.senderId))], [items]);
  const { data: users } = useUsers(senderIds);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  useEffect(() => {
    setItems(getSavedMessages().slice().reverse());
  }, []);

  function unsave(item: SavedMessage) {
    toggleSavedMessage({ id: item.id, channelId: item.channelId, content: item.content, senderId: item.senderId, createdAt: item.createdAt });
    setItems(getSavedMessages().slice().reverse());
  }

  function open(item: SavedMessage) {
    const channel = channels?.find((c) => c.id === item.channelId);
    setActiveView(channel?.type === "direct" ? "dm" : "channel", { channelId: item.channelId });
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center gap-3 border-b px-6">
        <Bookmark className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-text">Saved items</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <EmptyState icon={Bookmark} title="Nothing saved" description="Save messages from any channel or conversation using the bookmark action." />
        ) : (
          <div className="mx-auto max-w-2xl space-y-2">
            {items.map((item) => {
              const channel = channels?.find((c) => c.id === item.channelId);
              return (
                <div key={item.id} className="group flex items-start gap-3 rounded-lg border bg-surface p-3">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-[10px]">{getUserDisplayName(userMap.get(item.senderId)).slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <button type="button" onClick={() => open(item)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <Hash className="h-3 w-3" />
                      <span>{channel?.name ?? "Unknown channel"}</span>
                      <span>·</span>
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-text">
                      <MessageContent content={item.content} />
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => unsave(item)}
                    aria-label="Remove from saved items"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
