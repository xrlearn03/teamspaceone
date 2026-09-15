import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CheckSquare,
  FileText,
  FolderKanban,
  GraduationCap,
  LifeBuoy,
  MessageSquare,
  MessageSquarePlus,
  Users,
  Video,
} from "lucide-react";
import {
  useActiveOrganisation,
  useChannels,
  useDailyDigest,
  useEmployeeBirthdays,
  useMe,
  useMeetings,
  useMembers,
  useNotifications,
  useProjects,
  useTodos,
  useUpdateTodo,
  useUsers,
} from "@/hooks/api";
import * as api from "@/lib/api";
import type { Meeting, Todo } from "@/lib/api";
import { QuickCheckInCard } from "@/features/dashboard/widgets";
import { useUIStore, type View } from "@/stores/ui";
import { cn, getUserDisplayName } from "@/lib/utils";
import { formatTime } from "@/screens/hrms/common";
import { AiDailyBrief } from "@/components/ai-daily-brief";
import { UserAvatar } from "@/components/user-avatar";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { EmptyState } from "@teamspace-one/ui/empty-state";

/* =========================================================
   HELPERS
========================================================= */

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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

function meetingStart(m: Meeting) {
  return m.scheduledAt ?? m.startedAt ?? m.createdAt;
}

function meetingTimeRange(m: Meeting) {
  const start = m.scheduledAt ?? m.startedAt;
  if (!start) return m.type ?? "Meeting";
  const s = formatTime(start);
  if (!m.durationMinutes) return s;
  const end = new Date(new Date(start).getTime() + m.durationMinutes * 60000);
  return `${s} – ${formatTime(end.toISOString())}`;
}

/* =========================================================
   SHARED PIECES
========================================================= */

function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-4 ${className}`}>
      {children}
    </section>
  );
}

function PanelHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-text">{title}</h2>
      {onViewAll ? (
        <button onClick={onViewAll} className="text-xs font-medium text-primary hover:text-primary/80">
          View All →
        </button>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon,
  iconClass,
  value,
  label,
  badge,
  footer,
  onClick,
}: {
  icon: React.ReactNode;
  iconClass: string;
  value: string | number;
  label: string;
  badge?: string;
  footer: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-surface p-5",
        onClick && "cursor-pointer transition hover:border-primary/40",
      )}
    >
      <div className="flex items-center gap-5">
        <div
          className={`flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-xl ${iconClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="text-[28px] font-semibold leading-8 text-text">{value}</span>
            {badge ? <span className="text-[13px] text-success">{badge}</span> : null}
          </div>
          <div className="text-xs text-text-secondary">{label}</div>
          <div className="mt-1 text-[10px] text-text-muted">{footer}</div>
        </div>
      </div>
    </div>
  );
}



/* =========================================================
   MY FOCUS TODAY (personal todos)
========================================================= */

function todoDueLabel(todo: Todo): { text: string; className: string } {
  if (todo.completedAt) return { text: "Done", className: "text-success" };
  if (!todo.dueDate) return { text: "—", className: "text-text-muted" };
  const due = todo.dueDate.slice(0, 10);
  const today = todayStr();
  if (due < today) return { text: "Overdue", className: "text-error" };
  if (due === today) return { text: "Today", className: "text-warning" };
  return {
    text: new Date(todo.dueDate).toLocaleDateString([], { day: "numeric", month: "short" }),
    className: "text-text-muted",
  };
}

function MyFocusPanel({ todos }: { todos: Todo[] }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const updateTodo = useUpdateTodo();

  const sorted = useMemo(
    () =>
      [...todos].sort((a, b) => {
        if (Boolean(a.completedAt) !== Boolean(b.completedAt)) return a.completedAt ? 1 : -1;
        return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
      }),
    [todos],
  );
  const visible = sorted.slice(0, 5);
  const completed = todos.filter((t) => t.completedAt).length;
  const progress = todos.length ? Math.round((completed / todos.length) * 100) : 0;

  return (
    <Panel>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-text">My Focus Today</h2>
          <p className="mt-1 text-xs text-text-muted">
            {completed} / {todos.length} completed
          </p>
        </div>
        <span className="text-xs text-text-secondary">{progress}%</span>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-elevated">
        <div
          className="h-full rounded-full bg-gradient-to-r from-info to-primary transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="mt-4 space-y-3">
        {visible.length === 0 ? (
          <p className="py-3 text-xs text-text-muted">No tasks yet — you're all caught up.</p>
        ) : (
          visible.map((todo) => {
            const done = Boolean(todo.completedAt);
            const label = todoDueLabel(todo);
            return (
              <button
                key={todo.id}
                onClick={() =>
                  updateTodo.mutate({ todoId: todo.id, body: { completed: !done } })
                }
                className="flex w-full items-center gap-3 text-left"
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition",
                    done
                      ? "border-success bg-success text-white"
                      : "border-border hover:border-primary",
                  )}
                >
                  {done && <Check size={12} strokeWidth={3} />}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-xs",
                    done ? "text-text-muted line-through" : "text-text",
                  )}
                >
                  {todo.title}
                </span>
                <span className={`text-[11px] ${label.className}`}>{label.text}</span>
              </button>
            );
          })
        )}
      </div>

      <button
        onClick={() => setActiveView("my-projects", { projectsTab: "tasks" })}
        className="mt-4 block w-full text-right text-xs font-medium text-primary hover:text-primary/80"
      >
        View All Tasks →
      </button>
    </Panel>
  );
}

