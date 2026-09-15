import { useMemo, useState } from "react";
import {
  Archive,
  CalendarClock,
  ChevronDown,
  CirclePlay,
  Clock,
  Download,
  Plus,
  Search,
  Sparkles,
  Users,
  Video,
} from "lucide-react";
import { cn } from "../../lib/utils";
import type { InterviewSession } from "../../lib/api";
import {
  useCandidates,
  useInterviewSessions,
  useJobOpenings,
  useUsers,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import { useUIStore } from "../../stores/ui";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { CreateSessionDialog } from "./create-dialogs";
import { AiInterviewButton } from "./ai-interview-dialog";

const PAGE_SIZES = [10, 25, 50];

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

type SessionTab = "all" | "scheduled" | "in_progress" | "completed" | "cancelled";
type DateRange = "all" | "today" | "week" | "month";

const DATE_RANGES: Array<{ id: DateRange; label: string }> = [
  { id: "all", label: "All dates" },
  { id: "today", label: "Today" },
  { id: "week", label: "Next 7 days" },
  { id: "month", label: "This month" },
];

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function initials(name?: string) {
  const parts = (name ?? "").trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

function formatTime(date: Date) {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDateRange(session: InterviewSession) {
  if (!session.scheduledAt) return { date: "Unscheduled", time: "—" };
  const start = new Date(session.scheduledAt);
  const end = new Date(start.getTime() + (session.durationMin || 60) * 60_000);
  return {
    date: start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    time: `${formatTime(start)} – ${formatTime(end)}`,
  };
}

function isToday(iso?: string | null) {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function inRange(session: InterviewSession, range: DateRange) {
  if (range === "all") return true;
  if (!session.scheduledAt) return false;
  const d = new Date(session.scheduledAt).getTime();
  const now = new Date();
  if (range === "today") return isToday(session.scheduledAt);
  if (range === "week") {
    const end = now.getTime() + 7 * 86_400_000;
    return d >= now.setHours(0, 0, 0, 0) && d <= end;
  }
  return new Date(session.scheduledAt).getMonth() === now.getMonth() &&
    new Date(session.scheduledAt).getFullYear() === now.getFullYear();
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportCsv(sessions: InterviewSession[]) {
  const header = ["Candidate", "Email", "Role", "Type", "Date", "Time", "Status"];
  const lines = sessions.map((s) => {
    const { date, time } = formatDateRange(s);
    return [
      s.candidate?.name ?? "",
      s.candidate?.email ?? "",
      s.jobOpening?.title ?? "",
      s.interviewType,
      date,
      time,
      statusLabel(s.status),
    ]
      .map(csvCell)
      .join(",");
  });
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "interviews.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function InterviewsBoard() {
  const { data: sessions, isLoading, isError, refetch } = useInterviewSessions();
  const { data: candidates } = useCandidates();
  const { data: jobs } = useJobOpenings();
  const { can } = usePermissions();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const canConduct = can("interview.interview.conduct");

  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<SessionTab>("all");
  const [range, setRange] = useState<DateRange>("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const all = useMemo(
    () =>
      [...(sessions ?? [])].sort(
        (a, b) => new Date(a.scheduledAt ?? 0).getTime() - new Date(b.scheduledAt ?? 0).getTime(),
      ),
    [sessions],
  );

  const counts = useMemo(
    () => ({
      total: all.length,
      scheduled: all.filter((s) => s.status === "scheduled").length,
      inProgress: all.filter((s) => s.status === "in_progress").length,
      completed: all.filter((s) => s.status === "completed").length,
      cancelled: all.filter((s) => s.status === "cancelled").length,
      newThisWeek: all.filter(
        (s) => Date.now() - new Date(s.createdAt).getTime() < 7 * 86_400_000,
      ).length,
    }),
    [all],
  );

  const typeOptions = useMemo(
    () => [...new Set(all.map((s) => s.interviewType))],
    [all],
  );

  const todaysSessions = useMemo(
    () => all.filter((s) => isToday(s.scheduledAt)),
    [all],
  );

  // Interviewer workload: sessions conducted per participant, top 5.
  const interviewerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of all) for (const p of s.participants ?? []) ids.add(p.userId);
    return [...ids];
  }, [all]);
  const { data: interviewerUsers } = useUsers(interviewerIds);

  const performance = useMemo(() => {
    const countByUser = new Map<string, number>();
    for (const s of all) {
      if (s.status === "cancelled") continue;
      for (const p of s.participants ?? []) {
        countByUser.set(p.userId, (countByUser.get(p.userId) ?? 0) + 1);
      }
    }
    const nameByUser = new Map(
      (interviewerUsers ?? []).map((u) => [
        u.id,
        [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email,
      ]),
    );
    const ranked = [...countByUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const max = ranked[0]?.[1] ?? 1;
    return ranked.map(([userId, count]) => ({
      userId,
      name: nameByUser.get(userId) ?? "Interviewer",
      count,
      pct: Math.round((count / max) * 100),
    }));
  }, [all, interviewerUsers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((s) => {
      if (tab !== "all" && s.status !== tab) return false;
      if (!inRange(s, range)) return false;
      if (typeFilter !== "all" && s.interviewType !== typeFilter) return false;
      if (!q) return true;
      return [s.candidate?.name ?? "", s.candidate?.email ?? "", s.jobOpening?.title ?? "", s.interviewType]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [all, search, tab, range, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageIds = pageRows.map((s) => s.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const metrics = [
    {
      title: "Total Interviews",
      value: counts.total,
      change: counts.newThisWeek > 0 ? `+${counts.newThisWeek}` : undefined,
      footer: "new this week",
      icon: <CalendarClock size={28} />,
      iconClass: "bg-info/10 text-info",
    },
    {
      title: "Scheduled",
      value: counts.scheduled,
      footer: "upcoming",
      icon: <Clock size={28} />,
      iconClass: "bg-primary/10 text-primary",
    },
    {
      title: "In Progress",
      value: counts.inProgress,
      footer: "live now",
      icon: <CirclePlay size={28} />,
      iconClass: "bg-mention/10 text-mention",
    },
    {
      title: "Completed",
      value: counts.completed,
      footer: "all time",
      icon: <Archive size={28} />,
      iconClass: "bg-success/10 text-success",
    },
  ];

  const tabs: Array<{ id: SessionTab; label: string; count: number }> = [
    { id: "all", label: "All", count: counts.total },
    { id: "scheduled", label: "Scheduled", count: counts.scheduled },
    { id: "in_progress", label: "In Progress", count: counts.inProgress },
    { id: "completed", label: "Completed", count: counts.completed },
    { id: "cancelled", label: "Cancelled", count: counts.cancelled },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-text">Interviews</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Schedule, conduct and track interviews with ease.
          </p>
        </div>
        {can("interview.interview.schedule") ? (
          <CreateSessionDialog
            candidates={candidates ?? []}
            jobs={jobs ?? []}
            trigger={
              <button className="flex h-11 items-center gap-2.5 rounded-lg bg-gradient-to-r from-[#3048ff] to-[#4625f5] px-6 text-[13px] font-medium text-white shadow-[0_10px_35px_rgba(45,63,255,.25)] transition hover:brightness-110">
                <Plus size={16} />
                Schedule Interview
              </button>
            }
          />
        ) : null}
      </header>

      {/* KPI cards */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.title} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
                  m.iconClass,
                )}
              >
                {m.icon}
              </div>
              <div>
                <p className="text-[13px] text-text-secondary">{m.title}</p>
                <div className="mt-1 flex items-center gap-2.5">
                  <span className="text-2xl font-semibold tracking-tight text-text">{m.value}</span>
                  {m.change ? (
                    <span className="text-[12px] font-medium text-success">{m.change}</span>
                  ) : null}
                </div>
                <p className="text-[11px] text-text-muted">{m.footer}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Tabs + controls */}
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex gap-8 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={cn(
                "relative h-11 shrink-0 text-[13px]",
                tab === t.id ? "font-medium text-primary" : "text-text-muted hover:text-text",
              )}
            >
              {t.label} ({t.count})
              {tab === t.id && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-[3px] rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 xl:min-w-[220px]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search candidate, role..."
              className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-4 text-[13px] text-text outline-none placeholder:text-text-muted focus:border-primary/50"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-11 items-center gap-2.5 rounded-lg border border-border bg-surface px-4 text-[13px] text-text transition hover:border-primary/40"
              >
                <CalendarClock size={15} className="text-text-muted" />
                {DATE_RANGES.find((r) => r.id === range)?.label}
                <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {DATE_RANGES.map((r) => (
                <DropdownMenuItem
                  key={r.id}
                  onClick={() => {
                    setRange(r.id);
                    setPage(1);
                  }}
                >
                  {r.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              className="h-11 min-w-[120px] appearance-none rounded-lg border border-border bg-surface px-4 pr-9 text-[12px] text-text outline-none transition focus:border-primary/50"
            >
              <option value="all">Type</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          </div>
          <button
            type="button"
            onClick={() =>
              exportCsv(selected.size > 0 ? filtered.filter((s) => selected.has(s.id)) : filtered)
            }
            className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-[13px] text-text transition hover:bg-surface-elevated"
          >
            <Download size={15} />
            Export
          </button>
        </div>
      </section>

      {/* Main content: table + right rail */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            icon={CalendarClock}
            title="Couldn't load interview sessions"
            action={
              <button
                type="button"
                onClick={() => refetch()}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-text hover:bg-surface-elevated"
              >
                Retry
              </button>
            }
          />
        ) : (
          <section className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse">
                <thead>
                  <tr className="border-b border-border bg-surface-elevated/60 text-left text-[12px] text-text-muted">
                    <th className="w-[55px] px-4 py-3.5">
                      <BoardCheckbox checked={allPageSelected} onToggle={toggleSelectPage} />
                    </th>
                    <th className="px-3 py-3.5 font-medium">Candidate</th>
                    <th className="px-3 py-3.5 font-medium">Job Role</th>
                    <th className="px-3 py-3.5 font-medium">Type</th>
                    <th className="px-3 py-3.5 font-medium">Date &amp; Time</th>
                    <th className="px-3 py-3.5 font-medium">Status</th>
                    <th className="w-[90px] px-3 py-3.5 text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      selected={selected.has(s.id)}
                      onToggleSelect={() => toggleSelect(s.id)}
                      canConduct={canConduct}
                    />
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="flex h-48 items-center justify-center text-sm text-text-muted">
                          No interviews found.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {filtered.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-border px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-[12px] text-text-muted">
                  Showing {(currentPage - 1) * pageSize + 1}–
                  {Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} interviews
                  {selected.size > 0 ? ` · ${selected.size} selected` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-elevated disabled:opacity-40"
                  >
                    ‹
                  </button>
                  {paginationPages(currentPage, pageCount).map((p, i) =>
                    p === "…" ? (
                      <span key={`gap-${i}`} className="px-1 text-text-muted">
                        …
                      </span>
                    ) : (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPage(p)}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-lg text-[12px] transition",
                          p === currentPage
                            ? "border border-primary/50 bg-primary/10 text-primary"
                            : "text-text-muted hover:bg-surface-elevated",
                        )}
                      >
                        {p}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                    disabled={currentPage === pageCount}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-elevated disabled:opacity-40"
                  >
                    ›
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="ml-2 flex h-9 items-center gap-3 rounded-lg border border-border bg-surface px-4 text-[12px] text-text"
                      >
                        {pageSize} / page
                        <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {PAGE_SIZES.map((size) => (
                        <DropdownMenuItem
                          key={size}
                          onClick={() => {
                            setPageSize(size);
                            setPage(1);
                          }}
                        >
                          {size} / page
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )}
          </section>
        )}

        {/* Right rail */}
        <aside className="space-y-4">
          {/* Today's schedule */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-text">Today's Schedule</h3>
              <span className="text-[11px] text-text-muted">{todaysSessions.length} interviews</span>
            </div>
            {todaysSessions.length === 0 ? (
              <p className="py-3 text-[12px] text-text-muted">Nothing scheduled for today.</p>
            ) : (
              <div>
                {todaysSessions.map((s, i) => (
                  <ScheduleItem
                    key={s.id}
                    session={s}
                    last={i === todaysSessions.length - 1}
                    onOpen={
                      canConduct
                        ? () => setActiveView("ai-interview", { interviewSessionId: s.id })
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>

          {/* Interviewer performance */}
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-text">Interviewer Workload</h3>
              <span className="text-[11px] text-text-muted">all sessions</span>
            </div>
            {performance.length === 0 ? (
              <p className="py-3 text-[12px] text-text-muted">No interviewers assigned yet.</p>
            ) : (
              <div className="space-y-3.5">
                {performance.map((p) => (
                  <div key={p.userId} className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-[11px] font-semibold text-primary">
                      {initials(p.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px] text-text">{p.name}</div>
                      <div className="text-[10px] text-text-muted">{p.count} interviews</div>
                    </div>
                    <div className="w-[110px]">
                      <div className="h-[8px] overflow-hidden rounded-full bg-surface-elevated">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500"
                          style={{ width: `${p.pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-8 text-right text-[12px] text-text-secondary">{p.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* AI assistant */}
          <section className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/15 via-surface to-surface p-4">
            <div className="flex gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mention/15 text-mention ring-1 ring-mention/20">
                <Sparkles size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-[15px] font-semibold text-text">AI Interview Assistant</h3>
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
                    Beta
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] leading-5 text-text-muted">
                  Get AI-powered question suggestions, feedback summaries and candidate insights.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveView("ai")}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2.5 rounded-lg bg-gradient-to-r from-[#3547ff] to-[#3421dc] text-[13px] font-medium text-white shadow-lg transition hover:brightness-110"
            >
              <Sparkles size={16} />
              Open AI Assistant
              <span>→</span>
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

function paginationPages(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, 2, current - 1, current, current + 1, total - 1, total]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

function BoardCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        "flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border transition",
        checked ? "border-primary bg-primary text-white" : "border-border bg-surface hover:border-primary/50",
      )}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="m5 12 4 4L19 6" />
        </svg>
      )}
    </button>
  );
}

function SessionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    in_progress: "bg-success/10 text-success",
    scheduled: "bg-info/10 text-info",
    completed: "bg-surface-elevated text-text-secondary",
    cancelled: "bg-error/10 text-error",
  };
  const dots: Record<string, string> = {
    in_progress: "bg-success",
    scheduled: "bg-info",
    completed: "bg-text-muted",
    cancelled: "bg-error",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]",
        styles[status] ?? "bg-surface-elevated text-text-muted",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dots[status] ?? "bg-text-muted")} />
      {statusLabel(status)}
    </span>
  );
}

function SessionTypeBadge({ type }: { type: string }) {
  const lower = type.toLowerCase();
  const Icon = lower.includes("video") ? Video : lower.includes("panel") ? Users : CalendarClock;
  return (
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-primary/10 px-3 py-1.5 text-[11px] capitalize text-primary">
        {type.replace(/_/g, " ")}
      </span>
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-elevated text-text-muted">
        <Icon size={13} />
      </span>
    </div>
  );
}

function SessionRow({
  session,
  selected,
  onToggleSelect,
  canConduct,
}: {
  session: InterviewSession;
  selected: boolean;
  onToggleSelect: () => void;
  canConduct: boolean;
}) {
  const { date, time } = formatDateRange(session);
  const live = session.status === "scheduled" || session.status === "in_progress";
  return (
    <tr className="border-b border-border/60 transition hover:bg-surface-elevated/40">
      <td className="px-4 py-3">
        <BoardCheckbox checked={selected} onToggle={onToggleSelect} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-[12px] font-semibold text-primary">
            {initials(session.candidate?.name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium text-text">
              {session.candidate?.name ?? "Interview"}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-text-muted">
              {session.candidate?.email ?? "—"}
            </div>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="text-[12px] text-text">{session.jobOpening?.title ?? "—"}</div>
        {session.jobOpening ? (
          <div className="mt-0.5 text-[10px] text-text-muted">#{session.jobOpening.id.slice(0, 8)}</div>
        ) : null}
      </td>
      <td className="px-3 py-3">
        <SessionTypeBadge type={session.interviewType} />
      </td>
      <td className="px-3 py-3">
        <div className="text-[12px] text-text">{date}</div>
        <div className="mt-0.5 text-[11px] text-text-secondary">{time}</div>
      </td>
      <td className="px-3 py-3">
        <SessionStatusBadge status={session.status} />
      </td>
      <td className="px-3 py-3 text-center">
        {canConduct && live ? (
          <AiInterviewButton sessionId={session.id} candidateName={session.candidate?.name} />
        ) : null}
      </td>
    </tr>
  );
}

function ScheduleItem({
  session,
  last,
  onOpen,
}: {
  session: InterviewSession;
  last: boolean;
  onOpen?: () => void;
}) {
  const live = session.status === "in_progress";
  return (
    <div className={cn("relative flex gap-3", !last && "pb-4")}>
      {!last && <div className="absolute left-[5px] top-4 h-full w-px bg-border" />}
      <div
        className={cn(
          "relative z-10 mt-2 h-3 w-3 shrink-0 rounded-full",
          live ? "bg-success shadow-[0_0_12px_rgba(34,197,94,.45)]" : "bg-info",
        )}
      />
      <div className="min-w-[62px] pt-0.5 text-[12px] text-text-secondary">
        {session.scheduledAt ? formatTime(new Date(session.scheduledAt)) : "—"}
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-[11px] font-semibold text-primary">
        {initials(session.candidate?.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-medium text-text">
          {session.candidate?.name ?? "Interview"}
        </div>
        <div className="mt-0.5 truncate text-[10px] text-text-muted">
          {session.jobOpening?.title ?? session.interviewType}
        </div>
      </div>
      <span
        className={cn(
          "h-fit rounded-full px-2.5 py-1 text-[10px]",
          live ? "bg-success/10 text-success" : "bg-mention/10 text-mention",
        )}
      >
        {live ? "In Progress" : "Upcoming"}
      </span>
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="h-fit rounded-md px-1.5 py-1 text-text-muted transition hover:bg-surface-elevated hover:text-text"
          title="Open interview"
        >
          •••
        </button>
      ) : null}
    </div>
  );
}
