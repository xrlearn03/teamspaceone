import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bug,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleDot,
  Clock3,
  Filter,
  Grid2X2,
  List,
  MoreHorizontal,
  Plus,
  Search,
  type LucideIcon,
} from "lucide-react";
import { useCreateTask, useUpdateTask } from "../hooks/api";
import type { Project, Task, UserDto } from "../lib/api";
import { toast, toastError } from "../lib/toast";
import { cn } from "../lib/utils";
import { UserAvatar } from "../components/user-avatar";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { formatDate } from "./hrms/common";

/* =========================================================
   SHARED HELPERS (also used by my-projects.tsx)
========================================================= */

export const TASK_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked", "done"];
export const TASK_STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "Todo",
  in_progress: "In Progress",
  in_review: "In Review",
  blocked: "Blocked",
  done: "Done",
};

/** Bug reports are tracked as tasks: high/urgent priority or a "Bug"-prefixed title. */
export function isBugTask(task: Task) {
  return (
    task.status !== "done" &&
    (task.priority === "urgent" || task.priority === "high" || /^bug/i.test(task.title.trim()))
  );
}

export function severityClasses(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-error/10 text-error";
    case "high":
      return "bg-warning/10 text-warning";
    case "low":
      return "bg-surface-elevated text-text-muted";
    default:
      return "bg-info/10 text-info";
  }
}

export function severityLabel(priority: string) {
  return priority === "urgent" ? "Critical" : priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Critical",
};

const PRIORITY_CHIP_CLASSES: Record<string, string> = {
  urgent: "bg-error/10 text-error",
  high: "bg-error/10 text-error",
  medium: "bg-warning/10 text-warning",
  low: "bg-success/10 text-success",
};

/* =========================================================
   KANBAN MODEL
========================================================= */

type ColumnId = "todo" | "in_progress" | "in_review" | "blocked" | "bug" | "done";
type BoardTab = "kanban" | "list" | "calendar" | "due" | "completed";

interface BoardColumn {
  id: ColumnId;
  title: string;
  /** Statuses that bucket into this column (empty for the derived "bug" bucket). */
  statuses: string[];
  /** Status applied when a card is dropped here (null = set priority instead). */
  dropStatus: string | null;
  icon: LucideIcon;
  accent: string;
  bg: string;
}

const BOARD_COLUMNS: BoardColumn[] = [
  { id: "todo", title: "To Do", statuses: ["backlog", "todo"], dropStatus: "todo", icon: Circle, accent: "text-text-secondary", bg: "bg-surface-elevated/60" },
  { id: "in_progress", title: "In Progress", statuses: ["in_progress"], dropStatus: "in_progress", icon: CircleDot, accent: "text-info", bg: "bg-info/5" },
  { id: "in_review", title: "Review", statuses: ["in_review"], dropStatus: "in_review", icon: Clock3, accent: "text-primary", bg: "bg-primary/5" },
  { id: "blocked", title: "Hold", statuses: ["blocked"], dropStatus: "blocked", icon: CircleDot, accent: "text-warning", bg: "bg-warning/5" },
  { id: "bug", title: "Bug", statuses: [], dropStatus: null, icon: Bug, accent: "text-error", bg: "bg-error/5" },
  { id: "done", title: "Done", statuses: ["done"], dropStatus: "done", icon: CheckCircle2, accent: "text-success", bg: "bg-success/5" },
];

function bucketOf(task: Task): ColumnId {
  if (task.status === "done") return "done";
  // Active statuses outrank the bug bucket so dragging a bug to In Progress /
  // Review / Hold actually moves it there; the Bug column holds untriaged bugs.
  if (task.status === "in_progress" || task.status === "in_review" || task.status === "blocked") {
    return task.status;
  }
  if (isBugTask(task)) return "bug";
  return "todo";
}

function isDueSoon(task: Task, now: number) {
  if (!task.dueDate || task.status === "done") return false;
  const due = new Date(task.dueDate).getTime();
  return due >= now - 24 * 60 * 60 * 1000 && due <= now + 7 * 24 * 60 * 60 * 1000;
}

/* =========================================================
   TASK CARD
========================================================= */

