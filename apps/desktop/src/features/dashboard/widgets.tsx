import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyDigestResult, Meeting, Message } from "../../lib/api";
import {
  Briefcase,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Clock,
  Coffee,
  DoorOpen,
  Folder,
  LogIn,
  LogOut,
  MessageSquare,
  Sparkles,
  Trash2,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { useUIStore } from "../../stores/ui";
import {
  useChannels,
  useCreateDirectChannel,
  useDailyDigest,
  useDeleteEndedMeetings,
  useMe,
  useMeetings,
  useMembers,
  useMessages,
  useNotifications,
  usePendingAIActions,
  useProjects,
  useTasks,
  useUsers,
  useAttendance,
  useAttendanceCheckin,
  useAttendanceCheckout,
  useAttendancePresence,
  useHrmsOverview,
  useLeaveBalances,
  useLeaveRequests,
  useMyEmployee,
  useInterviewOverview,
  useInterviewSessions,
  useJobOpenings,
  usePendingEvaluations,
} from "../../hooks/api";
import { getActiveOrganisation } from "../../lib/api";
import { PermissionGate } from "@teamspace-one/authorization/react";
import { Card, CardHeader, CardTitle, CardContent } from "@teamspace-one/ui/card";
import { Button } from "@teamspace-one/ui/button";
import { Badge } from "@teamspace-one/ui/badge";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { UserAvatar } from "../../components/user-avatar";
import { cn, getUserDisplayName } from "../../lib/utils";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function tryParseDigestJson(text: string): { title: string; items: string[] }[] | null {
  // Models often wrap JSON in a markdown code fence; strip it before parsing.
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const cleaned = (fenceMatch ? fenceMatch[1] : text).trim();
  try {
    const parsed = JSON.parse(cleaned) as { sections?: unknown };
    if (Array.isArray(parsed.sections)) {
      const sections: { title: string; items: string[] }[] = [];
      for (const raw of parsed.sections) {
        if (!raw || typeof raw !== "object") continue;
        const s = raw as { title?: unknown; items?: unknown };
        const title = typeof s.title === "string" && s.title.trim() ? s.title.trim() : "Brief";
        let items: string[] = [];
        if (Array.isArray(s.items)) {
          items = s.items.filter((i: unknown): i is string => typeof i === "string").map((i) => i.trim());
        } else if (typeof s.items === "string") {
          items = [s.items.trim()];
        }
        if (title !== "Brief" || items.length > 0) {
          sections.push({ title, items });
        }
      }
      return sections.length > 0 ? sections : null;
    }
  } catch {
    // fall through
  }
  return null;
}

export function normalizeDigest(result: unknown): DailyDigestResult {
  if (!result || typeof result !== "object") {
    return { sections: [{ title: "Daily brief", items: ["Failed to load daily brief."] }], model: "none" };
  }
  const typed = result as Partial<DailyDigestResult> & { sections?: unknown };

  // If the AI response is wrapped in a markdown code fence, parse the JSON directly.
  if (typeof typed.raw === "string") {
    const parsed = tryParseDigestJson(typed.raw);
    if (parsed && parsed.length > 0) {
      return { sections: parsed, model: typeof typed.model === "string" ? typed.model : "none", raw: typed.raw };
    }
  }

  const rawSections = Array.isArray(typed.sections) ? typed.sections : [];
  const sections: { title: string; items: string[] }[] = [];
  for (const raw of rawSections) {
    if (!raw || typeof raw !== "object") continue;
    const s = raw as { title?: unknown; items?: unknown };
    const title = typeof s.title === "string" && s.title.trim() ? s.title.trim() : "Brief";
    let items: string[] = [];
    if (Array.isArray(s.items)) {
      items = s.items.filter((i: unknown): i is string => typeof i === "string").map((i) => i.trim());
    } else if (typeof s.items === "string") {
      items = [s.items.trim()];
    }
    if (title !== "Brief" || items.length > 0) {
      sections.push({ title, items });
    }
  }
  return {
    sections: sections.length > 0 ? sections : [{ title: "Daily brief", items: ["No activity to summarize."] }],
    model: typeof typed.model === "string" ? typed.model : "none",
    raw: typeof typed.raw === "string" ? typed.raw : undefined,
  };
}

function formatRelative(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  return d.toLocaleDateString();
}

export function MyTasksWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: projects } = useProjects();
  const firstProjectId = projects?.[0]?.id;
  const { data: tasks } = useTasks(firstProjectId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>My tasks</CardTitle>
        <Badge variant="secondary">{tasks?.length ?? 0}</Badge>
      </CardHeader>
      <CardContent>
        {tasks && tasks.length > 0 ? (
          <div className="space-y-2">
            {tasks.slice(0, 1).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveView("project", { projectId: t.projectId })}
                className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-surface-elevated"
              >
                <span className="h-2 w-2 rounded-full bg-primary" />
                <span className="flex-1 truncate text-sm text-text">{t.title}</span>
                <span className="text-xs capitalize text-text-muted">{t.status}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckSquare} title="No tasks" description="Create a task in a project to see it here." />
        )}
      </CardContent>
    </Card>
  );
}

