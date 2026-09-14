import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Key,
  Laptop,
  Mail,
  Monitor,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
} from "lucide-react";
import {
  useCancelOnboardingInstance,
  useEmployee,
  useEmployees,
  useOnboardingInstances,
  useOnboardingTemplates,
  useSetOnboardingTaskStatus,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import { useUIStore } from "../../stores/ui";
import type { Employee, OnboardingInstance, OnboardingTask, OnboardingTemplate } from "../../lib/api";
import { cn } from "../../lib/utils";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { Button } from "@teamspace-one/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { PageHeader, PrimaryAction } from "./common";
import { SectionError, SectionSkeleton, formatDate } from "../hrms/common";
import {
  ConvertToEmployeeDialog,
  StartOnboardingDialog,
  TemplateDialog,
} from "../hrms/onboarding";
import { EmployeeFormDialog } from "../hrms/employees";

/* ---------------- helpers ---------------- */

function instanceName(o: OnboardingInstance) {
  if (o.employee) return `${o.employee.firstName} ${o.employee.lastName}`.trim();
  return o.candidateName ?? o.candidateEmail ?? "—";
}

function initialsOf(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase() || "?";
}

function taskProgress(o: OnboardingInstance) {
  const total = o.tasks.length;
  const done = o.tasks.filter((t) => t.status === "completed").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function daysUntil(dateStr?: string | null) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: "Scheduled", cls: "bg-info/10 text-info" },
  in_progress: { label: "In Progress", cls: "bg-success/10 text-success" },
  completed: { label: "Completed", cls: "bg-primary/10 text-primary" },
  cancelled: { label: "Cancelled", cls: "bg-error/10 text-error" },
};

const ACCESS_RE =
  /access|account|email|laptop|device|vpn|github|jira|slack|teams|tool|software|provision|password|credential/i;

function accessIcon(title: string) {
  const s = title.toLowerCase();
  if (/mail|email/.test(s)) return Mail;
  if (/laptop|device|hardware/.test(s)) return Laptop;
  if (/vpn|password|security|credential/.test(s)) return ShieldCheck;
  if (/account|user|login/.test(s)) return Key;
  return Monitor;
}

function taskStatusLabel(t: OnboardingTask): { label: string; cls: string } {
  if (t.status === "completed") return { label: "Completed", cls: "bg-success/10 text-success" };
  if (t.dueDate && new Date(t.dueDate) <= new Date())
    return { label: "In Progress", cls: "bg-info/10 text-info" };
  return { label: "Pending", cls: "bg-warning/10 text-warning" };
}

/** Ordered checklist phases derived from task categories. */
function stepsFromTasks(tasks: OnboardingTask[]) {
  const cats: string[] = [];
  for (const t of tasks) {
    const c = t.category?.trim();
    if (c && !cats.includes(c)) cats.push(c);
  }
  return cats.length > 0 ? [...cats, "Completion"] : ["Checklist", "Completion"];
}

/* ---------------- stat card ---------------- */

function StatCard({
  icon: Icon,
  iconClass,
  value,
  label,
  suffix,
}: {
  icon: React.ElementType;
  iconClass: string;
  value: number;
  label: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4 shadow-[0_3px_18px_rgba(20,50,90,.035)]">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
            iconClass,
          )}
        >
          <Icon size={21} />
        </div>
        <div className="min-w-0">
          <div className="text-[25px] font-semibold tracking-tight text-text">{value}</div>
          <div className="text-xs text-text-secondary">{label}</div>
          {suffix ? <div className="mt-0.5 text-[10px] text-text-muted">{suffix}</div> : null}
        </div>
        <ChevronRight size={17} className="ml-auto text-text-muted" />
      </div>
    </div>
  );
}

function AiInsight({ text }: { text: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-mention/5 to-info/5 px-5 py-4">
      <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-mention/15 text-mention">
          <Sparkles size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">AI Insight</p>
          <p className="mt-1 text-[12px] leading-5 text-text-secondary">{text}</p>
        </div>
        <ChevronRight size={18} className="text-primary" />
      </div>
    </div>
  );
}

/* ---------------- templates list ---------------- */

function TemplatesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const templates = useOnboardingTemplates();
  const { can } = usePermissions();
  const canManage = can("hrms.onboarding.manage");
  const [editing, setEditing] = useState<OnboardingTemplate | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Onboarding templates</DialogTitle>
            <DialogDescription>
              Checklists applied when a new joiner starts onboarding.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 p-4 pt-2">
            {templates.isLoading ? (
              <SectionSkeleton rows={3} />
            ) : (templates.data ?? []).length === 0 ? (
              <p className="py-4 text-center text-xs text-text-muted">
                No templates yet — the default checklist is used.
              </p>
            ) : (
              (templates.data ?? []).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-text">{t.name}</p>
                    <p className="mt-0.5 text-[10px] text-text-muted">
                      {t.tasks.length} task{t.tasks.length === 1 ? "" : "s"}
                      {t.isActive ? " · Active" : " · Inactive"}
                    </p>
                  </div>
                  {canManage ? (
                    <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end gap-2 p-4 pt-0">
            {canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1 h-3.5 w-3.5" /> New template
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
      <TemplateDialog
        open={Boolean(editing)}
        onOpenChange={(o) => {
          if (!o) setEditing(null);
        }}
        template={editing}
      />
      <TemplateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

/* ---------------- main screen ---------------- */

export function HrOnboardingScreen() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { can } = usePermissions();
  const canManage = can("hrms.onboarding.manage");

  const instances = useOnboardingInstances();
  const employees = useEmployees();

  const [tab, setTab] = useState<"in_progress" | "pending" | "completed">("in_progress");
  const [search, setSearch] = useState("");
  const [taskTab, setTaskTab] = useState("Tasks");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [convertInstance, setConvertInstance] = useState<OnboardingInstance | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const cancel = useCancelOnboardingInstance();
  const setTask = useSetOnboardingTaskStatus();

  const list = useMemo(
    () => (instances.data ?? []).filter((o) => o.status !== "cancelled"),
    [instances.data],
  );

  const empMap = useMemo(
    () => new Map((employees.data ?? []).map((e) => [e.id, e])),
    [employees.data],
  );

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      inProgress: list.filter((o) => o.status === "in_progress").length,
      completedMonth: list.filter(
        (o) => o.status === "completed" && o.completedAt && new Date(o.completedAt) >= monthStart,
      ).length,
      scheduled: list.filter((o) => o.status === "pending").length,
      overdue: list.filter(
        (o) =>
          o.status !== "completed" && o.startDate && new Date(o.startDate) < today,
      ).length,
    };
  }, [list]);

  const insight = useMemo(() => {
    const upcoming = list
      .filter((o) => o.status !== "completed" && o.startDate)
      .sort(
        (a, b) =>
          new Date(a.startDate as string).getTime() - new Date(b.startDate as string).getTime(),
      )[0];
    if (upcoming) {
      const days = daysUntil(upcoming.startDate);
      const { done, total } = taskProgress(upcoming);
      const when =
        days === 0 ? "today" : days && days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : "already";
      return `${instanceName(upcoming)} starts ${when} — ${total - done} of ${total} tasks still open.`;
    }
    if (stats.completedMonth > 0) {
      return `${stats.completedMonth} onboarding${stats.completedMonth === 1 ? "" : "s"} completed this month.`;
    }
    return "No onboardings in flight right now.";
  }, [list, stats.completedMonth]);

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return list.filter((o) => {
      if (o.status !== tab) return false;
      if (!term) return true;
      const e = o.employeeId ? empMap.get(o.employeeId) : undefined;
      const text = `${instanceName(o)} ${e?.designationName ?? e?.designation?.title ?? ""} ${e?.departmentName ?? e?.department?.name ?? ""}`.toLowerCase();
      return text.includes(term);
    });
  }, [list, tab, search, empMap]);

  const selected = list.find((o) => o.id === selectedId) ?? filtered[0] ?? null;
  const selectedEmployee = useEmployee(selected?.employeeId ?? undefined);
  const emp: Employee | undefined = selected?.employeeId
    ? (selectedEmployee.data ?? empMap.get(selected.employeeId))
    : undefined;

  const steps = useMemo(() => (selected ? stepsFromTasks(selected.tasks) : []), [selected]);
  const activeStep = useMemo(() => {
    if (!selected) return 0;
    const cats = steps.slice(0, -1);
    const idx = cats.findIndex((c) =>
      selected.tasks.some((t) => t.category === c && t.status !== "completed"),
    );
    return idx === -1 ? steps.length - 1 : idx;
  }, [selected, steps]);

  const taskCategories = useMemo(
    () => (selected ? steps.slice(0, -1) : []),
    [selected, steps],
  );
  const visibleTasks = useMemo(() => {
    if (!selected) return [];
    if (taskTab === "Tasks") return selected.tasks;
    return selected.tasks.filter((t) => t.category === taskTab);
  }, [selected, taskTab]);

  const accessTasks = useMemo(
    () =>
      selected
        ? selected.tasks.filter((t) => ACCESS_RE.test(t.title) || ACCESS_RE.test(t.category ?? ""))
        : [],
    [selected],
  );

  const welcomeEmail = emp?.workEmail ?? selected?.candidateEmail ?? null;

  if (instances.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="Employee Onboarding" />
        <div className="mt-6">
          <SectionSkeleton rows={8} />
        </div>
      </div>
    );
  }
  if (instances.isError) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="Employee Onboarding" />
        <div className="mt-6">
          <SectionError onRetry={() => instances.refetch()} />
        </div>
      </div>
    );
  }

  const progress = selected ? taskProgress(selected) : { done: 0, total: 0, pct: 0 };
  const meta = selected ? (STATUS_META[selected.status] ?? STATUS_META.pending) : null;
  const days = selected ? daysUntil(selected.startDate) : null;

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Employee Onboarding">
        <Button variant="secondary" onClick={() => setTemplatesOpen(true)}>
          <FileText className="mr-1.5 h-4 w-4" /> Templates
        </Button>
        {canManage ? (
          <PrimaryAction icon={Plus} label="Onboard New Employee" onClick={() => setStartOpen(true)} />
        ) : null}
      </PageHeader>
      <p className="mt-1 text-sm text-text-secondary">
        Set up new employees for success with a smooth, structured onboarding process.
      </p>

      {/* Stats */}
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Users} iconClass="bg-primary/10 text-primary" value={stats.inProgress} label="In Progress" />
        <StatCard icon={CheckCircle2} iconClass="bg-success/10 text-success" value={stats.completedMonth} label="Completed" suffix="This Month" />
        <StatCard icon={Clock3} iconClass="bg-info/10 text-info" value={stats.scheduled} label="Scheduled" />
        <StatCard icon={AlertCircle} iconClass="bg-error/10 text-error" value={stats.overdue} label="Overdue" />
        <AiInsight text={insight} />
      </div>

      {/* Content */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[400px_minmax(0,1fr)_285px]">
        {/* LEFT — instance list */}
        <div className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center border-b border-border px-4">
            {(
              [
                ["in_progress", "In Progress", stats.inProgress],
                ["pending", "Scheduled", stats.scheduled],
                ["completed", "Completed", stats.completedMonth],
              ] as const
            ).map(([key, name, count]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key);
                  setSelectedId(null);
                }}
                className={cn(
                  "relative px-3 py-4 text-xs font-medium",
                  tab === key ? "text-primary" : "text-text-secondary",
                )}
              >
                {name} ({count})
                {tab === key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                )}
              </button>
            ))}
          </div>
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search employee..."
                className="h-10 w-full rounded-lg border border-border bg-surface-elevated pl-9 pr-3 text-xs text-text outline-none placeholder:text-text-muted focus:border-primary/40"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="p-6 text-center text-xs text-text-muted">
                {list.length === 0 ? "No onboardings yet." : "Nothing matches this tab."}
              </p>
            ) : (
              filtered.map((o) => {
                const { pct } = taskProgress(o);
                const e = o.employeeId ? empMap.get(o.employeeId) : undefined;
                const role = e?.designationName ?? e?.designation?.title ?? o.template?.name ?? "—";
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(o.id);
                      setTaskTab("Tasks");
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-border px-4 py-4 text-left transition",
                      selected?.id === o.id ? "bg-primary/5" : "hover:bg-surface-elevated",
                    )}
                  >
                    <Avatar className="h-10 w-10 shrink-0">
                      <AvatarFallback className="text-xs font-semibold">
                        {initialsOf(instanceName(o))}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-text">{instanceName(o)}</p>
                      <p className="mt-1 truncate text-[10px] text-text-secondary">{role}</p>
                    </div>
                    <div className="w-[104px]">
                      <p className="text-[10px] text-text-muted">Joining on</p>
                      <p className="mt-1 text-[11px] font-medium text-text-secondary">
                        {formatDate(o.startDate)}
                      </p>
                    </div>
                    <div className="w-[64px]">
                      <div className="mb-2 text-right text-[11px] font-medium text-text-secondary">
                        {pct}%
                      </div>
                      <div className="ml-auto h-1.5 w-12 overflow-hidden rounded-full bg-surface-elevated">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-text-muted" />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* CENTER — selected instance detail */}
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {!selected ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-2 p-8 text-center">
              <UserCheck className="h-8 w-8 text-text-muted" />
              <p className="text-sm font-medium text-text">No onboarding selected</p>
              <p className="text-xs text-text-muted">
                Pick an employee on the left to review their checklist.
              </p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="text-lg font-semibold">
                      {initialsOf(instanceName(selected))}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-text">{instanceName(selected)}</h2>
                      <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", meta?.cls)}>
                        {meta?.label}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">
                      {emp?.designationName ?? emp?.designation?.title ?? "—"}
                      <span className="mx-2">•</span>
                      {emp?.departmentName ?? emp?.department?.name ?? "—"}
                      <span className="mx-2">•</span>
                      {emp?.employeeNumber ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <p className="text-[10px] text-text-secondary">Joining Date</p>
                    <p className="mt-1 text-sm font-semibold text-text">
                      {formatDate(selected.startDate)}
                    </p>
                    <p className="text-[10px] text-text-muted">
                      {days === null
                        ? ""
                        : days > 0
                          ? `${days} day${days === 1 ? "" : "s"} left`
                          : days === 0
                            ? "Starts today"
                            : "Start date passed"}
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-elevated text-text-secondary hover:text-text"
                        aria-label="More options"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {selected.employeeId ? (
                        <DropdownMenuItem
                          onClick={() =>
                            setActiveView("employee-detail", { employeeId: selected.employeeId as string })
                          }
                          className="flex items-center gap-2 text-xs"
                        >
                          <Users className="h-3.5 w-3.5" /> View employee profile
                        </DropdownMenuItem>
                      ) : null}
                      {canManage && selected.status === "pending" && selected.sourceType === "interview" ? (
                        <DropdownMenuItem
                          onClick={() => setConvertInstance(selected)}
                          className="flex items-center gap-2 text-xs"
                        >
                          <UserCheck className="h-3.5 w-3.5" /> Convert to employee
                        </DropdownMenuItem>
                      ) : null}
                      {canManage && selected.status !== "completed" ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              if (window.confirm(`Cancel onboarding for ${instanceName(selected)}?`)) {
                                cancel.mutate(selected.id);
                              }
                            }}
                            className="flex items-center gap-2 text-xs text-error"
                          >
                            Cancel onboarding
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Steps */}
              <div className="relative px-6 py-4">
                <div className="absolute left-[67px] right-[67px] top-[29px] h-[2px] bg-surface-elevated" />
                <div
                  className="absolute left-[67px] top-[29px] h-[2px] bg-primary"
                  style={{
                    width: `calc((100% - 134px) * ${activeStep} / ${Math.max(steps.length - 1, 1)})`,
                  }}
                />
                <div className="relative flex justify-between">
                  {steps.map((step, index) => {
                    const done = index < activeStep;
                    const active = index === activeStep;
                    return (
                      <div key={step} className="flex w-[100px] flex-col items-center">
                        <div
                          className={cn(
                            "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-medium",
                            done || active
                              ? "border-primary bg-primary text-white"
                              : "border-border bg-surface text-text-muted",
                          )}
                        >
                          {done ? <Check size={13} /> : index + 1}
                        </div>
                        <p
                          className={cn(
                            "mt-2 text-center text-[11px] font-medium",
                            active || done ? "text-text" : "text-text-muted",
                          )}
                        >
                          {step}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Task table */}
              <div className="px-4 pb-4">
                <div className="flex items-center justify-between border-b border-border">
                  <div className="flex gap-6 overflow-x-auto">
                    {["Tasks", ...taskCategories].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTaskTab(t)}
                        className={cn(
                          "relative whitespace-nowrap py-3 text-[11px]",
                          taskTab === t ? "font-semibold text-primary" : "text-text-secondary",
                        )}
                      >
                        {t}
                        {taskTab === t && (
                          <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="hidden items-center gap-3 md:flex">
                    <span className="text-[10px] text-text-secondary">
                      {progress.done} of {progress.total} completed
                    </span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-elevated">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${progress.pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-medium text-text-secondary">
                      {progress.pct}%
                    </span>
                  </div>
                </div>

                <div className="mt-3 overflow-hidden rounded-lg border border-border">
                  <div className="grid grid-cols-[30px_1.9fr_.65fr_.8fr_.9fr] bg-surface-elevated px-3 py-3 text-[10px] font-medium text-text-secondary">
                    <span>#</span>
                    <span>Task</span>
                    <span>Owner</span>
                    <span>Status</span>
                    <span>Due Date</span>
                  </div>
                  {visibleTasks.length === 0 ? (
                    <p className="border-t border-border px-3 py-6 text-center text-[11px] text-text-muted">
                      No tasks in this section.
                    </p>
                  ) : (
                    visibleTasks.map((t) => {
                      const st = taskStatusLabel(t);
                      const isDone = t.status === "completed";
                      return (
                        <div
                          key={t.id}
                          className="grid grid-cols-[30px_1.9fr_.65fr_.8fr_.9fr] items-center border-t border-border px-3 py-2.5"
                        >
                          <button
                            type="button"
                            disabled={!canManage || setTask.isPending}
                            onClick={() =>
                              setTask.mutate({
                                id: selected.id,
                                taskId: t.id,
                                action: isDone ? "reopen" : "complete",
                              })
                            }
                            className={cn(
                              "flex h-5 w-5 items-center justify-center rounded border transition",
                              isDone
                                ? "border-primary bg-primary text-white"
                                : "border-border bg-surface",
                              (!canManage || setTask.isPending) && "cursor-not-allowed opacity-60",
                            )}
                          >
                            {isDone && <Check size={12} />}
                          </button>
                          <span
                            className={cn(
                              "text-[10px]",
                              isDone ? "text-text-muted" : "font-medium text-text",
                            )}
                          >
                            {t.title}
                          </span>
                          <span className="text-[10px] text-text-secondary">
                            {t.category ?? "—"}
                          </span>
                          <div>
                            <span className={cn("rounded-lg px-2.5 py-1 text-[10px] font-medium", st.cls)}>
                              {st.label}
                            </span>
                          </div>
                          <span className="text-[10px] text-text-secondary">
                            {isDone ? formatDate(t.completedAt) : formatDate(t.dueDate)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT — preview rail */}
        <aside className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Employee Preview</h3>
              {selected && emp && can("hrms.employee.edit") ? (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="text-[11px] font-medium text-primary"
                >
                  Edit
                </button>
              ) : null}
            </div>
            {!selected ? (
              <p className="text-[10px] text-text-muted">Select an onboarding to preview.</p>
            ) : (
              <div className="space-y-3">
                {(
                  [
                    ["Full Name", instanceName(selected)],
                    ["Email", emp?.workEmail ?? selected.candidateEmail ?? "—"],
                    ["Department", emp?.departmentName ?? emp?.department?.name ?? "—"],
                    ["Designation", emp?.designationName ?? emp?.designation?.title ?? "—"],
                    [
                      "Reporting Manager",
                      emp?.manager
                        ? `${emp.manager.firstName} ${emp.manager.lastName}`.trim()
                        : "—",
                    ],
                    ["Joining Date", formatDate(selected.startDate)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[95px_1fr] gap-2 text-[10px]">
                    <span className="text-text-secondary">{label}</span>
                    <span className="truncate font-medium text-text">{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Access Provisioning</h3>
              <button
                type="button"
                onClick={() => setTaskTab("Tasks")}
                className="text-[11px] font-medium text-primary"
              >
                View All
              </button>
            </div>
            {accessTasks.length === 0 ? (
              <p className="text-[10px] text-text-muted">
                No access or account tasks on this checklist.
              </p>
            ) : (
              <div className="space-y-3">
                {accessTasks.map((t) => {
                  const Icon = accessIcon(t.title);
                  const ready = t.status === "completed";
                  return (
                    <div key={t.id} className="flex items-center gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-elevated text-primary">
                        <Icon size={14} />
                      </div>
                      <span className="flex-1 truncate text-[10px] text-text-secondary">{t.title}</span>
                      <span
                        className={cn(
                          "rounded-lg px-2.5 py-1 text-[9px] font-medium",
                          ready ? "bg-success/10 text-success" : "bg-warning/10 text-warning",
                        )}
                      >
                        {ready ? "Ready" : "Pending"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-mention/5 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mention/15 text-primary">
                <Mail size={19} />
              </div>
              <div className="flex-1">
                <h3 className="text-xs font-semibold text-text">Send Welcome Email</h3>
                <p className="mt-1 text-[10px] leading-5 text-text-secondary">
                  {selected
                    ? `Send a personalized welcome email to ${instanceName(selected)}.`
                    : "Select an onboarding to send a welcome email."}
                </p>
                <button
                  type="button"
                  disabled={!welcomeEmail}
                  onClick={() =>
                    window.open(
                      `mailto:${welcomeEmail}?subject=${encodeURIComponent("Welcome to the team!")}`,
                    )
                  }
                  className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-surface px-4 py-2 text-[10px] font-medium text-primary transition hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Send Now
                  <Send size={13} />
                </button>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <StartOnboardingDialog open={startOpen} onOpenChange={setStartOpen} />
      <TemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} />
      {convertInstance ? (
        <ConvertToEmployeeDialog
          instance={convertInstance}
          open={Boolean(convertInstance)}
          onOpenChange={(o) => {
            if (!o) setConvertInstance(null);
          }}
        />
      ) : null}
      {emp ? (
        <EmployeeFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          employee={emp}
        />
      ) : null}
    </div>
  );
}
