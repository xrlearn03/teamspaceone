import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Filter,
  MoreHorizontal,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  UserMinus,
  Users,
  Plus,
} from "lucide-react";
import {
  useChannels,
  useCreateDirectChannel,
  useEmployees,
  useMe,
  useOffboardingCases,
  useSetOffboardingTaskStatus,
  useTransitionOffboardingCase,
  useUpdateOffboardingCase,
  useUsers,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import type { Employee, OffboardingCase, OffboardingTask } from "../../lib/api";
import { useUIStore } from "../../stores/ui";
import { cn, getUserDisplayName } from "../../lib/utils";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { Button } from "@teamspace-one/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { PageHeader, PrimaryAction } from "./common";
import { SectionError, SectionSkeleton } from "../hrms/common";
import { InitiateDialog } from "../hrms/offboarding";

/* =========================================================
   HELPERS
========================================================= */

type Bucket = "in_progress" | "scheduled" | "completed";
type DetailTab = "tasks" | "access" | "assets" | "approvals" | "notes" | "activity";

const AVATAR_CLASSES = [
  "bg-primary/10 text-primary",
  "bg-mention/10 text-mention",
  "bg-info/10 text-info",
  "bg-success/10 text-success",
  "bg-warning/10 text-warning",
];

const TYPE_OPTIONS = [
  { value: "", label: "All types" },
  { value: "resignation", label: "Resignation" },
  { value: "termination", label: "Termination" },
  { value: "retirement", label: "Retirement" },
  { value: "contract_end", label: "Contract end" },
];

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "tasks", label: "Tasks" },
  { id: "access", label: "Access & Accounts" },
  { id: "assets", label: "Assets" },
  { id: "approvals", label: "Approvals" },
  { id: "notes", label: "Notes" },
  { id: "activity", label: "Activity" },
];

/** Task categories surfaced under each detail tab. */
const TAB_CATEGORIES: Partial<Record<DetailTab, string[]>> = {
  access: ["access", "accounts"],
  assets: ["assets", "equipment"],
  approvals: ["settlement", "exit_interview", "approvals"],
};

const AUTOMATABLE_CATEGORIES = ["access", "accounts", "assets", "equipment"];

function caseName(c: OffboardingCase) {
  return `${c.employee.firstName} ${c.employee.lastName}`.trim();
}

function initialsOf(c: OffboardingCase) {
  return `${c.employee.firstName[0] ?? ""}${c.employee.lastName[0] ?? ""}`.toUpperCase() || "?";
}

function isClosed(c: OffboardingCase) {
  return c.status === "completed" || c.status === "cancelled";
}

/** Cases with no task progress yet count as scheduled; the rest are in flight. */
function bucketOf(c: OffboardingCase): Bucket {
  if (isClosed(c)) return "completed";
  const started = c.status === "in_progress" || c.tasks.some((t) => t.status === "completed");
  return started ? "in_progress" : "scheduled";
}

function bucketLabel(c: OffboardingCase) {
  if (c.status === "cancelled") return "Cancelled";
  const b = bucketOf(c);
  return b === "completed" ? "Completed" : b === "scheduled" ? "Scheduled" : "In Progress";
}

