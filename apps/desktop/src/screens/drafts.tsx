import { useState, useEffect } from "react";
import { FileEdit, Hash, Trash2 } from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useChannels } from "../hooks/api";
import { listDrafts, setDraft } from "../lib/message-local";
import { Button } from "@teamspace-one/ui/button";
import { EmptyState } from "@teamspace-one/ui/empty-state";

interface DraftRow {
  key: string;
  value: string;
  updatedAt: string;
  channelId?: string;
}

export function DraftsScreen() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: channels } = useChannels();
  const [drafts, setDrafts] = useState<DraftRow[]>([]);

  useEffect(() => {
    const all = listDrafts();
    setDrafts(
      Object.entries(all)
        .map(([key, entry]) => ({
          key,
          value: entry.value,
          updatedAt: entry.updatedAt,
          channelId: key.startsWith("channel:")
            ? key.slice("channel:".length)
            : key.startsWith("thread:")
              ? key.split(":")[1]
              : undefined,
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    );
  }, []);

  function open(row: DraftRow) {
    if (!row.channelId) return;
    const channel = channels?.find((c) => c.id === row.channelId);
    setActiveView(channel?.type === "direct" ? "dm" : "channel", { channelId: row.channelId });
  }

  function remove(row: DraftRow) {
    setDraft(row.key, "");
    setDrafts((current) => current.filter((d) => d.key !== row.key));
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center gap-3 border-b px-3 sm:px-6">
        <FileEdit className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-text">Drafts</h1>
      </header>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
        {drafts.length === 0 ? (
          <EmptyState icon={FileEdit} title="No drafts" description="Unsent messages are saved here automatically while you type." />
        ) : (
          <div className="mx-auto max-w-2xl space-y-2">
            {drafts.map((row) => {
              const channel = channels?.find((c) => c.id === row.channelId);
              return (
                <div key={row.key} className="group flex items-start gap-3 rounded-lg border bg-surface p-3">
                  <button type="button" onClick={() => open(row)} className="min-w-0 flex-1 text-left" disabled={!row.channelId}>
                    <div className="flex items-center gap-2 text-xs text-text-muted">
                      <Hash className="h-3 w-3" />
                      <span>{channel?.name ?? (row.key.startsWith("thread:") ? "Thread reply" : "Unknown channel")}</span>
                      {row.updatedAt ? (
                        <>
                          <span>·</span>
                          <span>{new Date(row.updatedAt).toLocaleString()}</span>
                        </>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-text-secondary">{row.value}</p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => remove(row)}
                    aria-label="Delete draft"
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
