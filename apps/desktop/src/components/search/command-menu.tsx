import { useMemo, useState } from "react";
import {
  Calendar,
  FileText,
  Folder,
  Hash,
  Search,
  User,
  X,
} from "lucide-react";
import { useUIStore, type View } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import { useChannels, useFiles, useMeetings, useProjects } from "../../hooks/api";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import type { LucideIcon } from "lucide-react";

interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  view?: string;
  params?: { channelId?: string; projectId?: string; meetingId?: string };
}

const filters = ["All", "Messages", "Channels", "Files", "Projects", "Meetings"];

function formatTime(iso?: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState(0);
  const { setActiveView, setSearchOpen } = useUIStore(
    useShallow((s) => ({ setActiveView: s.setActiveView, setSearchOpen: s.setSearchOpen })),
  );

  const { data: channels } = useChannels();
  const { data: projects } = useProjects();
  const { data: meetings } = useMeetings();
  const { data: files } = useFiles();

  const publicChannels = channels?.filter((c) => c.type !== "direct") ?? [];
  const directChannels = channels?.filter((c) => c.type === "direct") ?? [];

  const results: SearchResult[] = useMemo(() => {
    const all: SearchResult[] = [
      ...publicChannels.map((c) => ({
        id: c.id,
        type: "Channel",
        title: `#${c.name}`,
        subtitle: "Workspace channel",
        icon: Hash,
        view: "channel",
        params: { channelId: c.id },
      })),
      ...directChannels.map((c) => ({
        id: c.id,
        type: "Message",
        title: c.name,
        subtitle: "Direct message",
        icon: User,
        view: "dm",
        params: { channelId: c.id },
      })),
      ...(projects ?? []).map((p) => ({
        id: p.id,
        type: "Project",
        title: p.name,
        subtitle: `Status: ${p.status}`,
        icon: Folder,
        view: "project",
        params: { projectId: p.id },
      })),
      ...(meetings ?? []).map((m) => ({
        id: m.id,
        type: "Meeting",
        title: m.title,
        subtitle: m.scheduledAt ? `Today at ${formatTime(m.scheduledAt)}` : m.status,
        icon: Calendar,
        view: "meeting",
        params: { meetingId: m.id },
      })),
      ...(files ?? []).map((f) => ({
        id: f.id,
        type: "File",
        title: f.originalName,
        subtitle: "Shared file",
        icon: FileText,
        view: "files",
      })),
    ];

    const q = query.toLowerCase();
    return all.filter((r) => {
      const matchesQuery = r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q);
      const matchesFilter =
        filter === "All" ||
        filter === r.type ||
        (filter === "Channels" && r.type === "Channel");
      return matchesQuery && matchesFilter;
    });
  }, [query, filter, publicChannels, directChannels, projects, meetings, files]);

  function activate(result: SearchResult) {
    if (result.view) {
      setActiveView(result.view as View, result.params ?? {});
    }
    setSearchOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[30%] max-w-2xl -translate-y-1/3 p-0">
        <DialogTitle className="sr-only">Global search</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 text-text-muted" />
          <Input
            placeholder="Search messages, channels, files, tasks..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(0);
            }}
            onKeyDown={(e) => {
              if (results.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => (s + 1) % results.length);
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => (s - 1 + results.length) % results.length);
              }
              if (e.key === "Enter") {
                e.preventDefault();
                activate(results[selected]);
              }
            }}
            className="border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
            autoFocus
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text"
            aria-label="Close search"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto border-b px-3 py-2">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFilter(f);
                setSelected(0);
              }}
              className={cn(
                "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f
                  ? "bg-primary-subtle text-primary"
                  : "bg-surface-elevated text-text-secondary hover:bg-border",
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {query.length === 0 && (
            <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Type to search
            </div>
          )}

          {results.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-muted">
              No results found for "{query}"
            </div>
          ) : (
            <div className="space-y-0.5">
              {results.map((r, idx) => {
                const Icon = r.icon;
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    type="button"
                    onClick={() => activate(r)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      selected === idx
                        ? "bg-primary-subtle text-primary"
                        : "text-text hover:bg-surface-elevated",
                    )}
                    onMouseEnter={() => setSelected(idx)}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.title}</div>
                      <div className="truncate text-xs text-text-muted">{r.subtitle}</div>
                    </div>
                    <Badge variant="secondary">{r.type}</Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-text-muted">
          <span>{results.length} results</span>
          <div className="flex gap-3">
            <span>↑↓ to navigate</span>
            <span>↵ to open</span>
            <span>esc to close</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