function TaskCard({
  task,
  projectName,
  user,
  canEdit,
  dragging,
  onDragStart,
  onDragEnd,
  onCardDragOver,
  onOpen,
}: {
  task: Task;
  projectName: string;
  user?: UserDto;
  canEdit: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onCardDragOver: (e: React.DragEvent) => void;
  onOpen: () => void;
}) {
  const bug = isBugTask(task);
  return (
    <article
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={canEdit ? onCardDragOver : undefined}
      onClick={onOpen}
      className={cn(
        "group rounded-xl border border-border bg-surface p-3 shadow-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md",
        canEdit && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[11px] font-semibold leading-[1.35] text-text">{task.title}</h3>
          <p className="mt-1 truncate text-[9px] text-text-muted">{projectName}</p>
        </div>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-md p-1 text-text-muted hover:bg-surface-elevated hover:text-text"
        >
          <MoreHorizontal size={15} />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {bug ? (
          <span className="rounded-md bg-error/10 px-2 py-1 text-[8px] font-semibold text-error">Bug</span>
        ) : null}
        <span className={cn("rounded-md px-2 py-1 text-[8px] font-semibold", PRIORITY_CHIP_CLASSES[task.priority] ?? "bg-surface-elevated text-text-muted")}>
          {PRIORITY_LABELS[task.priority] ?? task.priority}
        </span>
        <span className="rounded-md bg-surface-elevated px-2 py-1 text-[8px] font-semibold text-text-secondary">
          {TASK_STATUS_LABELS[task.status] ?? task.status}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[9px] text-text-muted">
          <CalendarDays size={12} />
          <span>{task.dueDate ? formatDate(task.dueDate) : "No due date"}</span>
        </div>
        {user ? (
          <UserAvatar user={user} className="h-6 w-6 border-2 border-surface" fallbackClassName="text-[8px]" />
        ) : null}
      </div>
    </article>
  );
}

/* =========================================================
   KANBAN COLUMN
========================================================= */

function KanbanColumn({
  column,
  tasks,
  projectMap,
  userMap,
  canEdit,
  canCreate,
  dragTaskId,
  dropIndex,
  dragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onCardDragOver,
  onDrop,
  onDragLeave,
  onAdd,
  onOpen,
}: {
  column: BoardColumn;
  tasks: Task[];
  projectMap: Map<string, Project>;
  userMap: Map<string, UserDto>;
  canEdit: boolean;
  canCreate: boolean;
  dragTaskId: string | null;
  dropIndex: number | null;
  dragOver: boolean;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onCardDragOver: (index: number) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onAdd: () => void;
  onOpen: (task: Task) => void;
}) {
  const Icon = column.icon;
  return (
    <section
      onDragOver={canEdit ? onDragOver : undefined}
      onDrop={canEdit ? onDrop : undefined}
      onDragLeave={canEdit ? onDragLeave : undefined}
      className={cn(
        "flex min-w-[185px] flex-1 flex-col rounded-xl border border-border p-1.5 transition-colors",
        column.bg,
        dragOver && "border-primary/50 ring-1 ring-primary/30",
      )}
    >
      <div className="flex h-11 items-center gap-2 px-2">
        <span className={column.accent}>
          <Icon size={18} />
        </span>
        <h2 className={cn("text-[12px] font-semibold", column.accent)}>{column.title}</h2>
        <span className={cn("ml-auto text-[11px] font-semibold", column.id === "bug" ? "text-error" : "text-text-secondary")}>
          {tasks.length}
        </span>
      </div>

      <div className="flex min-h-[420px] flex-col gap-2">
        {tasks.map((task, index) => (
          <div key={task.id}>
            {dragOver && dropIndex === index && dragTaskId && dragTaskId !== task.id ? (
              <div className="mb-2 h-0.5 rounded-full bg-primary" />
            ) : null}
            <TaskCard
              task={task}
              projectName={projectMap.get(task.projectId)?.name ?? "Project"}
              user={task.assigneeId ? userMap.get(task.assigneeId) : undefined}
              canEdit={canEdit}
              dragging={dragTaskId === task.id}
              onDragStart={() => onDragStart(task.id)}
              onDragEnd={onDragEnd}
              onCardDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > rect.top + rect.height / 2;
                onCardDragOver(index + (after ? 1 : 0));
              }}
              onOpen={() => onOpen(task)}
            />
          </div>
        ))}
        {dragOver && dropIndex === tasks.length && dragTaskId ? (
          <div className="h-0.5 rounded-full bg-primary" />
        ) : null}
        {canCreate ? (
          <button
            type="button"
            onClick={onAdd}
            className="group mt-1 flex h-9 items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[9px] font-medium text-text-muted transition hover:border-primary/40 hover:bg-surface hover:text-primary"
          >
            <Plus size={13} />
            Add task
          </button>
        ) : null}
      </div>
    </section>
  );
}

