import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FileText,
  Mail,
  Megaphone,
  MessageSquare,
  Sparkles,
  Users,
  Video,
  BriefcaseBusiness,
} from "lucide-react";
import {
  useAttendance,
  useAttendanceCheckin,
  useDailyDigest,
  useEmployeeBirthdays,
  useMe,
  useMeetings,
  useMyEmployee,
  useNotifications,
  useProjects,
  useTimeEntries,
  useTodos,
  useUpdateTodo,
} from "@/hooks/api";
import * as api from "@/lib/api";
import type { DailyDigestResult, Meeting, Todo } from "@/lib/api";
import { usePermissions } from "@/hooks/usePermissions";
import { normalizeDigest } from "@/features/dashboard/widgets";
import { useUIStore } from "@/stores/ui";
import { cn, getUserDisplayName } from "@/lib/utils";
import { formatMinutes, formatTime } from "@/screens/hrms/common";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";

/* =========================================================
   HELPERS
========================================================= */

const DAY_TARGET_MIN = 8 * 60;
const WEEK_TARGET_MIN = 40 * 60;

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Week containing today. `to` is exclusive (next Monday) — the
 * time-entries API filters `date < to`.
 */
function weekRange() {
  const now = new Date();
  const mondayOffset = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  const nextMonday = new Date(monday);
  nextMonday.setDate(monday.getDate() + 7);
  return {
    from: monday.toISOString().slice(0, 10),
    to: nextMonday.toISOString().slice(0, 10),
  };
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function meetingDuration(m: Meeting) {
  if (!m.durationMinutes) return null;
  return m.durationMinutes >= 60
    ? `${Math.floor(m.durationMinutes / 60)}h${m.durationMinutes % 60 ? ` ${m.durationMinutes % 60}m` : ""}`
    : `${m.durationMinutes} min`;
}

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase() || "?";
}

const QUOTES = [
  "Progress happens one focused day at a time.",
  "Small steps every day add up to big results.",
  "A better you builds a brighter tomorrow.",
  "Focus on being productive, not busy.",
  "Done is better than perfect.",
];

function dailyQuote() {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const dayOfYear = Math.floor((Date.now() - start.getTime()) / 86400000);
  return QUOTES[dayOfYear % QUOTES.length];
}

/* =========================================================
   AI DAILY BRIEF
========================================================= */

const BRIEF_ICONS = [
  { icon: Check, iconClass: "bg-success/10 text-success" },
  { icon: CalendarDays, iconClass: "bg-primary/10 text-primary" },
  { icon: Mail, iconClass: "bg-warning/10 text-warning" },
  { icon: Sparkles, iconClass: "bg-mention/10 text-mention" },
];

function AIDailyBrief({
  digest,
  loading,
  fallbackItems,
}: {
  digest: DailyDigestResult | null;
  loading: boolean;
  fallbackItems: { title: string; description: string }[];
}) {
  const setActiveView = useUIStore((s) => s.setActiveView);

  const items = useMemo(() => {
    if (!digest) return fallbackItems;
    const flat = digest.sections.flatMap((s) =>
      s.items.map((item) => ({ title: item, description: s.title })),
    );
    return flat.length > 0 ? flat.slice(0, 4) : fallbackItems;
  }, [digest, fallbackItems]);

  return (
    <section className="relative min-h-[300px] overflow-hidden rounded-xl border border-border bg-surface p-6">
      <div className="pointer-events-none absolute -right-8 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-8 h-48 w-48 rounded-full bg-info/10 blur-3xl" />

      <div className="relative z-10 max-w-[70%] lg:max-w-[62%]">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-text">AI Daily Brief</h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Beta
              </span>
            </div>
            <p className="text-xs text-text-secondary">Your personalized update for today</p>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {loading ? (
            <p className="text-xs leading-5 text-text-secondary">Generating daily brief…</p>
          ) : (
            items.map((item, i) => {
              const preset = BRIEF_ICONS[i % BRIEF_ICONS.length];
              const Icon = preset.icon;
              return (
                <BriefItem
                  key={`${item.title}-${i}`}
                  icon={<Icon size={16} />}
                  iconClass={preset.iconClass}
                  title={item.title}
                  description={item.description}
                />
              );
            })
          )}
        </div>

        <button
          onClick={() => setActiveView("ai")}
          className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-xs font-semibold text-primary transition hover:border-primary/40"
        >
          View Details
          <ArrowRight size={13} />
        </button>
      </div>

      {/* AI Orb */}
      <div className="absolute right-[6%] top-[26%] hidden lg:block">
        <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-primary/10 shadow-[0_0_60px_rgba(99,102,241,0.15)]">
          <div className="absolute inset-5 rounded-full border border-surface/70" />
          <div className="absolute inset-10 rounded-full border border-surface/80" />
          <Sparkles size={34} className="text-primary" />
        </div>
        <div className="mt-4 text-center">
          <p className="text-xs font-semibold text-text">Stay focused.</p>
          <p className="text-xs font-semibold text-text">You're on track!</p>
        </div>
      </div>
    </section>
  );
}