export function UpcomingMeetingsWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: meetings } = useMeetings();
  const deleteEndedMeetings = useDeleteEndedMeetings();
  const endedMeetingsCount = meetings?.filter((m) => m.status === "ended")?.length ?? 0;

  const upcomingMeetings = useMemo(
    () =>
      (meetings ?? [])
        .filter((m): m is Meeting & { scheduledAt: string } => Boolean(m.scheduledAt) && m.status !== "ended")
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    [meetings],
  );

  function handleDeleteEndedMeetings() {
    if (endedMeetingsCount === 0) return;
    if (!window.confirm(`Delete ${endedMeetingsCount} ended meeting${endedMeetingsCount === 1 ? "" : "s"}? This cannot be undone.`)) return;
    deleteEndedMeetings.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming meetings</CardTitle>
        <PermissionGate permission="collaboration.meeting.delete">
          {endedMeetingsCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-error"
              disabled={deleteEndedMeetings.isPending}
              onClick={handleDeleteEndedMeetings}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ended
            </Button>
          ) : null}
        </PermissionGate>
      </CardHeader>
      <CardContent>
        {upcomingMeetings.length > 0 ? (
          <div className="space-y-2">
            {upcomingMeetings.slice(0, 1).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveView(m.type === "voice_room" ? "voice" : "meeting", { meetingId: m.id })}
                className="flex w-full items-center justify-between rounded-md p-1.5 text-left hover:bg-surface-elevated"
              >
                <span className="text-sm text-text">{m.title}</span>
                <span className="text-xs text-text-muted">
                  {m.status === "started" ? "Live" : m.status === "ended" ? "Ended" : m.scheduledAt ? formatTime(m.scheduledAt) : "Upcoming"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={Calendar} title="No meetings" description="Schedule a meeting to see it here." />
        )}
      </CardContent>
    </Card>
  );
}