function taskProgress(c: OffboardingCase) {
  const total = c.tasks.length;
  const done = c.tasks.filter((t) => t.status === "completed").length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

function typeLabel(type?: string | null) {
  if (!type) return "—";
  return type.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function shortDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function fullDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function daysLeftLabel(iso?: string | null) {
  if (!iso) return null;
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  if (Number.isNaN(diff)) return null;
  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"} overdue`;
  if (diff === 0) return "Today";
  return `${diff} day${diff === 1 ? "" : "s"} left`;
}

function categoryLabel(task: OffboardingTask) {
  return task.category ? typeLabel(task.category) : "—";
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({
  icon,
  iconClass,
  value,
  label,
  suffix,
}: {
  icon: React.ReactNode;
  iconClass: string;
  value: string;
  label: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4 shadow-[0_3px_18px_rgba(20,50,90,.035)]">
      <div className="flex items-center gap-4">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", iconClass)}>
          {icon}
        </div>
        <div>
          <p className="text-[25px] font-semibold tracking-tight text-text">{value}</p>
          <p className="mt-0.5 text-xs text-text-secondary">{label}</p>
          {suffix ? <p className="mt-0.5 text-[10px] text-text-muted">{suffix}</p> : null}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   AI INSIGHT
========================================================= */

function AiInsight({ text, onOpen }: { text: string; onOpen?: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full items-center rounded-xl border border-primary/20 bg-gradient-to-br from-primary-subtle via-surface to-info/10 px-5 py-4 text-left"
    >
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-mention/10 text-mention">
          <Sparkles size={23} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-text">AI Insight</h3>
          <p className="mt-1 text-[12px] leading-5 text-text-secondary">{text}</p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-primary" />
      </div>
    </button>
  );
}

/* =========================================================
   CASE LIST (LEFT COLUMN)
========================================================= */

function CaseList({
  cases,
  tab,
  onTab,
  counts,
  query,
  onQuery,
  typeFilter,
  onTypeFilter,
  selectedId,
  onSelect,
  employeeById,
}: {
  cases: OffboardingCase[];
  tab: Bucket;
  onTab: (t: Bucket) => void;
  counts: Record<Bucket, number>;
  query: string;
  onQuery: (q: string) => void;
  typeFilter: string;
  onTypeFilter: (t: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  employeeById: Map<string, Employee>;
}) {
  return (
    <div className="self-start overflow-hidden rounded-xl border border-border bg-surface">
      {/* Status tabs */}
      <div className="flex items-center border-b border-border px-2">
        {(
          [
            ["in_progress", "In Progress"],
            ["scheduled", "Scheduled"],
            ["completed", "Completed"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => onTab(id)}
            className={cn(
              "relative px-3 py-4 text-xs font-medium",
              tab === id ? "text-primary" : "text-text-muted hover:text-text",
            )}
          >
            {label} ({counts[id]})
            {tab === id && <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-primary" />}
          </button>
        ))}
        <ChevronRight size={16} className="ml-auto mr-2 text-text-muted" />
      </div>

      {/* Search + type filter */}
      <div className="flex gap-2 border-b border-border p-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search employee..."
            className="h-10 w-full rounded-lg border border-border bg-surface-elevated pl-9 pr-3 text-xs text-text outline-none placeholder:text-text-muted focus:border-primary/40"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex h-10 w-11 items-center justify-center rounded-lg border border-border bg-surface",
                typeFilter ? "text-primary" : "text-text-muted",
              )}
              aria-label="Filter by type"
            >
              <Filter size={16} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {TYPE_OPTIONS.map((o) => (
              <DropdownMenuItem
                key={o.value}
                onClick={() => onTypeFilter(o.value)}
                className="flex items-center justify-between gap-3 text-xs"
              >
                {o.label}
                {typeFilter === o.value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Cases */}
      <div className="max-h-[560px] overflow-y-auto">
        {cases.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-text-muted">
            {query || typeFilter ? "No offboarding cases match your filters." : "No cases in this state."}
          </p>
        ) : (
          cases.map((c, index) => {
            const selected = c.id === selectedId;
            const { pct } = taskProgress(c);
            const emp = employeeById.get(c.employee.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border px-4 py-4 text-left transition last:border-0",
                  selected ? "bg-primary-subtle" : "hover:bg-surface-elevated",
                )}
              >
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className={cn("text-xs font-semibold", AVATAR_CLASSES[index % AVATAR_CLASSES.length])}>
                    {initialsOf(c)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-text">{caseName(c)}</p>
                  <p className="mt-0.5 truncate text-[10px] text-text-muted">
                    {emp?.designation?.title ?? emp?.designationName ?? typeLabel(c.type)}
                  </p>
                </div>
                <div className="hidden w-[125px] sm:block">
                  <p className="text-[10px] text-text-muted">Last working day</p>
                  <p className="mt-1 text-[11px] font-medium text-text-secondary">{shortDate(c.lastWorkingDate)}</p>
                </div>
                <div className="flex w-[70px] items-center gap-2">
                  <span className="text-[11px] font-medium text-text-secondary">{pct}%</span>
                  <div className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-elevated">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <ChevronRight size={16} className="shrink-0 text-text-muted" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* =========================================================
   PROGRESS STEPPER
========================================================= */

function ProgressStepper({ item }: { item: OffboardingCase }) {
  const { done, total } = taskProgress(item);
  const allDone = total > 0 && done === total;
  const someDone = done > 0;
  const cancelled = item.status === "cancelled";
  // A category stage is done when all its tasks are done; with no matching
  // tasks it simply follows overall task completion.
  const categoryDone = (cats: string[]) => {
    const list = item.tasks.filter((t) => cats.includes((t.category ?? "").toLowerCase()));
    return list.length === 0 ? allDone : list.every((t) => t.status === "completed");
  };

  const steps = [
    { label: "Initiated", sub: shortDate(item.createdAt), done: true },
    { label: "Approvals", sub: typeLabel(item.type), done: someDone || item.status !== "initiated" },
    { label: "Task Completion", sub: `${done}/${total} tasks`, done: allDone },
    { label: "Asset Return", sub: "", done: categoryDone(["assets", "equipment"]) },
    { label: "Access Revocation", sub: "", done: categoryDone(["access", "accounts"]) },
    { label: cancelled ? "Cancelled" : "Completed", sub: shortDate(item.completedAt), done: item.status === "completed" },
  ];

  const firstPending = steps.findIndex((s) => !s.done);
  const lastDone = steps.reduce((acc, s, i) => (s.done ? i : acc), -1);
  const n = steps.length;
  // Node centers sit at 32px + (i + 0.5) / n of the content width.
  const edge = `calc(32px + (100% - 64px) / ${n * 2})`;

  return (
    <div className="relative px-8 py-5">
      <div
        className="absolute top-[31px] h-[2px] bg-border"
        style={{ left: edge, right: edge }}
      />
      {lastDone > 0 && (
        <div
          className="absolute top-[31px] h-[2px] bg-primary"
          style={{ left: edge, width: `calc((100% - 64px) * ${lastDone} / ${n})` }}
        />
      )}
      <div className="relative flex justify-between">
        {steps.map((step, index) => {
          const active = !cancelled && index === firstPending;
          const lastCancelled = cancelled && index === n - 1;
          return (
            <div key={step.label} className="flex flex-1 flex-col items-center">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border-2",
                  step.done
                    ? "border-primary bg-primary text-white"
                    : lastCancelled
                      ? "border-error bg-error text-white"
                      : active
                        ? "border-primary bg-primary"
                        : "border-border bg-surface",
                )}
              >
                {step.done ? (
                  <Check size={13} />
                ) : lastCancelled ? (
                  <AlertCircle size={12} />
                ) : active ? (
                  <span className="h-2 w-2 rounded-full bg-white" />
                ) : null}
              </div>
              <p
                className={cn(
                  "mt-2 text-center text-[11px] font-medium",
                  step.done || active ? "text-text" : "text-text-muted",
                )}
              >
                {step.label}
              </p>
              {step.sub && step.sub !== "—" ? (
                <p className="mt-0.5 text-center text-[10px] text-text-muted">{step.sub}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   TASK TABLE
========================================================= */

function TaskStatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "bg-success/10 text-success"
      : status === "in_progress"
        ? "bg-info/10 text-info"
        : "bg-warning/10 text-warning";
  const label = status === "completed" ? "Completed" : status === "in_progress" ? "In Progress" : "Pending";
  return <span className={cn("rounded-lg px-2.5 py-1 text-[10px] font-medium", cls)}>{label}</span>;
}

function TaskTable({
  item,
  tasks,
  emptyLabel,
  canToggle,
  assigneeName,
}: {
  item: OffboardingCase;
  tasks: OffboardingTask[];
  emptyLabel: string;
  canToggle: (t: OffboardingTask) => boolean;
  assigneeName: (t: OffboardingTask) => string;
}) {
  const setTask = useSetOffboardingTaskStatus();
  const open = !isClosed(item);

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-[minmax(0,1.8fr)_.7fr_.8fr_1fr] bg-surface-elevated px-3 py-3 text-[10px] font-medium text-text-muted">
        <span>Task</span>
        <span>Owner</span>
        <span>Status</span>
        <span>Due Date</span>
      </div>
      {tasks.length === 0 ? (
        <p className="border-t border-border px-3 py-6 text-center text-xs text-text-muted">{emptyLabel}</p>
      ) : (
        tasks.map((t) => {
          const completed = t.status === "completed";
          const toggleable = open && canToggle(t);
          return (
            <div
              key={t.id}
              className="grid grid-cols-[minmax(0,1.8fr)_.7fr_.8fr_1fr] items-center border-t border-border px-3 py-3"
            >
              <button
                type="button"
                disabled={!toggleable || setTask.isPending}
                onClick={() =>
                  setTask.mutate({ id: item.id, taskId: t.id, action: completed ? "reopen" : "complete" })
                }
                className="flex min-w-0 items-center gap-3 text-left disabled:cursor-default"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                    completed ? "border-primary bg-primary text-white" : "border-border bg-surface",
                    toggleable && !completed && "hover:border-primary/60",
                  )}
                >
                  {completed && <Check size={12} />}
                </span>
                <span className={cn("truncate text-[11px]", completed ? "text-text-secondary" : "font-medium text-text")}>
                  {t.title}
                </span>
              </button>
              <span className="truncate text-[11px] text-text-secondary">{assigneeName(t)}</span>
              <div>
                <TaskStatusBadge status={t.status} />
              </div>
              <span className="text-[11px] text-text-secondary">
                {completed ? shortDate(t.completedAt) : shortDate(item.lastWorkingDate)}
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

/* =========================================================
   NOTES TAB
========================================================= */

function NotesTab({ item, canManage }: { item: OffboardingCase; canManage: boolean }) {
  const update = useUpdateOffboardingCase();
  const [exitNotes, setExitNotes] = useState(item.exitInterviewNotes ?? "");
  const [settlementNotes, setSettlementNotes] = useState(item.settlementNotes ?? "");
  const open = !isClosed(item);
  const editable = canManage && open;

  return (
    <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Exit interview notes</span>
        <textarea
          className="min-h-28 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text outline-none focus:border-primary/40 disabled:opacity-60"
          value={exitNotes}
          onChange={(e) => setExitNotes(e.target.value)}
          disabled={!editable}
          placeholder="Notes from the exit interview…"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-secondary">Settlement notes</span>
        <textarea
          className="min-h-28 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text outline-none focus:border-primary/40 disabled:opacity-60"
          value={settlementNotes}
          onChange={(e) => setSettlementNotes(e.target.value)}
          disabled={!editable}
          placeholder="Final settlement details…"
        />
      </label>
      {editable ? (
        <div className="flex justify-end lg:col-span-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={update.isPending}
            onClick={() =>
              update.mutate({
                id: item.id,
                body: {
                  exitInterviewNotes: exitNotes || null,
                  settlementNotes: settlementNotes || null,
                },
              })
            }
          >
            Save notes
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* =========================================================
   ACTIVITY TAB
========================================================= */

function ActivityTab({ item }: { item: OffboardingCase }) {
  const events = useMemo(() => {
    const list: { ts: string; label: string }[] = [];
    if (item.createdAt) list.push({ ts: item.createdAt, label: `Offboarding initiated (${typeLabel(item.type)})` });
    for (const t of item.tasks) {
      if (t.status === "completed" && t.completedAt) {
        list.push({ ts: t.completedAt, label: `Completed: ${t.title}` });
      }
    }
    if (item.status === "completed" && item.completedAt) {
      list.push({ ts: item.completedAt, label: "Offboarding completed" });
    }
    if (item.status === "cancelled" && item.updatedAt) {
      list.push({ ts: item.updatedAt, label: "Offboarding cancelled" });
    }
    return list.sort((a, b) => b.ts.localeCompare(a.ts));
  }, [item]);

  if (events.length === 0) {
    return <p className="mt-3 rounded-lg border border-border px-3 py-6 text-center text-xs text-text-muted">No activity yet.</p>;
  }

  return (
    <ul className="mt-3 flex flex-col gap-0 rounded-lg border border-border">
      {events.map((e, i) => (
        <li key={i} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0">
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary/60" />
          <span className="flex-1 text-[11px] text-text">{e.label}</span>
          <span className="text-[10px] text-text-muted">{shortDate(e.ts)}</span>
        </li>
      ))}
    </ul>
  );
}

/* =========================================================
   AI SUGGESTION + SEND UPDATE
========================================================= */

function AiSuggestion({ item, canManage }: { item: OffboardingCase; canManage: boolean }) {
  const setTask = useSetOffboardingTaskStatus();
  const open = !isClosed(item);
  const automatable = item.tasks.filter(
    (t) => t.status !== "completed" && AUTOMATABLE_CATEGORIES.includes((t.category ?? "").toLowerCase()),
  );

  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary-subtle to-mention/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mention/10 text-mention">
          <Sparkles size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text">AI Suggestion</p>
          <p className="mt-1 text-[11px] leading-5 text-text-secondary">
            {automatable.length > 0
              ? `${automatable.length} task${automatable.length === 1 ? "" : "s"} can be automated (access revocation, asset tracking) to reduce offboarding time.`
              : "All access and asset tasks are complete — nothing left to automate."}
          </p>
        </div>
        {canManage && open && automatable.length > 0 ? (
          <button
            type="button"
            disabled={setTask.isPending}
            onClick={() =>
              automatable.forEach((t) =>
                setTask.mutate({ id: item.id, taskId: t.id, action: "complete" }),
              )
            }
            className="shrink-0 rounded-lg border border-primary/30 bg-surface px-3 py-2 text-[10px] font-medium text-primary hover:bg-primary-subtle disabled:opacity-50"
          >
            Apply Suggestions
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SendUpdate({ item }: { item: OffboardingCase }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const me = useMe();
  const channels = useChannels();
  const createDirect = useCreateDirectChannel();
  const userId = item.employee.userId;

  function notify() {
    if (!userId) return;
    const existing = (channels.data ?? []).find((c) => {
      if (c.type !== "direct") return false;
      const others = c.members.filter((m) => m.userId !== me.data?.id);
      return others.length === 1 && others[0].userId === userId;
    });
    if (existing) {
      setActiveView("dm", { channelId: existing.id });
      return;
    }
    createDirect.mutate([userId], {
      onSuccess: (channel) => setActiveView("dm", { channelId: channel.id }),
    });
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Send size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text">Send Update</p>
          <p className="mt-1 text-[11px] leading-5 text-text-secondary">
            Notify the employee about offboarding progress over direct message.
          </p>
        </div>
        <button
          type="button"
          onClick={notify}
          disabled={!userId || createDirect.isPending}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-primary/30 bg-surface px-3 py-2 text-[10px] font-medium text-primary hover:bg-primary-subtle disabled:opacity-50"
        >
          Notify
          <ChevronRight size={13} />
        </button>
      </div>
    </div>
  );
}

/* =========================================================
   CASE DETAIL (RIGHT COLUMN)
========================================================= */

function CaseDetail({
  item,
  employee,
  canManage,
}: {
  item: OffboardingCase;
  employee?: Employee;
  canManage: boolean;
}) {
  const setTask = useSetOffboardingTaskStatus();
  const transition = useTransitionOffboardingCase();
  const me = useMe();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const [detailTab, setDetailTab] = useState<DetailTab>("tasks");
  const open = !isClosed(item);
  const name = caseName(item);
  const daysLeft = daysLeftLabel(item.lastWorkingDate);
  const isOwnCase = Boolean(item.employee.userId && item.employee.userId === me.data?.id);

  const assigneeIds = useMemo(
    () => [...new Set(item.tasks.map((t) => t.assigneeUserId).filter((id): id is string => Boolean(id)))],
    [item.tasks],
  );
  const assignees = useUsers(assigneeIds);
  const assigneeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of assignees.data ?? []) m.set(u.id, getUserDisplayName(u));
    return m;
  }, [assignees.data]);

  const assigneeName = (t: OffboardingTask) =>
    (t.assigneeUserId && assigneeById.get(t.assigneeUserId)) || categoryLabel(t);

  const canToggle = (t: OffboardingTask) =>
    canManage || isOwnCase || Boolean(t.assigneeUserId && t.assigneeUserId === me.data?.id);

  const pendingTasks = item.tasks.filter((t) => t.status !== "completed");
  const visibleTasks =
    detailTab === "tasks"
      ? item.tasks
      : (TAB_CATEGORIES[detailTab]
          ? item.tasks.filter((t) => TAB_CATEGORIES[detailTab]!.includes((t.category ?? "").toLowerCase()))
          : []);

  const statusCls =
    item.status === "cancelled"
      ? "bg-error/10 text-error"
      : bucketOf(item) === "completed"
        ? "bg-success/10 text-success"
        : bucketOf(item) === "scheduled"
          ? "bg-info/10 text-info"
          : "bg-primary/10 text-primary";

  const subtitle = [
    employee?.designation?.title ?? employee?.designationName,
    employee?.department?.name ?? employee?.departmentName,
    employee?.employeeNumber,
  ]
    .filter(Boolean)
    .join("  •  ");

  return (
    <div className="rounded-xl border border-border bg-surface p-5">
      {/* Employee header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">
              {initialsOf(item)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold text-text">{name}</h2>
              <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", statusCls)}>
                {bucketLabel(item)}
              </span>
            </div>
            <p className="mt-1 truncate text-xs text-text-secondary">
              {subtitle || typeLabel(item.type)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-[10px] text-text-muted">Last Working Day</p>
            <p className="mt-1 text-sm font-semibold text-text">{fullDate(item.lastWorkingDate)}</p>
            {daysLeft && open ? (
              <p className={cn("text-[10px]", daysLeft.includes("overdue") ? "text-error" : "text-text-muted")}>
                {daysLeft}
              </p>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-elevated text-text-muted hover:text-text"
                aria-label="Case actions"
              >
                <MoreHorizontal size={17} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => setActiveView("employee-detail", { employeeId: item.employee.id })}
                className="text-xs"
              >
                View employee
              </DropdownMenuItem>
              {canManage && open ? (
                <>
                  <DropdownMenuItem
                    className="text-xs"
                    onClick={() => {
                      if (window.confirm(`Complete offboarding for ${name}? This terminates the employee.`)) {
                        transition.mutate({ id: item.id, action: "complete" });
                      }
                    }}
                  >
                    Complete offboarding
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-xs text-error"
                    onClick={() => {
                      if (window.confirm("Cancel this offboarding case?")) {
                        transition.mutate({ id: item.id, action: "cancel" });
                      }
                    }}
                  >
                    Cancel case
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Progress stepper */}
      <ProgressStepper item={item} />

      {/* Detail tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border">
        <div className="flex gap-7 overflow-x-auto">
          {DETAIL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setDetailTab(t.id)}
              className={cn(
                "relative pb-3 text-xs",
                detailTab === t.id ? "font-semibold text-primary" : "text-text-muted hover:text-text",
              )}
            >
              {t.label}
              {detailTab === t.id && (
                <span className="absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
        {canManage && open && pendingTasks.length > 0 && detailTab !== "notes" && detailTab !== "activity" ? (
          <button
            type="button"
            disabled={setTask.isPending}
            onClick={() =>
              pendingTasks.forEach((t) => setTask.mutate({ id: item.id, taskId: t.id, action: "complete" }))
            }
            className="mb-2 hidden items-center gap-2 rounded-lg border border-primary/30 bg-surface px-4 py-2 text-[11px] font-medium text-primary hover:bg-primary-subtle disabled:opacity-50 md:flex"
          >
            <Check size={14} />
            Mark All Complete
          </button>
        ) : null}
      </div>

      {detailTab === "notes" ? (
        <NotesTab key={item.id} item={item} canManage={canManage} />
      ) : detailTab === "activity" ? (
        <ActivityTab item={item} />
      ) : (
        <TaskTable
          item={item}
          tasks={visibleTasks}
          emptyLabel={
            detailTab === "tasks" ? "No checklist tasks." : "No tasks in this category."
          }
          canToggle={canToggle}
          assigneeName={assigneeName}
        />
      )}

      {/* Bottom actions */}
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <AiSuggestion item={item} canManage={canManage} />
        <SendUpdate item={item} />
      </div>
    </div>
  );
}

/* =========================================================
   MAIN SCREEN
========================================================= */

export function HrOffboardingScreen() {
  const { can } = usePermissions();
  const canManage = can("hrms.offboarding.manage");
  const cases = useOffboardingCases();
  const employees = useEmployees();
  const [tab, setTab] = useState<Bucket>("in_progress");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [initiateOpen, setInitiateOpen] = useState(false);

  const all = cases.data ?? [];

  const employeeById = useMemo(() => {
    const map = new Map<string, Employee>();
    for (const e of employees.data ?? []) map.set(e.id, e);
    return map;
  }, [employees.data]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { in_progress: 0, scheduled: 0, completed: 0 };
    for (const item of all) c[bucketOf(item)]++;
    return c;
  }, [all]);

  const stats = useMemo(() => {
    const now = Date.now();
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    return {
      completedMonth: all.filter(
        (c) => c.status === "completed" && c.completedAt && new Date(c.completedAt).getTime() >= monthStart.getTime(),
      ).length,
      overdue: all.filter(
        (c) => !isClosed(c) && c.lastWorkingDate && new Date(c.lastWorkingDate).getTime() < now,
      ).length,
    };
  }, [all]);

  const filtered = all
    .filter((c) => bucketOf(c) === tab)
    .filter((c) => {
      if (typeFilter && c.type !== typeFilter) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      const emp = employeeById.get(c.employee.id);
      return (
        caseName(c).toLowerCase().includes(q) ||
        (emp?.designation?.title ?? emp?.designationName ?? "").toLowerCase().includes(q)
      );
    });

  const selected = filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? null;

  const readyToComplete = all.filter(
    (c) => !isClosed(c) && c.tasks.length > 0 && c.tasks.every((t) => t.status === "completed"),
  );
  const insightText = readyToComplete.length
    ? `${readyToComplete.length} offboarding${readyToComplete.length === 1 ? " is" : "s are"} ready to complete — all checklist tasks are done.`
    : stats.overdue
      ? `${stats.overdue} offboarding${stats.overdue === 1 ? " is" : "s are"} past the last working day — review blockers.`
      : "All offboardings are on track.";
  const firstReady = readyToComplete[0] ?? null;

  function exportCsv() {
    const header = ["Employee", "Type", "Status", "Last working day", "Tasks done", "Total tasks"];
    const rows = all.map((c) => {
      const { done: d, total: t } = taskProgress(c);
      return [
        caseName(c),
        typeLabel(c.type),
        bucketLabel(c),
        c.lastWorkingDate ? new Date(c.lastWorkingDate).toISOString().slice(0, 10) : "",
        String(d),
        String(t),
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "offboarding-cases.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Employee Offboarding" crumbs={["People", "Offboarding"]}>
        <button
          type="button"
          onClick={exportCsv}
          className="flex h-11 items-center gap-2 rounded-lg border border-border bg-surface px-5 text-xs font-medium text-text shadow-sm hover:bg-surface-elevated"
        >
          <Download size={16} />
          Export
        </button>
        {canManage ? (
          <button
            type="button"
            onClick={() => setInitiateOpen(true)}
            className="flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary-hover"
          >
            <Plus size={17} />
            Start Offboarding
          </button>
        ) : null}
      </PageHeader>
      <p className="mt-2 text-sm text-text-secondary">
        Manage and track the complete exit process for a smooth and secure transition.
      </p>

      {/* Top stats */}
      <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={<Users size={21} />}
          iconClass="bg-primary/10 text-primary"
          value={String(counts.in_progress)}
          label="In Progress"
        />
        <StatCard
          icon={<CheckCircle2 size={21} />}
          iconClass="bg-success/10 text-success"
          value={String(stats.completedMonth)}
          label="Completed"
          suffix="This Month"
        />
        <StatCard
          icon={<Clock3 size={21} />}
          iconClass="bg-surface-elevated text-text-muted"
          value={String(counts.scheduled)}
          label="Scheduled"
        />
        <StatCard
          icon={<AlertCircle size={21} />}
          iconClass="bg-error/10 text-error"
          value={String(stats.overdue)}
          label="Overdue"
        />
        <AiInsight
          text={insightText}
          onOpen={
            firstReady
              ? () => {
                  setTab("in_progress");
                  setSelectedId(firstReady.id);
                }
              : undefined
          }
        />
      </section>

      {/* Main content */}
      {cases.isLoading ? (
        <div className="mt-5 rounded-xl border border-border bg-surface p-5">
          <SectionSkeleton rows={5} />
        </div>
      ) : cases.isError ? (
        <div className="mt-5 rounded-xl border border-border bg-surface">
          <SectionError onRetry={() => cases.refetch()} />
        </div>
      ) : all.length === 0 ? (
        <div className="mt-5 rounded-xl border border-border bg-surface">
          <EmptyState
            icon={UserMinus}
            title="No offboarding cases"
            description="Offboarding cases appear when an employee exit is initiated."
            action={
              canManage ? (
                <PrimaryAction icon={Plus} label="Start Offboarding" onClick={() => setInitiateOpen(true)} />
              ) : undefined
            }
          />
        </div>
      ) : (
        <section className="mt-5 grid gap-4 xl:grid-cols-[455px_minmax(0,1fr)]">
          <CaseList
            cases={filtered}
            tab={tab}
            onTab={setTab}
            counts={counts}
            query={query}
            onQuery={setQuery}
            typeFilter={typeFilter}
            onTypeFilter={setTypeFilter}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            employeeById={employeeById}
          />
          {selected ? (
            <CaseDetail item={selected} employee={employeeById.get(selected.employee.id)} canManage={canManage} />
          ) : (
            <div className="rounded-xl border border-border bg-surface">
              <EmptyState
                icon={ShieldAlert}
                title="No case selected"
                description="Pick an employee from the list, or adjust the filters."
              />
            </div>
          )}
        </section>
      )}

      <InitiateDialog open={initiateOpen} onOpenChange={setInitiateOpen} />
    </div>
  );
}