function BriefItem({
  icon,
  iconClass,
  title,
  description,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-text">{title}</p>
        <p className="mt-0.5 truncate text-[11px] text-text-muted">{description}</p>
      </div>
    </div>
  );
}

/* =========================================================
   TODAY'S SCHEDULE
========================================================= */

const SCHEDULE_DOT_COLORS = ["bg-success", "bg-primary", "bg-warning", "bg-info", "bg-mention"];

function TodaysSchedule({ meetings }: { meetings: Meeting[] }) {
  const setActiveView = useUIStore((s) => s.setActiveView);

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Today's Schedule</h2>
        <button
          onClick={() => setActiveView("meeting")}
          className="text-xs font-medium text-primary"
        >
          View All
        </button>
      </div>

      {meetings.length === 0 ? (
        <p className="mt-6 text-xs text-text-muted">No meetings scheduled for today.</p>
      ) : (
        <div className="relative mt-5">
          <div className="absolute bottom-3 left-[5px] top-3 w-px bg-border" />
          <div className="space-y-5">
            {meetings.map((m, i) => (
              <button
                key={m.id}
                onClick={() => setActiveView("meeting", { meetingId: m.id })}
                className="relative grid w-full grid-cols-[12px_62px_1fr] gap-3 text-left"
              >
                <div className="relative z-10 mt-1.5 flex justify-center">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      m.status === "started"
                        ? "bg-success"
                        : SCHEDULE_DOT_COLORS[i % SCHEDULE_DOT_COLORS.length],
                    )}
                  />
                </div>
                <div>
                  <p className="text-[11px] font-medium text-text">{formatTime(m.scheduledAt)}</p>
                  <p className="mt-1 text-[10px] text-text-muted">{meetingDuration(m) ?? ""}</p>
                </div>
                <div className="border-b border-border pb-3">
                  <p className="truncate text-xs font-semibold text-text">{m.title}</p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-text-muted">
                    <Video size={10} />
                    {m.participants?.length
                      ? `${m.participants.length} participant${m.participants.length === 1 ? "" : "s"}`
                      : (m.type ?? "Meeting")}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* =========================================================
   METRIC CARDS
========================================================= */

function MetricCard({
  icon,
  iconClass,
  title,
  value,
  subtitle,
  progress,
  ring,
  badge,
  action,
  onClick,
}: {
  icon: React.ReactNode;
  iconClass: string;
  title: string;
  value: string;
  subtitle: string;
  progress?: number;
  ring?: number;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-surface p-4",
        onClick && "cursor-pointer transition hover:border-primary/40",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-text-muted">{title}</p>
          <p className="mt-0.5 text-xl font-semibold text-text">{value}</p>
          <p className="truncate text-[10px] text-text-muted">{subtitle}</p>
        </div>
        {badge}
        {action}
        {ring !== undefined && (
          <div
            className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(var(--primary) ${ring}%, var(--surface-elevated) ${ring}% 100%)`,
            }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface">
              <span className="text-xs font-semibold text-text">{ring}%</span>
            </div>
          </div>
        )}
      </div>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/* =========================================================
   MY TASKS
========================================================= */

type TaskTab = "today" | "week" | "all";

function todoLabel(todo: Todo): { text: string; className: string } | null {
  const done = Boolean(todo.completedAt);
  if (done) return { text: "Done", className: "bg-primary/10 text-primary" };
  if (!todo.dueDate) return null;
  const due = todo.dueDate.slice(0, 10);
  const today = todayStr();
  if (due < today) return { text: "Overdue", className: "bg-error/10 text-error" };
  if (due === today) return { text: "Today", className: "bg-warning/10 text-warning" };
  return {
    text: new Date(todo.dueDate).toLocaleDateString([], { day: "numeric", month: "short" }),
    className: "bg-surface-elevated text-text-muted",
  };
}

function MyTasks({ todos }: { todos: Todo[] }) {
  const updateTodo = useUpdateTodo();
  const [tab, setTab] = useState<TaskTab>("today");

  const today = todayStr();
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const lists = useMemo<Record<TaskTab, Todo[]>>(() => {
    const sorted = [...todos].sort((a, b) => {
      if (Boolean(a.completedAt) !== Boolean(b.completedAt)) return a.completedAt ? 1 : -1;
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    });
    const due = (t: Todo) => t.dueDate?.slice(0, 10);
    return {
      today: sorted.filter((t) => due(t) !== undefined && due(t)! <= today),
      week: sorted.filter((t) => due(t) !== undefined && due(t)! <= weekEndStr),
      all: sorted,
    };
  }, [todos, today, weekEndStr]);

  const visible = lists[tab].slice(0, 6);

  const tabs: { key: TaskTab; label: string }[] = [
    { key: "today", label: `Today (${lists.today.length})` },
    { key: "week", label: `This Week (${lists.week.length})` },
    { key: "all", label: `All (${lists.all.length})` },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between px-4 pt-4">
        <h2 className="text-sm font-semibold text-text">My Tasks</h2>
      </div>

      <div className="mt-3 flex gap-1 border-b border-border px-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-t-lg px-3 py-2 text-[11px]",
              tab === t.key ? "bg-primary font-medium text-white" : "text-text-secondary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-xs text-text-muted">No tasks here. You're all caught up.</p>
        ) : (
          visible.map((todo) => {
            const done = Boolean(todo.completedAt);
            const label = todoLabel(todo);
            return (
              <div
                key={todo.id}
                className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-0"
              >
                <button
                  onClick={() => updateTodo.mutate({ todoId: todo.id, body: { completed: !done } })}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                    done ? "border-primary bg-primary text-white" : "border-border hover:border-primary",
                  )}
                >
                  {done && <Check size={12} />}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "truncate text-xs font-medium",
                      done ? "text-text-muted line-through" : "text-text",
                    )}
                  >
                    {todo.title}
                  </p>
                  {(todo.notes || todo.dueDate) && (
                    <p className="mt-1 truncate text-[10px] text-text-muted">
                      {todo.notes ?? `Due ${new Date(todo.dueDate!).toLocaleDateString()}`}
                    </p>
                  )}
                </div>
                {label && (
                  <span className={`rounded-md px-2 py-1 text-[10px] font-medium ${label.className}`}>
                    {label.text}
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/* =========================================================
   TEAM BIRTHDAYS
========================================================= */

function TeamBirthdays() {
  const { data: birthdays, isError } = useEmployeeBirthdays(7);
  if (isError || !birthdays || birthdays.length === 0) return null;

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Team Birthdays This Week</h2>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {birthdays.slice(0, 4).map((person) => (
          <div
            key={person.id}
            className="rounded-lg bg-gradient-to-b from-primary/10 to-surface p-2 text-center"
          >
            <div className="relative mx-auto h-12 w-12">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="text-xs">
                  {initials(person.firstName, person.lastName)}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -right-1 -top-2 text-[15px]">🎉</span>
            </div>
            <p className="mt-2 truncate text-[10px] font-semibold text-text">
              {person.firstName} {person.lastName}
            </p>
            <p className="mt-1 text-[10px] font-medium text-success">
              {person.daysUntil === 0
                ? "Today"
                : new Date(person.date).toLocaleDateString([], { day: "numeric", month: "short" })}
            </p>
            <p className="mt-0.5 truncate text-[9px] text-text-muted">
              {person.departmentName ?? ""}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* =========================================================
   MY PROJECTS
========================================================= */

const PROJECT_BAR_COLORS = ["bg-primary", "bg-info", "bg-success", "bg-warning"];

function MyProjects() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: projects } = useProjects();

  const topProjects = useMemo(
    () =>
      (projects ?? [])
        .filter((p) => !p.isTemplate && !p.archivedAt)
        .sort((a, b) => (a.status === "active" ? -1 : 1) - (b.status === "active" ? -1 : 1))
        .slice(0, 4),
    [projects],
  );

  const taskQueries = useQueries({
    queries: topProjects.map((p) => ({
      queryKey: ["tasks", p.id],
      queryFn: () => api.getTasks(p.id),
      staleTime: 60 * 1000,
    })),
  });

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">My Projects</h2>
      </div>

      <div className="mt-3">
        {topProjects.length === 0 ? (
          <p className="py-4 text-xs text-text-muted">You're not a member of any project yet.</p>
        ) : (
          topProjects.map((project, i) => {
            const tasks = taskQueries[i]?.data ?? [];
            const progress =
              tasks.length > 0
                ? Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100)
                : 0;
            return (
              <button
                key={project.id}
                onClick={() => setActiveView("project", { projectId: project.id })}
                className="flex w-full items-center gap-3 border-b border-border py-2.5 text-left last:border-0"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <BriefcaseBusiness size={12} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text">{project.name}</p>
                </div>
                <div className="flex w-28 items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-elevated">
                    <div
                      className={`h-full rounded-full ${PROJECT_BAR_COLORS[i % PROJECT_BAR_COLORS.length]}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[10px] font-medium text-text-secondary">
                    {progress}%
                  </span>
                </div>
                <ChevronRight size={13} className="text-text-muted" />
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

/* =========================================================
   ANNOUNCEMENTS
========================================================= */

function notificationIcon(eventType: string) {
  const t = eventType.toLowerCase();
  if (t.includes("meeting")) return { icon: Video, cls: "bg-primary/10 text-primary" };
  if (t.includes("message") || t.includes("channel")) return { icon: MessageSquare, cls: "bg-info/10 text-info" };
  if (t.includes("file")) return { icon: FileText, cls: "bg-success/10 text-success" };
  if (t.includes("ticket")) return { icon: Bell, cls: "bg-warning/10 text-warning" };
  return { icon: Megaphone, cls: "bg-mention/10 text-mention" };
}

function Announcements() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: notifications } = useNotifications();
  const items = (notifications ?? []).slice(0, 4);

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Announcements</h2>
        <button
          onClick={() => setActiveView("inbox")}
          className="text-xs font-medium text-primary"
        >
          View All
        </button>
      </div>

      <div className="mt-3">
        {items.length === 0 ? (
          <p className="py-4 text-xs text-text-muted">No announcements right now.</p>
        ) : (
          items.map((item) => {
            const preset = notificationIcon(item.eventType);
            const Icon = preset.icon;
            return (
              <div key={item.id} className="flex gap-3 border-b border-border py-3 last:border-0">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${preset.cls}`}
                >
                  <Icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-text">{item.title}</p>
                    <span className="shrink-0 text-[10px] text-text-muted">
                      {timeAgo(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-text-muted">
                    {item.body}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

/* =========================================================
   QUOTE BANNER
========================================================= */

function MotivationBanner() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-border bg-gradient-to-r from-primary/10 via-primary/5 to-surface p-6">
      <div className="relative z-10 max-w-[65%]">
        <p className="text-lg font-semibold leading-6 text-text">
          A better you
          <br />
          builds a brighter tomorrow.
        </p>
        <div className="mt-4 h-0.5 w-9 bg-primary" />
      </div>

      <div className="absolute bottom-[-30px] right-8 opacity-60">
        <div className="relative h-28 w-24">
          <div className="absolute bottom-0 left-1/2 h-20 w-2 -translate-x-1/2 rounded-full bg-primary/40" />
          <div className="absolute right-0 top-1 h-16 w-10 rotate-[35deg] rounded-[100%_0_100%_0] bg-primary/40" />
          <div className="absolute left-0 top-7 h-14 w-9 -rotate-[35deg] rounded-[0_100%_0_100%] bg-primary/25" />
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export function EmployeeHomeScreen() {
  const { data: user } = useMe();
  const { can } = usePermissions();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const now = useNow(30_000);

  const me = useMyEmployee();
  const todos = useTodos();
  const meetings = useMeetings();
  const notifications = useNotifications();
  const checkin = useAttendanceCheckin();

  const today = todayStr();
  const week = useMemo(weekRange, []);
  const attendance = useAttendance({ employeeId: me.data?.id, from: today, to: today });
  const timeEntries = useTimeEntries({ from: week.from, to: week.to });

  const displayName = getUserDisplayName(user, "there");

  /* ---------- derived data ---------- */

  const todoList = todos.data ?? [];
  const meetingList = meetings.data ?? [];
  const notificationList = notifications.data ?? [];

  const todaysMeetings = useMemo(() => {
    const todayDate = new Date().toDateString();
    return meetingList
      .filter(
        (m) =>
          m.status !== "ended" &&
          m.scheduledAt &&
          new Date(m.scheduledAt).toDateString() === todayDate,
      )
      .sort(
        (a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime(),
      )
      .slice(0, 5);
  }, [meetingList]);

  const todayRecord = useMemo(
    () => (attendance.data ?? []).find((r) => r.date.slice(0, 10) === today),
    [attendance.data, today],
  );
  const checkedIn = Boolean(todayRecord?.checkInAt);
  const checkedOut = Boolean(todayRecord?.checkOutAt);

  // workedMinutes is only persisted at checkout — tick it live while punched in.
  const workedTodayMin = useMemo(() => {
    if (!todayRecord) return 0;
    if (todayRecord.checkInAt && !todayRecord.checkOutAt) {
      return Math.max(
        0,
        (now.getTime() - new Date(todayRecord.checkInAt).getTime()) / 60000,
      );
    }
    return todayRecord.workedMinutes ?? 0;
  }, [todayRecord, now]);

  const timesheetMinutes = useMemo(
    () => (timeEntries.data ?? []).reduce((acc, e) => acc + (e.minutes ?? 0), 0),
    [timeEntries.data],
  );

  const unreadCount = useMemo(
    () => notificationList.filter((n) => !n.read).length,
    [notificationList],
  );

  const tasksDueToday = useMemo(
    () => todoList.filter((t) => !t.completedAt && t.dueDate && t.dueDate.slice(0, 10) <= today),
    [todoList, today],
  );

  /* ---------- AI daily brief ---------- */

  const dailyDigest = useDailyDigest();
  const [digest, setDigest] = useState<DailyDigestResult | null>(null);
  const digestError = useRef<string | null>(null);

  useEffect(() => {
    if (digest || dailyDigest.isPending || digestError.current) return;
    dailyDigest
      .mutateAsync({ hours: 24 })
      .then((result) => setDigest(normalizeDigest(result)))
      .catch((err) => {
        digestError.current = err instanceof Error ? err.message : "Unknown error";
        setDigest(normalizeDigest(null));
      });
  }, [digest, dailyDigest]);

  const fallbackBriefItems = useMemo(() => {
    const items: { title: string; description: string }[] = [];
    if (tasksDueToday.length > 0) {
      items.push({
        title: `${tasksDueToday.length} task${tasksDueToday.length === 1 ? "" : "s"} due today`,
        description: tasksDueToday[0].title,
      });
    }
    if (todaysMeetings.length > 0) {
      items.push({
        title: `${todaysMeetings[0].title} at ${formatTime(todaysMeetings[0].scheduledAt)}`,
        description:
          todaysMeetings.length > 1
            ? `Plus ${todaysMeetings.length - 1} more meeting${todaysMeetings.length > 2 ? "s" : ""} today`
            : "Your next meeting today",
      });
    }
    if (unreadCount > 0) {
      items.push({
        title: `You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`,
        description: "Open your inbox to catch up",
      });
    }
    if (items.length === 0) {
      items.push({ title: "You're all caught up", description: "Nothing needs your attention" });
    }
    return items;
  }, [tasksDueToday, todaysMeetings, unreadCount]);

  return (
    <div className="mx-auto flex h-full max-w-[1500px] flex-col overflow-y-auto bg-background px-5 py-5 text-text">
      {/* =================================================
          TOP HEADER
      ================================================= */}
      <header className="relative overflow-hidden">
        <div className="relative z-10 flex flex-col gap-4 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              {getGreeting()}, {displayName}! <span className="text-xl">👋</span>
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Let's make today productive. Here's your overview.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-medium text-text-secondary">
                {new Date().toLocaleDateString([], {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              <p className="mt-2 text-xs italic text-text-muted">“{dailyQuote()}”</p>
            </div>
            <div className="hidden h-10 w-px bg-border lg:block" />
          </div>
        </div>
      </header>

      {/* =================================================
          AI + SCHEDULE
      ================================================= */}
      <section className="grid gap-4 lg:grid-cols-[2fr_0.92fr]">
        <AIDailyBrief
          digest={digest}
          loading={dailyDigest.isPending}
          fallbackItems={fallbackBriefItems}
        />
        <TodaysSchedule meetings={todaysMeetings} />
      </section>

      {/* =================================================
          PERSONAL METRICS
      ================================================= */}
      <section className="mt-4 grid gap-3 md:grid-cols-3">
        <MetricCard
          icon={<Clock3 size={22} />}
          iconClass="bg-success/10 text-success"
          title="Check-in"
          value={checkedIn ? formatTime(todayRecord?.checkInAt) : "—"}
          subtitle={
            me.data?.department?.name ??
            me.data?.departmentName ??
            (me.data ? "Office" : "No employee record")
          }
          badge={
            checkedIn ? (
              <span className="rounded-md bg-success/10 px-2 py-1 text-[10px] font-medium text-success">
                {checkedOut ? "Checked out" : (todayRecord?.presenceStatus ?? "Present")}
              </span>
            ) : undefined
          }
          action={
            !checkedIn && can("hrms.attendance.checkin") && me.data ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  checkin.mutate();
                }}
                disabled={checkin.isPending}
                className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                {checkin.isPending ? "…" : "Check in"}
              </button>
            ) : undefined
          }
          onClick={() => setActiveView("my-attendance")}
        />

        <MetricCard
          icon={<Users size={22} />}
          iconClass="bg-primary/10 text-primary"
          title="Work Hours"
          value={workedTodayMin > 0 ? formatMinutes(Math.floor(workedTodayMin)) : "0h 0m"}
          subtitle={`of ${DAY_TARGET_MIN / 60}h`}
          progress={(workedTodayMin / DAY_TARGET_MIN) * 100}
          onClick={() => setActiveView("my-attendance")}
        />

        <MetricCard
          icon={<CalendarDays size={22} />}
          iconClass="bg-info/10 text-info"
          title="Timesheet"
          value={formatMinutes(timesheetMinutes)}
          subtitle="This Week"
          ring={Math.min(100, Math.round((timesheetMinutes / WEEK_TARGET_MIN) * 100))}
          onClick={() => setActiveView("my-timesheet")}
        />
      </section>

      {/* =================================================
          MAIN CONTENT
      ================================================= */}
      <section className="mt-4 grid gap-4 pb-6 lg:grid-cols-[1fr_1.05fr_1fr]">
        <MyTasks todos={todoList} />

        <div className="space-y-3">
          <TeamBirthdays />
          <MyProjects />
        </div>

        <div className="space-y-3">
          <Announcements />
          <MotivationBanner />
        </div>
      </section>
    </div>
  );
}