/* =========================================================
   MY PROJECTS
========================================================= */

const PROJECT_TINTS = [
  "bg-info/15 text-info",
  "bg-mention/15 text-mention",
  "bg-primary/15 text-primary",
  "bg-success/15 text-success",
];
const PROJECT_BAR_COLORS = ["bg-info", "bg-primary", "bg-mention", "bg-success"];

function MyProjectsPanel() {
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
    <Panel>
      <PanelHeader title="My Projects" onViewAll={() => setActiveView("my-projects")} />

      <div className="mt-2">
        {topProjects.length === 0 ? (
          <p className="py-4 text-xs text-text-muted">You're not a member of any project yet.</p>
        ) : (
          topProjects.map((project, i) => {
            const tasks = taskQueries[i]?.data ?? [];
            const progress =
              tasks.length > 0
                ? Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100)
                : 0;
            const done = project.status !== "active";
            return (
              <button
                key={project.id}
                onClick={() => setActiveView("project", { projectId: project.id })}
                className="flex w-full items-center gap-3 border-b border-border py-3 text-left last:border-0"
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${PROJECT_TINTS[i % PROJECT_TINTS.length]}`}
                >
                  <BriefcaseBusiness size={18} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-text">{project.name}</div>
                  <div className="mt-1 text-[10px] text-text-muted">
                    {project.members?.length ?? 0} member{project.members?.length === 1 ? "" : "s"}
                    <span className="mx-1">•</span>
                    <span className={done ? "text-success" : "text-info"}>
                      {done ? "Completed" : "In Progress"}
                    </span>
                  </div>
                </div>

                <div className="w-[100px]">
                  <div className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                    <div
                      className={`h-full rounded-full ${PROJECT_BAR_COLORS[i % PROJECT_BAR_COLORS.length]}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <span className="w-8 text-right text-[11px] text-text-secondary">{progress}%</span>
              </button>
            );
          })
        )}
      </div>
    </Panel>
  );
}

/* =========================================================
   TEAM BIRTHDAYS
========================================================= */