/* =========================================================
   ADD TASK DIALOG
========================================================= */

const selectCls = "h-9 w-full rounded-lg border border-border bg-surface px-3 text-[11px] text-text outline-none focus:border-primary/50";
const labelCls = "text-[10px] font-medium text-text-secondary";

function AddTaskDialog({
  open,
  onOpenChange,
  projects,
  meId,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: Project[];
  meId?: string;
  defaults?: { projectId?: string; status?: string; priority?: string };
}) {
  const createTask = useCreateTask();
  const [projectId, setProjectId] = useState(defaults?.projectId ?? "");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState(defaults?.status ?? "todo");
  const [priority, setPriority] = useState(defaults?.priority ?? "medium");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");

  function submit() {
    if (!projectId || !title.trim()) return;
    createTask.mutate(
      {
        projectId,
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        priority,
        dueDate: dueDate || undefined,
        assigneeId: meId,
      },
      {
        onSuccess: () => {
          toast.success("Task created.");
          setTitle("");
          setDescription("");
          setDueDate("");
          onOpenChange(false);
        },
        onError: (err) => toastError(err, "Failed to create task"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add task</DialogTitle>
          <DialogDescription>Create a task assigned to you in one of your projects.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Project *</span>
            <select className={selectCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Title *</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs to be done?" />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Status</span>
              <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Priority</span>
              <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Critical</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Due date</span>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Description</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details…"
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-[11px] text-text outline-none focus:border-primary/50"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createTask.isPending || !projectId || !title.trim()}>Add Task</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================
   CALENDAR VIEW
========================================================= */

function CalendarView({ tasks, projectMap, onOpen }: { tasks: Task[]; projectMap: Map<string, Project>; onOpen: (t: Task) => void }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - ((gridStart.getDay() + 6) % 7)); // back to Monday
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-text">
          {monthStart.toLocaleDateString([], { month: "long", year: "numeric" })}
        </p>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setMonthOffset((m) => m - 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary" aria-label="Previous month">
            <ChevronLeft size={14} />
          </button>
          <button type="button" onClick={() => setMonthOffset(0)} className="h-8 rounded-lg border border-border px-3 text-[10px] font-medium text-text-secondary">
            Today
          </button>
          <button type="button" onClick={() => setMonthOffset((m) => m + 1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary" aria-label="Next month">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-1 py-1 text-center text-[9px] font-semibold uppercase text-text-muted">{d}</div>
        ))}
        {cells.map((d) => {
          const dayTasks = tasksByDay.get(dayKey(d)) ?? [];
          const inMonth = d.getMonth() === monthStart.getMonth();
          const isToday = dayKey(d) === dayKey(now);
          return (
            <div
              key={d.toISOString()}
              className={cn(
                "min-h-[84px] rounded-lg border border-border p-1.5",
                inMonth ? "bg-surface" : "bg-surface-elevated/40 opacity-50",
                isToday && "border-primary/50",
              )}
            >
              <p className={cn("text-[9px] font-semibold", isToday ? "text-primary" : "text-text-muted")}>{d.getDate()}</p>
              <div className="mt-1 space-y-1">
                {dayTasks.slice(0, 3).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpen(t)}
                    title={`${t.title} — ${projectMap.get(t.projectId)?.name ?? ""}`}
                    className={cn(
                      "block w-full truncate rounded px-1.5 py-0.5 text-left text-[8px] font-medium",
                      t.status === "done" ? "bg-success/10 text-success line-through" : isBugTask(t) ? "bg-error/10 text-error" : "bg-primary/10 text-primary",
                    )}
                  >
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 3 ? (
                  <p className="px-1 text-[8px] text-text-muted">+{dayTasks.length - 3} more</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   LIST / TABLE VIEW
========================================================= */

function TaskRow({ task, projectMap, userMap, canEdit, onOpen }: { task: Task; projectMap: Map<string, Project>; userMap: Map<string, UserDto>; canEdit: boolean; onOpen: () => void }) {
  const updateTask = useUpdateTask();
  return (
    <div className="grid grid-cols-[1.4fr_1fr_130px_100px_120px_60px] items-center border-t border-border px-4 py-3">
      <button type="button" onClick={onOpen} className="min-w-0 truncate text-left text-[11px] font-semibold text-text hover:text-primary">
        {task.title}
      </button>
      <span className="truncate text-[10px] text-text-muted">{projectMap.get(task.projectId)?.name ?? "Project"}</span>
      <span>
        {canEdit ? (
          <select
            className="h-8 rounded-md border border-border bg-surface px-2 text-[10px] text-text outline-none focus:border-primary/50"
            value={task.status}
            disabled={updateTask.isPending}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => updateTask.mutate({ taskId: task.id, projectId: task.projectId, body: { status: e.target.value } })}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
            ))}
          </select>
        ) : (
          <span className="rounded-md bg-surface-elevated px-2 py-1 text-[9px] font-medium text-text-secondary">
            {TASK_STATUS_LABELS[task.status] ?? task.status}
          </span>
        )}
      </span>
      <span>
        <span className={cn("rounded-md px-2 py-1 text-[8px] font-semibold", PRIORITY_CHIP_CLASSES[task.priority])}>
          {PRIORITY_LABELS[task.priority] ?? task.priority}
        </span>
      </span>
      <span className="text-[10px] text-text-muted">{task.dueDate ? formatDate(task.dueDate) : "—"}</span>
      <span>{task.assigneeId ? <UserAvatar user={userMap.get(task.assigneeId)} className="h-6 w-6" fallbackClassName="text-[8px]" /> : null}</span>
    </div>
  );
}

function TaskTable({ tasks, projectMap, userMap, canEdit, onOpen }: { tasks: Task[]; projectMap: Map<string, Project>; userMap: Map<string, UserDto>; canEdit: boolean; onOpen: (t: Task) => void }) {
  if (tasks.length === 0) {
    return <p className="p-8 text-center text-[11px] text-text-muted">No tasks match.</p>;
  }
  return (
    <div className="overflow-x-auto p-4">
      <div className="min-w-[760px] overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[1.4fr_1fr_130px_100px_120px_60px] bg-surface-elevated px-4 py-3 text-[9px] font-semibold uppercase text-text-muted">
          <span>Task</span>
          <span>Project</span>
          <span>Status</span>
          <span>Priority</span>
          <span>Due Date</span>
          <span />
        </div>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} projectMap={projectMap} userMap={userMap} canEdit={canEdit} onOpen={() => onOpen(task)} />
        ))}
      </div>
    </div>
  );
}

function EmptyBoard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      <h2 className="mt-4 text-[15px] font-semibold text-text">{title}</h2>
      <p className="mt-2 max-w-sm text-[11px] leading-5 text-text-muted">{description}</p>
    </div>
  );
}

/* =========================================================
   BOARD
========================================================= */

export function MyTasksBoard({
  tasks,
  projects,
  projectMap,
  userMap,
  meId,
  canEdit,
  canCreate,
  onOpenProject,
}: {
  tasks: Task[];
  projects: Project[];
  projectMap: Map<string, Project>;
  userMap: Map<string, UserDto>;
  meId?: string;
  canEdit: boolean;
  canCreate: boolean;
  onOpenProject: (projectId: string) => void;
}) {
  const updateTask = useUpdateTask();
  const [boardTab, setBoardTab] = useState<BoardTab>("kanban");
  const [projectFilter, setProjectFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [showFilter, setShowFilter] = useState(false);
  const [search, setSearch] = useState("");
  const [addDialog, setAddDialog] = useState<{ open: boolean; status?: string; priority?: string }>({ open: false });
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<ColumnId | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  function resetDrag() {
    setDragTaskId(null);
    setDragOverColumn(null);
    setDropIndex(null);
  }

  const filtered = useMemo(
    () =>
      tasks.filter((t) => {
        const projectName = projectMap.get(t.projectId)?.name ?? "";
        const matchesSearch =
          !search ||
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          projectName.toLowerCase().includes(search.toLowerCase());
        const matchesProject = projectFilter === "all" || t.projectId === projectFilter;
        const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
        return matchesSearch && matchesProject && matchesPriority;
      }),
    [tasks, search, projectFilter, priorityFilter, projectMap],
  );

  const columned = useMemo(() => {
    const grouped = new Map<ColumnId, Task[]>(BOARD_COLUMNS.map((c) => [c.id, []]));
    for (const t of filtered) grouped.get(bucketOf(t))!.push(t);
    return grouped;
  }, [filtered]);

  const now = Date.now();
  const dueSoon = filtered.filter((t) => isDueSoon(t, now)).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  const completed = filtered.filter((t) => t.status === "done").sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
  const openCount = filtered.filter((t) => t.status !== "done").length;
  const bugCount = filtered.filter(isBugTask).length;

  function dropTask(column: BoardColumn, e: React.DragEvent) {
    e.preventDefault();
    const position = dropIndex;
    resetDrag();
    if (!canEdit) return;
    const taskId = e.dataTransfer.getData("text/plain");
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;
    const sameBucket = bucketOf(task) === column.id;
    if (sameBucket && position === null) return;
    const body: { status?: string; priority?: string; position?: number } = {};
    // The Bug column is derived (priority/title), so dropping there raises
    // priority to critical instead of writing a status. A task pulled out of
    // done/in-progress/review also needs an open status to stay in the bucket.
    if (column.id === "bug") {
      body.priority = "urgent";
      if (task.status === "done" || task.status === "in_progress" || task.status === "in_review") {
        body.status = "todo";
      }
    } else {
      body.status = column.dropStatus!;
    }
    if (position !== null) body.position = position;
    updateTask.mutate(
      { taskId: task.id, projectId: task.projectId, body },
      { onError: (err) => toastError(err, "Couldn't move task") },
    );
  }

  const openTask = (task: Task) => onOpenProject(task.projectId);

  const boardTabs: { key: BoardTab; label: string; icon: React.ReactNode }[] = [
    { key: "kanban", label: "Kanban", icon: <Grid2X2 size={15} /> },
    { key: "list", label: "List", icon: <List size={15} /> },
    { key: "calendar", label: "Calendar", icon: <CalendarDays size={15} /> },
    { key: "due", label: `Due Soon (${dueSoon.length})`, icon: <Clock3 size={15} /> },
    { key: "completed", label: `Completed (${completed.length})`, icon: <CheckCircle2 size={15} /> },
  ];

  return (
    <div>
      {/* Board toolbar */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex overflow-x-auto">
          {boardTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setBoardTab(t.key)}
              className={cn(
                "relative flex h-11 items-center gap-2 whitespace-nowrap px-4 text-[10px] font-medium",
                boardTab === t.key ? "text-primary" : "text-text-secondary hover:text-text",
              )}
            >
              {t.icon}
              {t.label}
              {boardTab === t.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="h-9 appearance-none rounded-lg border border-border bg-surface pl-3 pr-8 text-[10px] font-semibold text-text outline-none focus:border-primary/50"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
          </div>

          <button
            type="button"
            onClick={() => setShowFilter((s) => !s)}
            className={cn(
              "flex h-9 items-center gap-2 rounded-lg border px-4 text-[10px] font-semibold",
              showFilter || priorityFilter !== "all"
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-surface text-text-secondary",
            )}
          >
            <Filter size={14} />
            Filter
          </button>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="h-9 w-[200px] rounded-lg border border-border bg-surface pl-9 pr-3 text-[10px] text-text outline-none placeholder:text-text-muted focus:border-primary/50"
            />
          </div>

          {canCreate ? (
            <Button onClick={() => setAddDialog({ open: true })} className="h-9 text-[11px]">
              <Plus size={15} className="mr-1" /> Add Task
            </Button>
          ) : null}
        </div>
      </div>

      {/* Priority filter strip */}
      {showFilter ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-surface p-3">
          <span className="text-[10px] font-semibold text-text-secondary">Priority:</span>
          {["all", "urgent", "high", "medium", "low"].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPriorityFilter(p)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[9px] font-semibold",
                priorityFilter === p ? "bg-primary/10 text-primary" : "border border-border text-text-muted hover:bg-surface-elevated",
              )}
            >
              {p === "all" ? "All Priorities" : PRIORITY_LABELS[p]}
            </button>
          ))}
        </div>
      ) : null}

      {/* Board content */}
      <div className="mt-3">
        {boardTab === "kanban" && (
          <div className="overflow-x-auto">
            <div className="flex min-w-[1180px] gap-1.5">
              {BOARD_COLUMNS.map((column) => {
                const columnTasks = columned.get(column.id) ?? [];
                return (
                  <KanbanColumn
                    key={column.id}
                    column={column}
                    tasks={columnTasks}
                    projectMap={projectMap}
                    userMap={userMap}
                    canEdit={canEdit}
                    canCreate={canCreate}
                    dragTaskId={dragTaskId}
                    dropIndex={dropIndex}
                    dragOver={dragOverColumn === column.id}
                    onDragStart={setDragTaskId}
                    onDragEnd={resetDrag}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverColumn(column.id);
                      // Hovering column chrome (not a card) drops at the end.
                      setDropIndex(columnTasks.length);
                    }}
                    onCardDragOver={(index) => {
                      setDragOverColumn(column.id);
                      setDropIndex(index);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragOverColumn((c) => (c === column.id ? null : c));
                        setDropIndex(null);
                      }
                    }}
                    onDrop={(e) => dropTask(column, e)}
                    onAdd={() => setAddDialog({ open: true, status: column.dropStatus ?? "todo", priority: column.id === "bug" ? "urgent" : "medium" })}
                    onOpen={openTask}
                  />
                );
              })}
            </div>
          </div>
        )}

        {boardTab === "list" && <TaskTable tasks={filtered} projectMap={projectMap} userMap={userMap} canEdit={canEdit} onOpen={openTask} />}

        {boardTab === "calendar" && <CalendarView tasks={filtered} projectMap={projectMap} onOpen={openTask} />}

        {boardTab === "due" &&
          (dueSoon.length === 0 ? (
            <EmptyBoard icon={<Clock3 size={28} />} title="Due Soon" description="Tasks due within the next 7 days will appear here." />
          ) : (
            <TaskTable tasks={dueSoon} projectMap={projectMap} userMap={userMap} canEdit={canEdit} onOpen={openTask} />
          ))}

        {boardTab === "completed" &&
          (completed.length === 0 ? (
            <EmptyBoard icon={<CheckCircle2 size={28} />} title="Completed Tasks" description="Tasks you finish will appear here." />
          ) : (
            <TaskTable tasks={completed} projectMap={projectMap} userMap={userMap} canEdit={canEdit} onOpen={openTask} />
          ))}
      </div>

      {/* Footer summary */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border px-2 pt-3 text-[10px] text-text-muted">
        <div className="flex items-center gap-4">
          <span>{openCount} active task{openCount === 1 ? "" : "s"}</span>
          <span>{dueSoon.length} due soon</span>
          <span>{bugCount} open bug{bugCount === 1 ? "" : "s"}</span>
        </div>
        <button type="button" onClick={() => setBoardTab("list")} className="flex items-center gap-1 font-medium text-primary">
          View all tasks
          <ArrowRight size={12} />
        </button>
      </div>

      <AddTaskDialog
        key={`${addDialog.status ?? ""}-${addDialog.priority ?? ""}-${addDialog.open}`}
        open={addDialog.open}
        onOpenChange={(o) => setAddDialog((d) => ({ ...d, open: o }))}
        projects={projects}
        meId={meId}
        defaults={{ status: addDialog.status, priority: addDialog.priority }}
      />
    </div>
  );
}