export function RecentConversationsWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: user } = useMe();
  const { data: channels } = useChannels();
  const createDirectChannel = useCreateDirectChannel();
  const firstChannelId = channels?.[0]?.id;
  const { data: messages } = useMessages(firstChannelId);
  const messageSenderIds = useMemo(() => [...new Set((messages ?? []).map((m) => m.senderId))], [messages]);
  const { data: users } = useUsers(messageSenderIds);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const recentConversations = useMemo(() => {
    if (!messages?.length || !user) return [];
    const seen = new Set<string>();
    const items: Message[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.senderId === user.id) continue;
      if (seen.has(m.senderId)) continue;
      seen.add(m.senderId);
      items.push(m);
      if (items.length >= 1) break;
    }
    return items;
  }, [messages, user]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent conversations</CardTitle>
      </CardHeader>
      <CardContent>
        {recentConversations.length > 0 ? (
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {recentConversations.map((m) => {
              const sender = userMap.get(m.senderId);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() =>
                    createDirectChannel.mutate([m.senderId], {
                      onSuccess: (channel) => setActiveView("dm", { channelId: channel.id }),
                    })
                  }
                  className="flex min-w-[10rem] max-w-[12rem] shrink-0 flex-col gap-2 rounded-lg border bg-surface p-3 text-left transition hover:bg-surface-elevated"
                >
                  <div className="flex items-center gap-2">
                    <UserAvatar user={sender} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text">{getUserDisplayName(sender)}</p>
                      <p className="text-xs text-text-muted">{formatRelative(m.createdAt)}</p>
                    </div>
                  </div>
                  <p className="line-clamp-2 text-xs text-text-secondary">{m.content}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={MessageSquare} title="No conversations" description="Send a message to start a conversation." />
        )}
      </CardContent>
    </Card>
  );
}

export function RecentProjectsWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: projects } = useProjects();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent projects</CardTitle>
      </CardHeader>
      <CardContent>
        {projects && projects.length > 0 ? (
          <div className="space-y-3">
            {projects.slice(0, 1).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setActiveView("project", { projectId: p.id })}
                className="flex w-full flex-col gap-1 rounded-md p-1.5 text-left hover:bg-surface-elevated"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text">{p.name}</span>
                  <Badge variant="secondary">{p.status}</Badge>
                </div>
                <p className="line-clamp-1 text-xs text-text-muted">{p.description}</p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={Folder} title="No projects" description="Create a project to see it here." />
        )}
      </CardContent>
    </Card>
  );
}