function TeamBirthdaysPanel() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: birthdays } = useEmployeeBirthdays(7);
  const list = (birthdays ?? []).slice(0, 4);

  return (
    <Panel>
      <PanelHeader title="Team Birthdays This Week" />

      <div className="mt-2">
        {list.length === 0 ? (
          <p className="py-4 text-xs text-text-muted">No birthdays coming up this week.</p>
        ) : (
          list.map((person) => (
            <div key={person.id} className="flex items-center gap-3 py-2.5">
              <Avatar className="h-10 w-10 border border-border">
                <AvatarFallback className="text-xs">
                  {initials(person.firstName, person.lastName)}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-text">
                  {person.firstName} {person.lastName}
                </div>
                <div className="truncate text-[10px] text-text-muted">
                  {person.departmentName ?? ""}
                </div>
              </div>

              <div className="mr-2 text-right">
                <div className="text-[11px] text-text-secondary">
                  {new Date(person.date).toLocaleDateString([], { day: "numeric", month: "short" })}
                </div>
                <div
                  className={cn(
                    "text-[10px]",
                    person.daysUntil === 0 ? "font-semibold text-warning" : "text-text-muted",
                  )}
                >
                  {person.daysUntil === 0
                    ? "Today 🎂"
                    : `In ${person.daysUntil} day${person.daysUntil === 1 ? "" : "s"}`}
                </div>
              </div>

              <button
                onClick={() => setActiveView("dm")}
                className="flex h-9 items-center gap-2 rounded-lg bg-primary/80 px-3.5 text-[11px] font-medium text-white transition hover:bg-primary"
              >
                <MessageSquare size={13} />
                Message
              </button>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

/* =========================================================
   UPCOMING MEETINGS
========================================================= */

function UpcomingMeetingsPanel({ meetings }: { meetings: Meeting[] }) {
  const setActiveView = useUIStore((s) => s.setActiveView);

  return (
    <Panel>
      <PanelHeader title="Upcoming Meetings" onViewAll={() => setActiveView("meeting")} />

      <div className="mt-3 space-y-2">
        {meetings.length === 0 ? (
          <p className="py-4 text-xs text-text-muted">No upcoming meetings.</p>
        ) : (
          meetings.map((meeting) => {
            const day = new Date(meetingStart(meeting));
            return (
              <div
                key={meeting.id}
                className="flex items-center gap-3 rounded-lg bg-surface-elevated p-3"
              >
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-surface text-[10px] font-semibold text-text">
                  <span className="text-text-muted">
                    {day.toLocaleDateString([], { month: "short" }).toUpperCase()}
                  </span>
                  <span>{day.getDate()}</span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-text">{meeting.title}</div>
                  <div className="mt-1 text-[10px] text-text-muted">
                    {meetingTimeRange(meeting)}
                  </div>
                </div>

                <button
                  onClick={() => setActiveView("meeting", { meetingId: meeting.id })}
                  className="flex h-9 items-center gap-2 rounded-lg bg-primary/80 px-3 text-[11px] font-medium text-white transition hover:bg-primary"
                >
                  <Video size={13} />
                  {meeting.status === "started" ? "Join" : "View"}
                </button>
              </div>
            );
          })
        )}
      </div>
    </Panel>
  );
}

/* =========================================================
   ANNOUNCEMENTS
========================================================= */

const ANNOUNCEMENT_DOT_COLORS = ["bg-info", "bg-mention", "bg-primary", "bg-success"];

function notificationDot(eventType: string, index: number) {
  const t = eventType.toLowerCase();
  if (t.includes("meeting")) return "bg-info";
  if (t.includes("message") || t.includes("channel")) return "bg-mention";
  if (t.includes("ticket")) return "bg-warning";
  return ANNOUNCEMENT_DOT_COLORS[index % ANNOUNCEMENT_DOT_COLORS.length];
}

function AnnouncementsPanel() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: notifications } = useNotifications();
  const items = (notifications ?? []).slice(0, 4);

  return (
    <Panel>
      <PanelHeader title="Announcements" onViewAll={() => setActiveView("inbox")} />

      <div className="mt-3 space-y-4">
        {items.length === 0 ? (
          <p className="py-2 text-xs text-text-muted">No announcements right now.</p>
        ) : (
          items.map((item, i) => (
            <div key={item.id} className="flex gap-3">
              <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${notificationDot(item.eventType, i)}`} />
              <div className="min-w-0">
                <div className="text-xs leading-5 text-text">{item.title}</div>
                <div className="text-[10px] text-text-muted">{timeAgo(item.createdAt)}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

/* =========================================================
   RECENT CONVERSATIONS
========================================================= */

function RecentConversationsPanel() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: user } = useMe();
  // Channels arrive ordered by updatedAt desc — the first few are the
  // most recently active conversations.
  const { data: channels } = useChannels();
  const recentChannels = useMemo(() => (channels ?? []).slice(0, 4), [channels]);

  const previewQueries = useQueries({
    queries: recentChannels.map((c) => ({
      queryKey: ["messages", c.id, "preview"],
      queryFn: () => api.getMessages(c.id, undefined, 1),
      staleTime: 30 * 1000,
    })),
  });

  const userIds = useMemo(() => {
    const ids = new Set<string>();
    for (const channel of recentChannels) {
      for (const member of channel.members ?? []) {
        if (member.userId !== user?.id) ids.add(member.userId);
      }
    }
    for (const query of previewQueries) {
      const senderId = query.data?.items?.[0]?.senderId;
      if (senderId) ids.add(senderId);
    }
    return [...ids];
  }, [recentChannels, user?.id, previewQueries]);

  const { data: users } = useUsers(userIds);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const rows = recentChannels
    .map((channel, i) => {
      const last = previewQueries[i]?.data?.items?.[0];
      const counterpart =
        channel.type === "direct"
          ? channel.members?.find((m) => m.userId !== user?.id)
          : undefined;
      const counterpartUser = counterpart ? userMap.get(counterpart.userId) : undefined;
      const title =
        channel.type === "direct" ? getUserDisplayName(counterpartUser, "Direct message") : channel.name;
      return { channel, last, counterpartUser, title };
    })
    .filter((row) => row.last);

  return (
    <Panel>
      <PanelHeader title="Recent Conversations" onViewAll={() => setActiveView("dm")} />

      {rows.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations"
          description="Send a message to start a conversation."
        />
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {rows.map(({ channel, last, counterpartUser, title }) => (
            <button
              key={channel.id}
              onClick={() =>
                setActiveView(channel.type === "direct" ? "dm" : "channel", { channelId: channel.id })
              }
              className="flex items-center gap-3 rounded-lg bg-surface-elevated p-3 text-left transition hover:bg-primary-subtle"
            >
              <UserAvatar user={counterpartUser} className="h-10 w-10 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs font-medium text-text">
                    {channel.type === "direct" ? title : `# ${title}`}
                  </p>
                  <span className="shrink-0 text-[10px] text-text-muted">
                    {timeAgo(last?.createdAt)}
                  </span>
                </div>
                <p className="mt-1 truncate text-[11px] text-text-muted">
                  {last?.content || "No messages yet"}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* =========================================================
   QUICK LINKS
========================================================= */

const QUICK_LINKS: {
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  label: string;
  view: View;
  helpTab?: string;
}[] = [
  { icon: CalendarClock, label: "Request Time Off", view: "my-leaves" },
  { icon: LifeBuoy, label: "IT Support", view: "help", helpTab: "tickets" },
  { icon: Building2, label: "HR Portal", view: "hrms" },
  { icon: GraduationCap, label: "Learning & Development", view: "help", helpTab: "tutorials" },
  { icon: FileText, label: "Company Policies", view: "files" },
  { icon: MessageSquarePlus, label: "Submit Feedback", view: "help", helpTab: "contact" },
];

function QuickLinksPanel() {
  const setActiveView = useUIStore((s) => s.setActiveView);

  return (
    <Panel>
      <PanelHeader title="Quick Links" />

      <div className="mt-4 grid grid-cols-3 gap-3">
        {QUICK_LINKS.map((link) => {
          const Icon = link.icon;
          return (
            <button
              key={link.label}
              onClick={() =>
                setActiveView(link.view, link.helpTab ? { helpTab: link.helpTab } : undefined)
              }
              className="flex min-h-[82px] flex-col items-center justify-center rounded-lg border border-border bg-surface-elevated px-2 text-center transition hover:border-primary/50 hover:bg-primary-subtle"
            >
              <Icon size={22} className="mb-2 text-primary" />
              <span className="text-[10px] leading-4 text-text-secondary">{link.label}</span>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

/* =========================================================
   MAIN DASHBOARD
========================================================= */

export function EmployeeHomeScreen() {
  const { data: user } = useMe();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { id: organisationId } = useActiveOrganisation();

  const todos = useTodos();
  const meetings = useMeetings();
  const projects = useProjects();
  const members = useMembers(organisationId ?? undefined);
  const notifications = useNotifications();

  const displayName = getUserDisplayName(user, "there");

  /* ---------- derived data ---------- */

  const todoList = todos.data ?? [];
  const meetingList = meetings.data ?? [];
  const projectList = useMemo(
    () => (projects.data ?? []).filter((p) => !p.isTemplate && !p.archivedAt),
    [projects.data],
  );

  const openTodos = useMemo(() => todoList.filter((t) => !t.completedAt), [todoList]);
  const dueToday = useMemo(
    () => openTodos.filter((t) => t.dueDate && t.dueDate.slice(0, 10) <= todayStr()),
    [openTodos],
  );

  const upcomingMeetings = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return meetingList
      .filter(
        (m) =>
          m.status === "started" ||
          (m.status !== "ended" && m.scheduledAt && new Date(m.scheduledAt) >= startOfToday),
      )
      .sort((a, b) => new Date(meetingStart(a)).getTime() - new Date(meetingStart(b)).getTime())
      .slice(0, 4);
  }, [meetingList]);

  const meetingsToday = useMemo(() => {
    const today = new Date().toDateString();
    return meetingList.filter((m) => m.scheduledAt && new Date(m.scheduledAt).toDateString() === today).length;
  }, [meetingList]);

  const activeProjects = projectList.filter((p) => p.status === "active");

  /* ---------- AI daily brief ---------- */

  const unreadCount = useMemo(
    () => (notifications.data ?? []).filter((n) => !n.read).length,
    [notifications.data],
  );

  const briefFallback = useMemo(() => {
    const points: string[] = [];
    if (dueToday.length > 0) {
      points.push(`${dueToday.length} task${dueToday.length === 1 ? "" : "s"} due today`);
    }
    if (upcomingMeetings.length > 0) {
      const first = upcomingMeetings[0];
      points.push(
        `Next meeting: ${first.title} at ${formatTime(meetingStart(first))}`,
      );
    }
    if (unreadCount > 0) {
      points.push(`You have ${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`);
    }
    if (activeProjects.length > 0) {
      points.push(`${activeProjects.length} active project${activeProjects.length === 1 ? "" : "s"}`);
    }
    if (points.length === 0) {
      points.push("You're all caught up — nothing needs your attention.");
    }
    return points.slice(0, 5);
  }, [dueToday, upcomingMeetings, unreadCount, activeProjects]);

  const briefRecommendation = useMemo(() => {
    const parts: string[] = [];
    if (dueToday.length > 0) {
      parts.push(`complete your ${dueToday.length} task${dueToday.length === 1 ? "" : "s"} due today`);
    }
    if (upcomingMeetings.length > 0) {
      parts.push(`prepare for ${upcomingMeetings[0].title}`);
    }
    if (parts.length === 0) {
      return "Nothing urgent — focus on your projects or check in with your team.";
    }
    return `Start by ${parts.join(", then ")}.`;
  }, [dueToday, upcomingMeetings]);

  return (
    <div className="h-full overflow-y-auto bg-background text-text">
      <main className="mx-auto flex max-w-[1500px] flex-col gap-4 px-4 py-5 xl:px-6">
        {/* =================================================
            HEADER
        ================================================= */}
        <header className="relative overflow-hidden rounded-2xl border border-border">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-70"
            style={{
              backgroundImage:
                "linear-gradient(90deg, rgba(2,13,26,.96) 0%, rgba(2,13,26,.8) 48%, rgba(2,13,26,.28) 100%), url('/teamspace-one-background-dark.jpg')",
            }}
          />

          <div className="relative flex min-h-[125px] items-start justify-between px-6 py-4">
            <div>
              <h1 className="text-[30px] font-semibold tracking-tight text-white">
                {getGreeting()}, {displayName}! <span className="text-[26px]">👋</span>
              </h1>
              <p className="mt-1 text-[15px] text-slate-300">
                Let's make today productive and meaningful.
              </p>
            </div>

            <div className="hidden items-start gap-10 pt-1 md:flex">
              <div className="max-w-[220px] text-[13px] italic leading-6 text-slate-300">
                “{dailyQuote()}”
              </div>
              <div className="text-right text-[13px] text-slate-300">
                {new Date().toLocaleDateString([], {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </div>
            </div>
          </div>
        </header>

        {/* =================================================
            KPI CARDS
        ================================================= */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            icon={<CheckSquare size={30} />}
            iconClass="bg-mention/15 text-mention"
            value={openTodos.length}
            label="My Tasks"
            badge={dueToday.length > 0 ? `${dueToday.length} due today` : undefined}
            footer="open personal todos"
            onClick={() => setActiveView("my-projects", { projectsTab: "tasks" })}
          />
          <MetricCard
            icon={<FolderKanban size={30} />}
            iconClass="bg-info/15 text-info"
            value={activeProjects.length}
            label="Active Projects"
            footer="you're a member of"
            onClick={() => setActiveView("my-projects")}
          />
          <MetricCard
            icon={<Users size={30} />}
            iconClass="bg-success/15 text-success"
            value={members.data?.length ?? 0}
            label="Team Members"
            footer="in your organisation"
            onClick={() => setActiveView("members")}
          />
          <MetricCard
            icon={<CalendarDays size={30} />}
            iconClass="bg-primary/15 text-primary"
            value={upcomingMeetings.length}
            label="Upcoming Meetings"
            badge={meetingsToday > 0 ? `${meetingsToday} today` : undefined}
            footer="scheduled"
            onClick={() => setActiveView("meeting")}
          />
        </section>

        {/* =================================================
            MAIN GRID
        ================================================= */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_385px]">
          {/* LEFT SIDE */}
          <div className="space-y-4">
            {/* AI BRIEF + FOCUS */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(330px,1fr)]">
              <AiDailyBrief
                subtitle="Your personalized update for today"
                fallbackPoints={briefFallback}
                recommendation={briefRecommendation}
              />
              <MyFocusPanel todos={todoList} />
            </div>

            {/* PROJECTS + BIRTHDAYS */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <MyProjectsPanel />
              <TeamBirthdaysPanel />
            </div>

            {/* RECENT CONVERSATIONS */}
            <RecentConversationsPanel />
          </div>

          {/* RIGHT COLUMN */}
          <aside className="space-y-4">
            <QuickCheckInCard />
            <UpcomingMeetingsPanel meetings={upcomingMeetings} />
            <AnnouncementsPanel />
            <QuickLinksPanel />
          </aside>
        </div>
      </main>
    </div>
  );
}
