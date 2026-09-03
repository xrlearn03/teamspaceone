import { useMemo, useState } from "react";
import {
  Calendar,
  FileText,
  Folder,
  Hash,
  MessageSquare,
  Search,
  User,
  X,
  CheckSquare,
} from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { channels, directMessages, projects, tasks, meetings } from "../../lib/data";
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
}

const filters = ["All", "Messages", "Channels", "Files", "Projects", "Tasks", "Meetings", "People"];
const recentSearches = ["brand refresh", "homepage wireframes", "@sarah"];

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
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setSearchOpen = useUIStore((s) => s.setSearchOpen);

  const results: SearchResult[] = useMemo(() => {
    const all: SearchResult[] = [
      ...channels.map((c) => ({
        id: c.id,
        type: "Channel",
        title: `#${c.name}`,
        subtitle: "Workspace channel",
        icon: Hash,
        view: "channel",
      })),
      ...directMessages.map((dm) => ({
        id: dm.id,
        type: "Person",
        title: dm.name,
        subtitle: "Direct message",
        icon: User,
        view: "dm",
      })),
      ...projects.map((p) => ({
        id: p.id,
        type: "Project",
        title: p.name,
        subtitle: `Status: ${p.status}`,
        icon: Folder,
        view: "project",
      })),
      ...tasks.map((t) => ({
        id: t.id,
        type: "Task",
        title: t.title,
        subtitle: `${t.status} · ${t.assignee}`,
        icon: CheckSquare,
      })),
      ...meetings.map((m) => ({
        id: m.id,
        type: "Meeting",
        title: m.title,
        subtitle: `Today at ${m.time}`,
        icon: Calendar,
      })),
      { id: "f-1", type: "File", title: "brand-guidelines-v3.pdf", subtitle: "Shared in #design", icon: FileText },
      { id: "f-2", type: "File", title: "homepage-wireframes.fig", subtitle: "Shared in #design", icon: FileText },
    ];

    const q = query.toLowerCase();
    return all.filter((r) => {
      const matchesQuery = r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q);
      const matchesFilter = filter === "All" || filter === r.type || (filter === "Messages" && r.type === "Person");
      return matchesQuery && matchesFilter;
    });
  }, [query, filter]);

  function activate(result: SearchResult) {
    if (result.view) {
      setActiveView(result.view as any, { channelId: result.id, projectId: result.id });
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
              Recent searches
            </div>
          )}
          {query.length === 0 &&
            recentSearches.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => setQuery(term)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-surface-elevated"
              >
                <MessageSquare className="h-4 w-4 text-text-muted" />
                {term}
              </button>
            ))}

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