export function PeopleWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const organisationId = getActiveOrganisation() ?? undefined;
  const { data: members } = useMembers(organisationId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
        <Badge variant="secondary">{members?.length ?? 0}</Badge>
      </CardHeader>
      <CardContent>
        {members && members.length > 0 ? (
          <p className="text-sm text-text-secondary">
            {members.length} member{members.length === 1 ? "" : "s"} in this
            organisation.
          </p>
        ) : (
          <EmptyState icon={Users} title="No members" description="Organisation members will appear here." />
        )}
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => setActiveView("members")}>
            View directory
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DailyBriefWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setPendingActionFilter = useUIStore((s) => s.setPendingActionFilter);
  const { data: notifications } = useNotifications();
  const dailyDigest = useDailyDigest();
  const { data: pendingActions } = usePendingAIActions();
  const [digest, setDigest] = useState<DailyDigestResult | null>(null);
  const digestError = useRef<string | null>(null);

  const pendingActionsList = Array.isArray(pendingActions) ? pendingActions : [];
  const momCount = pendingActionsList.filter((a) => a.actionType === "send_meeting_summary_email").length;
  const taskCount = pendingActionsList.filter((a) => a.actionType === "create_task").length;
  const unread = notifications?.filter((n) => !n.read) ?? [];

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

  return (
    <Card className="relative overflow-hidden border-white/10 bg-[#020b19]">
      <div className="pointer-events-none absolute inset-0">
        <img
          src="/about-background-image.png"
          alt=""
          className="h-full w-full object-cover object-right"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#020b19]/90 via-[#020b19]/60 to-[#020b19]/25" />
      </div>
      <CardHeader className="relative">
        <CardTitle className="text-white">AI daily brief</CardTitle>
        <Sparkles className="h-4 w-4 text-indigo-300" />
      </CardHeader>
      <CardContent className="relative text-white/75">
        {dailyDigest.isPending ? (
          <p className="text-sm leading-relaxed text-white/70">Generating daily brief...</p>
        ) : digest ? (
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {digest.sections.slice(0, 1).map((section) => (
              <div key={section.title} className="rounded-md border bg-surface-elevated p-3 text-sm">
                <p className="font-medium text-text">{section.title}</p>
                <ul className="mt-1.5 space-y-1">
                  {section.items.map((item, i) => (
                    <li key={i} className="leading-relaxed text-text-secondary">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-white/70">
            {unread.length > 0
              ? `You have ${unread.length} unread notification${unread.length === 1 ? "" : "s"}. Open the Inbox to review them.`
              : "No new notifications. You're all caught up."}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setActiveView("ai")}>
            Ask follow-up
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={dailyDigest.isPending}
            onClick={async () => {
              try {
                digestError.current = null;
                setDigest(null);
                const result = await dailyDigest.mutateAsync({ hours: 24 });
                setDigest(normalizeDigest(result));
              } catch (err) {
                digestError.current = err instanceof Error ? err.message : "Unknown error";
                setDigest(normalizeDigest(null));
              }
            }}
          >
            {dailyDigest.isPending ? "Refreshing…" : "Refresh brief"}
          </Button>
          {momCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPendingActionFilter("send_meeting_summary_email");
                setActiveView("ai");
              }}
            >
              Confirm MOM{momCount > 1 ? ` (${momCount})` : ""}
            </Button>
          )}
          {taskCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setPendingActionFilter("create_task");
                setActiveView("ai");
              }}
            >
              Confirm tasks{taskCount > 1 ? ` (${taskCount})` : ""}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function MyLeaveWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: balances, isLoading } = useLeaveBalances();
  const { data: pending } = useLeaveRequests({ mine: true, status: "pending" });

  return (
    <Card>
      <CardHeader>
        <CardTitle>My leave</CardTitle>
        {pending && pending.length > 0 ? (
          <Badge variant="warning">{pending.length} pending</Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading balances…</p>
        ) : balances && balances.length > 0 ? (
          <div className="space-y-2">
            {balances.slice(0, 1).map((b) => (
              <div key={b.id} className="flex items-center justify-between">
                <span className="text-sm text-text">{b.leaveTypeName ?? "Leave"}</span>
                <span className="text-xs text-text-muted">
                  {b.remaining} / {b.entitled} left
                </span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarClock} title="No leave balances" description="Leave balances will appear once configured." />
        )}
        <PermissionGate permission="hrms.leave.apply">
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => setActiveView("hrms")}>
              Apply for leave
            </Button>
          </div>
        </PermissionGate>
      </CardContent>
    </Card>
  );
}

const PRESENCE_STATUSES = [
  { key: "lunch", label: "Lunch", icon: UtensilsCrossed },
  { key: "tea_break", label: "Tea break", icon: Coffee },
  { key: "out_of_office", label: "Out of office", icon: DoorOpen },
] as const;

export function QuickCheckInCard() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: me, isLoading: meLoading, isError: meError } = useMyEmployee();
  const today = new Date().toISOString().slice(0, 10);
  const { data: records, isLoading: attendanceLoading, isError: attendanceError } = useAttendance({
    employeeId: me?.id,
    from: today,
    to: today,
  });
  const checkin = useAttendanceCheckin();
  const checkout = useAttendanceCheckout();
  const presence = useAttendancePresence();
  const record = me?.id ? records?.[0] : undefined;
  const presenceStatus = record?.presenceStatus ?? null;
  const presenceLabel = PRESENCE_STATUSES.find((s) => s.key === presenceStatus)?.label;
  const canSetPresence = Boolean(me?.id && record?.checkInAt && !record?.checkOutAt);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-[0_3px_18px_rgba(20,50,90,.035)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/10 text-success">
            <Clock size={15} />
          </div>
          <h2 className="text-base font-semibold text-text">Quick Check In</h2>
          {presenceLabel ? (
            <span className="rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-semibold text-warning">
              {presenceLabel}
            </span>
          ) : record ? (
            <span className="rounded-full bg-success/10 px-2.5 py-1 text-[10px] font-semibold capitalize text-success">
              {record.status}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setActiveView("my-attendance")}
          className="text-xs font-medium text-primary hover:underline"
        >
          View All
        </button>
      </div>
      <div className="mt-4">
        {meLoading || attendanceLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : meError || attendanceError ? (
          <p className="text-sm text-text-muted">Couldn't load today's attendance.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border bg-surface-elevated/50 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Checked in</p>
              <p className="mt-1 text-lg font-semibold text-text">
                {record?.checkInAt ? formatTime(record.checkInAt) : "—"}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-surface-elevated/50 px-4 py-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-muted">Checked out</p>
              <p className="mt-1 text-lg font-semibold text-text">
                {record?.checkOutAt ? formatTime(record.checkOutAt) : "—"}
              </p>
            </div>
          </div>
        )}

        {checkin.error ? <p className="mt-2 text-xs text-error">{checkin.error.message}</p> : null}
        {checkout.error ? <p className="mt-2 text-xs text-error">{checkout.error.message}</p> : null}
        {presence.error ? <p className="mt-2 text-xs text-error">{presence.error.message}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <PermissionGate permission="hrms.attendance.checkin">
            {me?.id && !record?.checkInAt ? (
              <button
                type="button"
                disabled={checkin.isPending}
                onClick={() => checkin.mutate()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-[11px] font-semibold text-white transition hover:bg-primary-hover disabled:opacity-50"
              >
                <LogIn size={13} />
                {checkin.isPending ? "Checking in…" : "Check in"}
              </button>
            ) : null}
          </PermissionGate>
          <PermissionGate permission="hrms.attendance.checkout">
            {me?.id && record?.checkInAt && !record?.checkOutAt ? (
              <button
                type="button"
                disabled={checkout.isPending}
                onClick={() => checkout.mutate()}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-[11px] font-semibold text-text transition hover:bg-surface-elevated disabled:opacity-50"
              >
                <LogOut size={13} />
                {checkout.isPending ? "Checking out…" : "Check out"}
              </button>
            ) : null}
          </PermissionGate>
          {me?.id && record?.checkOutAt ? (
            <span className="flex items-center gap-2 text-[11px] text-text-muted">
              <CheckCircle2 size={13} className="text-success" />
              Done for today
            </span>
          ) : null}
        </div>

        {canSetPresence ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {PRESENCE_STATUSES.map(({ key, label, icon: Icon }) => {
              const active = presenceStatus === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={presence.isPending}
                  onClick={() => presence.mutate(active ? null : key)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[10px] font-medium transition disabled:opacity-50",
                    active
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-surface text-text-secondary hover:bg-surface-elevated",
                  )}
                >
                  <Icon size={12} className="shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HrmsOverviewWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: overview, isLoading, isError, refetch } = useHrmsOverview();

  const stats = overview
    ? [
        { label: "Employees", value: overview.totalEmployees },
        { label: "Present today", value: overview.presentToday },
        { label: "Pending leave", value: overview.pendingLeaveRequests },
        { label: "Pending corrections", value: overview.pendingCorrections },
      ]
    : [];

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>People overview</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setActiveView("hrms")}>
          Open HRMS
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : isError ? (
          <EmptyState
            icon={Users}
            title="Couldn't load HR overview"
            action={<Button variant="secondary" size="sm" onClick={() => refetch()}>Retry</Button>}
          />
        ) : overview ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="rounded-md border bg-surface p-3">
                  <p className="text-lg font-semibold text-text">{s.value}</p>
                  <p className="text-xs text-text-muted">{s.label}</p>
                </div>
              ))}
            </div>
            {overview.byDepartment.length > 0 ? (
              <div className="mt-3 space-y-1.5">
                {overview.byDepartment.slice(0, 3).map((d) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <span className="text-sm text-text-secondary">{d.name}</span>
                    <span className="text-xs text-text-muted">{d.count}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function PendingHrApprovalsWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: overview, isLoading } = useHrmsOverview();
  const pending = (overview?.pendingLeaveRequests ?? 0) + (overview?.pendingCorrections ?? 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending approvals</CardTitle>
        {pending > 0 ? <Badge variant="warning">{pending}</Badge> : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : pending > 0 ? (
          <div className="space-y-2 text-sm text-text-secondary">
            {(overview?.pendingLeaveRequests ?? 0) > 0 ? (
              <div className="flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-warning" />
                <span>{overview?.pendingLeaveRequests} leave request{overview?.pendingLeaveRequests === 1 ? "" : "s"}</span>
              </div>
            ) : null}
            {(overview?.pendingCorrections ?? 0) > 0 ? (
              <div className="flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-warning" />
                <span>{overview?.pendingCorrections} attendance correction{overview?.pendingCorrections === 1 ? "" : "s"}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState icon={ClipboardCheck} title="Nothing to review" description="Pending approvals will appear here." />
        )}
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => setActiveView("hrms")}>
            Review in HRMS
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screening: "Screening",
  shortlisted: "Shortlisted",
  interview: "Interview",
  evaluation: "Evaluation",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

export function OpenPositionsWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: overview, isLoading } = useInterviewOverview();
  const { data: jobs } = useJobOpenings("open");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open positions</CardTitle>
        <Badge variant="secondary">{overview?.openJobs ?? jobs?.length ?? 0}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : jobs && jobs.length > 0 ? (
          <div className="space-y-2">
            {jobs.slice(0, 1).map((j) => (
              <div key={j.id} className="flex items-center justify-between">
                <span className="truncate text-sm text-text">{j.title}</span>
                <span className="text-xs text-text-muted">{j.departmentName ?? ""}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Briefcase} title="No open positions" description="Open a job to start recruiting." />
        )}
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => setActiveView("interview")}>
            View jobs
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CandidatePipelineWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: overview, isLoading } = useInterviewOverview();
  const stages = Object.entries(overview?.candidatesByStage ?? {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidate pipeline</CardTitle>
        <Badge variant="secondary">{overview?.totalCandidates ?? 0}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : stages.length > 0 ? (
          <div className="space-y-1.5">
            {stages.map(([stage, count]) => (
              <div key={stage} className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{STAGE_LABELS[stage] ?? stage}</span>
                <span className="text-xs font-medium text-text">{count}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title="No candidates" description="Candidates will appear once added." />
        )}
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => setActiveView("interview")}>
            View pipeline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function InterviewsTodayWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: overview } = useInterviewOverview();
  const { data: sessions, isLoading } = useInterviewSessions(true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Interviews</CardTitle>
        <Badge variant="secondary">{overview?.interviewsToday ?? 0} today</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : sessions && sessions.length > 0 ? (
          <div className="space-y-2">
            {sessions.slice(0, 1).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveView("interview")}
                className="flex w-full items-center justify-between rounded-md p-1.5 text-left hover:bg-surface-elevated"
              >
                <span className="truncate text-sm text-text">
                  {s.candidate?.name ?? "Interview"}
                </span>
                <span className="text-xs text-text-muted">
                  {s.scheduledAt ? formatTime(s.scheduledAt) : "Unscheduled"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={Calendar} title="No upcoming interviews" description="Scheduled interviews will appear here." />
        )}
      </CardContent>
    </Card>
  );
}

export function PendingEvaluationsWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: overview } = useInterviewOverview();
  const { data: pending, isLoading } = usePendingEvaluations();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending evaluations</CardTitle>
        {(overview?.pendingEvaluations ?? 0) > 0 ? (
          <Badge variant="warning">{overview?.pendingEvaluations}</Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : pending && pending.length > 0 ? (
          <p className="text-sm text-text-secondary">
            {pending.length} interview evaluation{pending.length === 1 ? "" : "s"} awaiting review.
          </p>
        ) : (
          <EmptyState icon={ClipboardCheck} title="Nothing to evaluate" description="Completed interviews awaiting feedback will appear here." />
        )}
        <div className="mt-3">
          <Button variant="secondary" size="sm" onClick={() => setActiveView("interview")}>
            Review
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
