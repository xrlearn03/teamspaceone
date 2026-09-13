import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import {
  useCreateTimeEntry,
  useDeleteTimeEntry,
  useProjects,
  useTasks,
  useTimeEntries,
  useUpdateTimeEntry,
} from "../hooks/api";
import type { TimeEntry } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "@teamspace-one/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { Input } from "@teamspace-one/ui/input";
import { PageHeader } from "./hr/common";
import { SectionError, SectionSkeleton, formatDate } from "./hrms/common";

/* ---------------- helpers ---------------- */

const WEEKLY_TARGET_MINUTES = 40 * 60;
const ROW_COLORS = ["bg-mention", "bg-info", "bg-success", "bg-primary", "bg-warning", "bg-error"];

function startOfWeek(d: Date) {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diff = (day.getDay() + 6) % 7; // Monday = 0
  day.setDate(day.getDate() - diff);
  return day;
}

function addDays(d: Date, n: number) {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function entryDayKey(e: TimeEntry) {
  return dayKey(new Date(e.date));
}

function fmtMinutes(minutes: number) {
  if (minutes <= 0) return "-";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

function fmtMinutesLong(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function entryLabel(e: TimeEntry) {
  return e.task?.title ?? e.label ?? "General";
}

interface ProjectGroup {
  key: string;
  name: string;
  code: string;
  color: string;
  rows: { key: string; name: string; total: number; cells: Map<string, TimeEntry[]> }[];
  total: number;
}

function groupEntries(entries: TimeEntry[]): ProjectGroup[] {
  const projects = new Map<string, { name: string; code: string; rows: Map<string, { name: string; cells: Map<string, TimeEntry[]> }> }>();
  for (const e of entries) {
    const pKey = e.projectId ?? "__adhoc__";
    if (!projects.has(pKey)) {
      projects.set(pKey, {
        name: e.project?.name ?? "Internal / Ad-hoc",
        code: e.projectId ? e.projectId.slice(-6).toUpperCase() : "INT",
        rows: new Map(),
      });
    }
    const group = projects.get(pKey)!;
    const rKey = e.taskId ?? `label:${e.label ?? "general"}`;
    if (!group.rows.has(rKey)) group.rows.set(rKey, { name: entryLabel(e), cells: new Map() });
    const row = group.rows.get(rKey)!;
    const dk = entryDayKey(e);
    if (!row.cells.has(dk)) row.cells.set(dk, []);
    row.cells.get(dk)!.push(e);
  }
  return [...projects.entries()].map(([key, p], i) => {
    const rows = [...p.rows.entries()].map(([rKey, r]) => ({
      key: rKey,
      name: r.name,
      cells: r.cells,
      total: [...r.cells.values()].flat().reduce((s, e) => s + e.minutes, 0),
    }));
    return {
      key,
      name: p.name,
      code: p.code,
      color: ROW_COLORS[i % ROW_COLORS.length],
      rows,
      total: rows.reduce((s, r) => s + r.total, 0),
    };
  });
}

const selectCls = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-[11px] text-text outline-none focus:border-primary/50";
const labelCls = "text-[10px] font-medium text-text-secondary";

/* ---------------- add entry dialog ---------------- */

function TimeEntryDialog({
  open,
  onOpenChange,
  defaultDate,
  defaultProjectId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultDate?: string;
  defaultProjectId?: string;
}) {
  const projects = useProjects();
  const create = useCreateTimeEntry();
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [taskId, setTaskId] = useState("");
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(defaultDate ?? dayKey(new Date()));
  const [hours, setHours] = useState("");
  const [mins, setMins] = useState("");
  const [billable, setBillable] = useState(true);
  const [description, setDescription] = useState("");
  const tasks = useTasks(projectId || undefined);

  const minutes = (Number(hours) || 0) * 60 + (Number(mins) || 0);
  const valid = minutes > 0 && minutes <= 1440 && date && (taskId || label.trim());

  function submit() {
    if (!valid) return;
    create.mutate(
      {
        projectId: projectId || undefined,
        taskId: taskId || undefined,
        label: !taskId && label.trim() ? label.trim() : undefined,
        description: description.trim() || undefined,
        date,
        minutes,
        billable,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Time Entry</DialogTitle>
          <DialogDescription>Log time against a project, task, or ad-hoc item.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Project</span>
            <select
              className={selectCls}
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setTaskId("");
              }}
            >
              <option value="">Internal / Ad-hoc</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          {projectId ? (
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Task</span>
              <select className={selectCls} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">— Custom label instead —</option>
                {(tasks.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </label>
          ) : null}
          {!taskId ? (
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Label *</span>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Team Meeting"
              />
            </label>
          ) : null}
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Date *</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Hours</span>
              <Input type="number" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} placeholder="0" />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Minutes</span>
              <Input type="number" min={0} max={59} value={mins} onChange={(e) => setMins(e.target.value)} placeholder="0" />
            </label>
          </div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <span className={labelCls}>Billable</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Description</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-[11px] text-text outline-none focus:border-primary/50"
            />
          </label>
        </div>
        {create.isError ? (
          <p className="px-4 pb-2 text-sm text-error">
            {create.error instanceof Error ? create.error.message : "Failed to save entry."}
          </p>
        ) : null}
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !valid}>Save Entry</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- cell edit dialog ---------------- */

function CellEntriesDialog({
  entries,
  title,
  open,
  onOpenChange,
}: {
  entries: TimeEntry[];
  title: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateTimeEntry();
  const remove = useDeleteTimeEntry();
  const [minutes, setMinutes] = useState<Record<string, string>>({});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Adjust or remove the logged time for this cell.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 p-4 pt-2">
          {entries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-text">{entryLabel(e)}</p>
                <p className="text-[10px] text-text-muted">
                  {e.project?.name ?? "Ad-hoc"} · {e.billable ? "Billable" : "Non-billable"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  className="h-8 w-20"
                  placeholder="min"
                  value={minutes[e.id] ?? String(e.minutes)}
                  onChange={(ev) => setMinutes((m) => ({ ...m, [e.id]: ev.target.value }))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={update.isPending}
                  onClick={() => {
                    const next = Math.trunc(Number(minutes[e.id] ?? e.minutes));
                    if (next > 0 && next <= 1440) {
                      update.mutate({ id: e.id, body: { minutes: next } });
                    }
                  }}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Delete entry"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(e.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 text-error" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- screen ---------------- */

export function MyTimesheetScreen() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewTab, setViewTab] = useState<"timesheet" | "calendar">("timesheet");
  const [addOpen, setAddOpen] = useState(false);
  const [cellDialog, setCellDialog] = useState<{ title: string; entries: TimeEntry[] } | null>(null);

  const weekStart = useMemo(() => addDays(startOfWeek(new Date()), weekOffset * 7), [weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = addDays(weekStart, 7);

  const entries = useTimeEntries({
    from: weekStart.toISOString(),
    to: weekEnd.toISOString(),
  });
  const prevEntries = useTimeEntries({
    from: addDays(weekStart, -7).toISOString(),
    to: weekStart.toISOString(),
  });

  const list = entries.data ?? [];
  const groups = useMemo(() => groupEntries(list), [list]);
  const totalMinutes = list.reduce((s, e) => s + e.minutes, 0);
  const billableMinutes = list.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0);
  const nonBillableMinutes = totalMinutes - billableMinutes;
  const prevTotal = (prevEntries.data ?? []).reduce((s, e) => s + e.minutes, 0);
  const weekDelta = prevTotal > 0 ? Math.round(((totalMinutes - prevTotal) / prevTotal) * 100) : null;
  const loggedDays = new Set(list.map(entryDayKey)).size;
  const elapsedWeekdays = days.filter((d) => d.getDay() !== 0 && d.getDay() !== 6 && d <= new Date()).length;
  const weeklyPct = Math.min(100, Math.round((totalMinutes / WEEKLY_TARGET_MINUTES) * 100));
  const billablePct = totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;
  const dailyTotals = days.map((d) =>
    list.filter((e) => entryDayKey(e) === dayKey(d)).reduce((s, e) => s + e.minutes, 0),
  );
  const recent = useMemo(
    () => [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    [list],
  );
  const lastUpdated = list.reduce<string | null>(
    (acc, e) => (e.updatedAt > (acc ?? "") ? e.updatedAt : acc),
    null,
  );

  if (entries.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="My Timesheet" crumbs={["My Timesheet"]} />
        <div className="mt-6"><SectionSkeleton rows={8} /></div>
      </div>
    );
  }
  if (entries.isError) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="My Timesheet" crumbs={["My Timesheet"]} />
        <div className="mt-6"><SectionError onRetry={() => entries.refetch()} /></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="My Timesheet" crumbs={["My Timesheet"]}>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary hover:text-text"
            aria-label="Previous week"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-[11px] font-medium text-text"
          >
            <CalendarDays size={16} className="text-text-secondary" />
            {formatDate(weekStart.toISOString())} – {formatDate(addDays(weekStart, 6).toISOString())}
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary hover:text-text"
            aria-label="Next week"
          >
            <ChevronRight size={16} />
          </button>
          <Button onClick={() => setAddOpen(true)} className="ml-1 h-10">
            <Plus size={16} className="mr-1.5" /> Add Entry
          </Button>
        </div>
      </PageHeader>
      <p className="mt-1 text-sm text-text-secondary">
        Track your work hours, manage tasks, and stay productive.
      </p>

      {/* KPI cards */}
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(
          [
            { icon: Clock3, iconBg: "bg-primary/10 text-primary", value: fmtMinutesLong(totalMinutes), title: "Total Hours", trend: weekDelta !== null ? `${weekDelta >= 0 ? "↑" : "↓"} ${Math.abs(weekDelta)}%` : undefined, detail: "vs last week" },
            { icon: CheckCircle2, iconBg: "bg-success/10 text-success", value: fmtMinutesLong(billableMinutes), title: "Billable Hours", trend: totalMinutes ? `${billablePct}%` : undefined, detail: "of total" },
            { icon: FileText, iconBg: "bg-info/10 text-info", value: fmtMinutesLong(nonBillableMinutes), title: "Non-Billable Hours", trend: totalMinutes ? `${100 - billablePct}%` : undefined, detail: "of total" },
            { icon: Target, iconBg: "bg-mention/10 text-mention", value: `${loggedDays} / ${Math.max(elapsedWeekdays, 1)}`, title: "Days Logged", status: loggedDays >= elapsedWeekdays ? "On Track" : "Behind" },
          ] as const
        ).map((c) => (
          <div key={c.title} className="rounded-xl border border-border bg-surface px-5 py-5 shadow-[0_2px_12px_rgba(30,50,100,0.025)]">
            <div className="flex items-center gap-4">
              <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", c.iconBg)}>
                <c.icon size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[24px] font-semibold tracking-tight text-text">{c.value}</span>
                  {"status" in c && c.status ? (
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-1 text-[9px] font-semibold",
                        c.status === "On Track" ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
                      )}
                    >
                      {c.status}
                    </span>
                  ) : "trend" in c && c.trend ? (
                    <span className="text-[10px] font-semibold text-success">{c.trend}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[11px] font-medium text-text-secondary">{c.title}</p>
                {"detail" in c && c.detail ? (
                  <p className="mt-1 text-[9px] text-text-muted">{c.detail}</p>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main */}
      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* LEFT — grid */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border">
            <div className="flex">
              {(
                [
                  ["timesheet", "Timesheet"],
                  ["calendar", "Calendar View"],
                ] as const
              ).map(([key, name]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setViewTab(key)}
                  className={cn(
                    "relative px-5 py-4 text-[11px]",
                    viewTab === key ? "font-semibold text-primary" : "text-text-secondary",
                  )}
                >
                  {name}
                  {viewTab === key && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="mr-3 flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[10px] font-medium text-text-secondary"
            >
              {weekOffset === 0 ? "This Week" : "Jump to this week"}
            </button>
          </div>

          {viewTab === "calendar" ? (
            <div className="divide-y divide-border">
              {days.map((d) => {
                const dayEntries = list.filter((e) => entryDayKey(e) === dayKey(d));
                const dayTotal = dayEntries.reduce((s, e) => s + e.minutes, 0);
                return (
                  <div key={dayKey(d)} className="px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-semibold text-text">
                        {d.toLocaleDateString(undefined, { weekday: "long" })},{" "}
                        {formatDate(d.toISOString())}
                      </p>
                      <span className="text-[10px] font-medium text-text-secondary">
                        {fmtMinutesLong(dayTotal)}
                      </span>
                    </div>
                    {dayEntries.length === 0 ? (
                      <p className="mt-2 text-[10px] text-text-muted">No entries logged.</p>
                    ) : (
                      <div className="mt-2 space-y-1.5">
                        {dayEntries.map((e) => (
                          <div key={e.id} className="flex items-center gap-3 text-[10px]">
                            <span className="h-2 w-2 rounded-full bg-primary" />
                            <span className="flex-1 truncate text-text">
                              {entryLabel(e)}
                              <span className="ml-1 text-text-muted">· {e.project?.name ?? "Ad-hoc"}</span>
                            </span>
                            <span className="font-medium text-text-secondary">{fmtMinutesLong(e.minutes)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[850px]">
                {/* header row */}
                <div className="grid grid-cols-[230px_repeat(7,minmax(60px,1fr))_85px] border-b border-border bg-surface-elevated">
                  <div className="flex items-center px-4 py-3 text-[11px] font-semibold text-text">
                    Projects / Tasks
                  </div>
                  {days.map((d) => (
                    <div
                      key={dayKey(d)}
                      className="flex flex-col items-center justify-center border-l border-border py-3"
                    >
                      <span className="text-[9px] text-text-secondary">
                        {d.toLocaleDateString(undefined, { weekday: "short" })}
                      </span>
                      <span className="mt-1 text-[10px] font-medium text-text">
                        {formatDate(d.toISOString())}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-center border-l border-border text-[11px] font-semibold text-text">
                    Total
                  </div>
                </div>

                {groups.length === 0 ? (
                  <p className="px-4 py-10 text-center text-xs text-text-muted">
                    No time logged this week — use Add Entry to get started.
                  </p>
                ) : (
                  groups.map((g) => (
                    <div key={g.key}>
                      {/* project header */}
                      <div className="grid grid-cols-[230px_repeat(7,minmax(60px,1fr))_85px] border-b border-border bg-surface-elevated/60">
                        <div className="flex items-center gap-3 px-4 py-3">
                          <span className={cn("h-2.5 w-2.5 rounded-full", g.color)} />
                          <div>
                            <p className="text-[11px] font-semibold text-text">{g.name}</p>
                            <p className="mt-0.5 text-[9px] text-text-muted">{g.code}</p>
                          </div>
                        </div>
                        {days.map((d) => (
                          <div key={dayKey(d)} className="border-l border-border" />
                        ))}
                        <div className="flex items-center justify-center border-l border-border text-[11px] font-semibold text-text">
                          {fmtMinutes(g.total)}
                        </div>
                      </div>
                      {/* entry rows */}
                      {g.rows.map((row) => (
                        <div
                          key={row.key}
                          className="grid grid-cols-[230px_repeat(7,minmax(60px,1fr))_85px] border-b border-border"
                        >
                          <div className="flex items-center px-8 py-2.5">
                            <span className="truncate text-[10px] text-text-secondary">{row.name}</span>
                          </div>
                          {days.map((d) => {
                            const cell = row.cells.get(dayKey(d)) ?? [];
                            const cellMinutes = cell.reduce((s, e) => s + e.minutes, 0);
                            return (
                              <button
                                key={dayKey(d)}
                                type="button"
                                onClick={() => {
                                  if (cell.length > 0) {
                                    setCellDialog({ title: `${row.name} — ${formatDate(d.toISOString())}`, entries: cell });
                                  }
                                }}
                                className={cn(
                                  "m-1.5 flex h-9 items-center justify-center rounded-md border border-transparent text-[10px] transition",
                                  cellMinutes > 0
                                    ? "bg-primary/5 text-text hover:border-primary/30 hover:bg-primary/10"
                                    : "text-text-muted",
                                )}
                              >
                                {fmtMinutes(cellMinutes)}
                              </button>
                            );
                          })}
                          <div className="flex items-center justify-center border-l border-border text-[10px] font-semibold text-text">
                            {fmtMinutes(row.total)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))
                )}

                {/* daily total */}
                <div className="grid grid-cols-[230px_repeat(7,minmax(60px,1fr))_85px] bg-surface-elevated/70">
                  <div className="px-4 py-3 text-[11px] font-semibold text-text">Daily Total</div>
                  {dailyTotals.map((t, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center border-l border-border py-3 text-[10px] font-semibold text-text"
                    >
                      {fmtMinutes(t)}
                    </div>
                  ))}
                  <div className="flex items-center justify-center border-l border-border text-[11px] font-semibold text-text">
                    {fmtMinutes(totalMinutes)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — rail */}
        <div className="space-y-3">
          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-text">Weekly Progress</h3>
              <span className="text-[10px] font-medium text-text-secondary">
                {fmtMinutes(totalMinutes)} of 40h
              </span>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-elevated">
                <div className="h-full rounded-full bg-primary" style={{ width: `${weeklyPct}%` }} />
              </div>
              <span className="text-[11px] font-semibold text-text-secondary">{weeklyPct}%</span>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-[13px] font-semibold text-text">Time Distribution</h3>
            <div className="mt-5 flex items-center gap-5">
              <div
                className="relative flex h-[112px] w-[112px] shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `conic-gradient(var(--color-primary, #4f46e5) 0deg ${billablePct * 3.6}deg, var(--surface-elevated, #dbe2f7) ${billablePct * 3.6}deg 360deg)`,
                }}
              >
                <div className="flex h-[76px] w-[76px] flex-col items-center justify-center rounded-full bg-surface">
                  <span className="text-[20px] font-semibold text-text">{fmtMinutes(totalMinutes)}</span>
                  <span className="text-[9px] text-text-muted">Total</span>
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-primary" />
                  <span className="text-[10px] text-text-secondary">Billable</span>
                  <span className="ml-auto text-[10px] font-medium text-text-secondary">
                    {fmtMinutes(billableMinutes)} ({billablePct}%)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-surface-elevated" />
                  <span className="text-[10px] text-text-secondary">Non-Billable</span>
                  <span className="ml-auto text-[10px] font-medium text-text-secondary">
                    {fmtMinutes(nonBillableMinutes)} ({totalMinutes ? 100 - billablePct : 0}%)
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-text">Recent Entries</h3>
            </div>
            {recent.length === 0 ? (
              <p className="mt-3 text-[10px] text-text-muted">No entries logged this week.</p>
            ) : (
              <div className="mt-3">
                {recent.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 border-b border-border py-3 last:border-0">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-semibold text-text">{entryLabel(e)}</p>
                      <p className="mt-0.5 truncate text-[9px] text-text-muted">
                        {e.project?.name ?? "Ad-hoc"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-text">{fmtMinutesLong(e.minutes)}</p>
                      <p className="mt-0.5 text-[8px] text-text-muted">{formatDate(e.date)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h3 className="text-[13px] font-semibold text-text">Timesheet Status</h3>
            <div className="mt-4 flex items-center gap-4">
              <div
                className={cn(
                  "flex h-12 w-12 items-center justify-center rounded-full",
                  loggedDays > 0 ? "bg-success/10" : "bg-warning/10",
                )}
              >
                <CheckCircle2 size={25} className={loggedDays > 0 ? "text-success" : "text-warning"} />
              </div>
              <div>
                <p className="text-[10px] font-medium text-text">
                  {loggedDays > 0
                    ? "This week's timesheet is up to date."
                    : "No time logged yet this week."}
                </p>
                <p className="mt-1 text-[9px] text-text-muted">
                  {lastUpdated ? `Last updated: ${formatDate(lastUpdated)}` : "Start by adding an entry."}
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>

      <TimeEntryDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultDate={dayKey(new Date())}
      />
      {cellDialog ? (
        <CellEntriesDialog
          entries={cellDialog.entries}
          title={cellDialog.title}
          open={Boolean(cellDialog)}
          onOpenChange={(o) => {
            if (!o) setCellDialog(null);
          }}
        />
      ) : null}
    </div>
  );
}
