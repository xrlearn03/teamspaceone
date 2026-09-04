import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  FileText,
  Folder,
  Hash,
  History,
  MessageSquare,
  Search,
  SlidersHorizontal,
  User,
  X,
} from "lucide-react";
import { useUIStore, type View } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import {
  useChannels,
  useFiles,
  useMeetings,
  useMembers,
  useProjects,
  useSearch,
  useWorkspaces,
} from "../../hooks/api";
import { getActiveOrganisation, type SearchResult as ApiSearchResult } from "../../lib/api";
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
  preview?: string;
  icon: LucideIcon;
  view?: string;
  params?: { channelId?: string; projectId?: string; meetingId?: string };
}

const filters = ["All", "Messages", "Channels", "Files", "Projects", "Meetings"];

const TYPE_MAP: Record<string, { icon: LucideIcon; label: string; view: string }> = {
  message: { icon: MessageSquare, label: "Message", view: "channel" },
  channel: { icon: Hash, label: "Channel", view: "channel" },
  task: { icon: Folder, label: "Task", view: "project" },
  project: { icon: Folder, label: "Project", view: "project" },
  file: { icon: FileText, label: "File", view: "files" },
  meeting: { icon: Calendar, label: "Meeting", view: "meeting" },
};

function recentSearches(): string[] {
  try {
    const raw = localStorage.getItem(`teamspace-one:${getActiveOrganisation() ?? "none"}:recentSearches`);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecentSearch(q: string) {
  const list = [q, ...recentSearches().filter((item) => item !== q)].slice(0, 8);
  localStorage.setItem(`teamspace-one:${getActiveOrganisation() ?? "none"}:recentSearches`, JSON.stringify(list));
}

const selectClass = "h-7 rounded-md border bg-surface px-2 text-xs text-text";

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
  const [showFilters, setShowFilters] = useState(false);
  const [authorId, setAuthorId] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [serverResults, setServerResults] = useState<ApiSearchResult[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const searchMutation = useSearch();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setActiveView, setSearchOpen } = useUIStore(
    useShallow((s) => ({ setActiveView: s.setActiveView, setSearchOpen: s.setSearchOpen })),
  );

  const organisationId = useUIStore((s) => s.organisationId) ?? undefined;
  const { data: channels } = useChannels();
  const { data: projects } = useProjects();
  const { data: meetings } = useMeetings();
  const { data: files } = useFiles();
  const { data: members } = useMembers(organisationId);
  const { data: workspaces } = useWorkspaces(organisationId);

  useEffect(() => {
    if (open) setRecents(recentSearches());
  }, [open]);

  // Debounced server-side search so messages/tasks content is included.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (!q && !authorId && !workspaceId && !fromDate && !toDate) {
      setServerResults([]);
      return;
    }
    searchTimer.current = setTimeout(() => {
      searchMutation.mutate(
        {
          query: q,
          filters: {
            types: filter !== "All" ? [filter.toLowerCase().replace(/s$/, "")] : undefined,
            workspaceId: workspaceId || undefined,
            authorId: authorId || undefined,
            from: fromDate ? new Date(fromDate).toISOString() : undefined,
            to: toDate ? new Date(`${toDate}T23:59:59`).toISOString() : undefined,
          },
        },
        { onSuccess: setServerResults, onError: () => setServerResults([]) },
      );
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query, filter, authorId, workspaceId, fromDate, toDate]);

  const publicChannels = channels?.filter((c) => c.type !== "direct") ?? [];
  const directChannels = channels?.filter((c) => c.type === "direct") ?? [];

  const results: SearchResult[] = useMemo(() => {
    const local: SearchResult[] = [
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
        subtitle:
          m.status === "started"
            ? "Live"
            : m.status === "ended"
              ? "Ended"
              : m.scheduledAt
                ? new Date(m.scheduledAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                : "Upcoming",
        icon: Calendar,
        view: m.type === "voice_room" ? "voice" : "meeting",
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

    const remote: SearchResult[] = serverResults.map((r) => {
      const meta = TYPE_MAP[r.resourceType] ?? { icon: FileText, label: r.resourceType, view: "channel" };
      const metadata = (r.metadata ?? {}) as { channelId?: string; projectId?: string };
      const view = r.resourceType === "message" ? "channel" : meta.view;
      const params =
        r.resourceType === "message"
          ? { channelId: metadata.channelId ?? r.resourceId }
          : r.resourceType === "channel"
            ? { channelId: r.resourceId }
            : r.resourceType === "project"
              ? { projectId: r.resourceId }
              : r.resourceType === "task"
                ? { projectId: metadata.projectId }
                : r.resourceType === "meeting"
                  ? { meetingId: r.resourceId }
                  : {};
      return {
        id: `api-${r.id}`,
        type: meta.label,
        title: r.title ?? r.content.slice(0, 60) ?? r.resourceId,
        subtitle: `${meta.label} · ${new Date(r.updatedAt).toLocaleDateString()}`,
        preview: r.content,
        icon: meta.icon,
        view,
        params,
      };
    });

    const q = query.toLowerCase();
    const all = [...local, ...remote];
    return all.filter((r) => {
      const matchesQuery = !q || r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q) || (r.preview ?? "").toLowerCase().includes(q);
      const matchesFilter =
        filter === "All" ||
        filter === r.type ||
        (filter === "Channels" && r.type === "Channel") ||
        (filter === "Messages" && (r.type === "Message" || r.type === "message"));
      return matchesQuery && matchesFilter;
    });
  }, [query, filter, publicChannels, directChannels, projects, meetings, files, serverResults]);

  const selectedResult = results[Math.min(selected, results.length - 1)];

  function activate(result: SearchResult) {
    if (query.trim()) {
      pushRecentSearch(query.trim());
      setRecents(recentSearches());
    }
    if (result.view) {
      setActiveView(result.view as View, result.params ?? {});
    }
    setSearchOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[30%] max-w-3xl -translate-y-1/3 p-0">
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
            onClick={() => setShowFilters((v) => !v)}
            className={cn("rounded p-1 hover:bg-surface-elevated", showFilters ? "text-primary" : "text-text-muted")}
            aria-label="Toggle filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
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

        {showFilters ? (
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
            <select className={selectClass} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} aria-label="Workspace filter">
              <option value="">All workspaces</option>
              {workspaces?.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <select className={selectClass} value={authorId} onChange={(e) => setAuthorId(e.target.value)} aria-label="Author filter">
              <option value="">Any author</option>
              {members?.map((m) => (
                <option key={m.userId} value={m.userId}>{m.userId.slice(0, 12)}</option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-text-muted">
              From
              <Input type="date" className="h-7 w-36 text-xs" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="flex items-center gap-1 text-xs text-text-muted">
              To
              <Input type="date" className="h-7 w-36 text-xs" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
            {(authorId || workspaceId || fromDate || toDate) ? (
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => { setAuthorId(""); setWorkspaceId(""); setFromDate(""); setToDate(""); }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex min-h-0">
          <div className="max-h-96 flex-1 overflow-y-auto p-2">
            {query.length === 0 && recents.length > 0 ? (
              <div className="mb-2">
                <div className="mb-1 flex items-center gap-1 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <History className="h-3 w-3" />
                  Recent searches
                </div>
                {recents.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setQuery(r)}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-elevated hover:text-text"
                  >
                    {r}
                  </button>
                ))}
              </div>
            ) : null}
            {query.length === 0 && recents.length === 0 && (
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                Type to search
              </div>
            )}

            {results.length === 0 ? (
              <div className="py-8 text-center text-sm text-text-muted">
                No results found{query ? ` for "${query}"` : ""}
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
          {selectedResult ? (
            <div className="hidden w-64 shrink-0 border-l p-3 sm:block">
              <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Preview</p>
              <p className="mt-2 text-sm font-medium text-text">{selectedResult.title}</p>
              <p className="mt-1 line-clamp-6 text-xs text-text-secondary">
                {selectedResult.preview ?? selectedResult.subtitle}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-text-muted">
          <span>{results.length} results{searchMutation.isPending ? " · searching…" : ""}</span>
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
