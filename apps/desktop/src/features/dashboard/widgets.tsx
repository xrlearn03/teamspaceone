import { useEffect, useMemo, useRef, useState } from "react";
import type { DailyDigestResult, Meeting, Message } from "../../lib/api";
import {
  Briefcase,
  Calendar,
  CalendarCheck,
  CalendarClock,
  CheckSquare,
  ClipboardCheck,
  Coffee,
  DoorOpen,
  FileText,
  Folder,
  LogIn,
  LogOut,
  MessageSquare,
  Sparkles,
  Trash2,
  Upload,
  Users,
  UtensilsCrossed,
  Video,
} from "lucide-react";
import { useUIStore } from "../../stores/ui";
import {
  useChannels,
  useClients,
  useCreateDirectChannel,
  useCreateMeeting,
  useCreateProject,
  useCreateTask,
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
  useWorkspaces,
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@teamspace-one/ui/dialog";
import { Input } from "@teamspace-one/ui/input";
import { UserAvatar } from "../../components/user-avatar";
import { getUserDisplayName } from "../../lib/utils";

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

function normalizeDigest(result: unknown): DailyDigestResult {
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

export function QuickActionsWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const organisationId = getActiveOrganisation() ?? undefined;
  const { data: projects } = useProjects();
  const { data: workspaces } = useWorkspaces(organisationId);
  const { data: clients } = useClients(organisationId);
  const { data: members } = useMembers(organisationId);
  const memberUserIds = useMemo(() => [...new Set((members ?? []).map((m) => m.userId))], [members]);
  const { data: users } = useUsers(memberUserIds);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const createMeeting = useCreateMeeting();
  const createDirectChannel = useCreateDirectChannel();
  const createTask = useCreateTask();
  const createProject = useCreateProject();
  const [dialog, setDialog] = useState<"message" | "task" | "project" | null>(null);

  const memberOptions = (members ?? []).map((m) => ({
    ...m,
    displayName: getUserDisplayName(userMap.get(m.userId)),
  }));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <PermissionGate permission="collaboration.message.send">
              <Button size="sm" className="w-full" onClick={() => setDialog("message")}>
                <span className="inline-flex items-center gap-1.5">
                  <MessageSquare className="h-4 w-4 shrink-0" />
                  <span className="text-center">New message</span>
                </span>
              </Button>
            </PermissionGate>
            <PermissionGate permission="collaboration.task.create">
              <Button size="sm" variant="secondary" className="w-full" onClick={() => setDialog("task")}>
                <span className="inline-flex items-center gap-1.5">
                  <CheckSquare className="h-4 w-4 shrink-0" />
                  <span className="text-center">Create task</span>
                </span>
              </Button>
            </PermissionGate>
            <PermissionGate permission="collaboration.project.create">
              <Button size="sm" variant="secondary" className="w-full" onClick={() => setDialog("project")}>
                <span className="inline-flex items-center gap-1.5">
                  <Folder className="h-4 w-4 shrink-0" />
                  <span className="text-center">Create project</span>
                </span>
              </Button>
            </PermissionGate>
            <PermissionGate permission="collaboration.meeting.create">
              <Button
                size="sm"
                variant="secondary"
                className="w-full"
                disabled={createMeeting.isPending}
                onClick={() =>
                  createMeeting.mutate(
                    { title: "Instant meeting" },
                    {
                      onSuccess: (meeting) =>
                        setActiveView("meeting", { meetingId: meeting.id }),
                    },
                  )
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <Video className="h-4 w-4 shrink-0" />
                  <span className="text-center">Start meeting</span>
                </span>
              </Button>
            </PermissionGate>
            <PermissionGate permission="collaboration.file.upload">
              <Button size="sm" variant="secondary" className="w-full" onClick={() => setActiveView("files")}>
                <span className="inline-flex items-center gap-1.5">
                  <Upload className="h-4 w-4 shrink-0" />
                  <span className="text-center">Upload file</span>
                </span>
              </Button>
            </PermissionGate>
            <Button size="sm" variant="secondary" className="w-full" onClick={() => setActiveView("ai")}>
              <span className="inline-flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span className="text-center">Ask AI</span>
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <NewMessageDialog
        open={dialog === "message"}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        members={memberOptions}
        createDirectChannel={createDirectChannel}
        onSuccess={(channel) => { setDialog(null); setActiveView("dm", { channelId: channel.id }); }}
      />

      <CreateTaskDialog
        open={dialog === "task"}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        projects={projects ?? []}
        createTask={createTask}
        onSuccess={(task) => { setDialog(null); setActiveView("project", { projectId: task.projectId }); }}
      />

      <CreateProjectDialog
        open={dialog === "project"}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        workspaces={workspaces ?? []}
        clients={clients ?? []}
        members={memberOptions}
        createProject={createProject}
        onSuccess={(project) => { setDialog(null); setActiveView("project", { projectId: project.id }); }}
      />
    </>
  );
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
    <Card>
      <CardHeader>
        <CardTitle>AI daily brief</CardTitle>
        <Sparkles className="h-4 w-4 text-primary" />
      </CardHeader>
      <CardContent>
        {dailyDigest.isPending ? (
          <p className="text-sm leading-relaxed text-text-secondary">Generating daily brief...</p>
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
          <p className="text-sm leading-relaxed text-text-secondary">
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

export function NotificationsWidget() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: notifications } = useNotifications();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => setActiveView("inbox")}>
          View all
        </Button>
      </CardHeader>
      <CardContent>
        {notifications && notifications.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {notifications.slice(0, 1).map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setActiveView("inbox")}
                className="flex items-start gap-3 rounded-md p-2 text-left hover:bg-surface-elevated"
              >
                <span
                  className={`mt-0.5 h-2 w-2 rounded-full ${!n.read ? "bg-unread" : "bg-text-muted"}`}
                />
                <div className="flex-1">
                  <p className="text-sm text-text">{n.title}</p>
                  <p className="text-xs text-text-muted">{n.body}</p>
                </div>
                <span className="text-xs text-text-muted">{formatRelative(n.createdAt)}</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState icon={FileText} title="No notifications" description="New activity will appear here." />
        )}
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

export function MyAttendanceWidget() {
  const { data: me, isLoading: meLoading, isError: meError, error: meErrorDetail } = useMyEmployee();
  const today = new Date().toISOString().slice(0, 10);
  const {
    data: records,
    isLoading: attendanceLoading,
    isError: attendanceError,
  } = useAttendance({ employeeId: me?.id, from: today, to: today });
  const checkin = useAttendanceCheckin();
  const checkout = useAttendanceCheckout();
  const presence = useAttendancePresence();
  const record = me?.id ? records?.[0] : undefined;
  const presenceStatus = record?.presenceStatus ?? null;
  const presenceLabel = PRESENCE_STATUSES.find((s) => s.key === presenceStatus)?.label;
  const canSetPresence = Boolean(me?.id && record?.checkInAt && !record?.checkOutAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>My attendance</CardTitle>
        <div className="flex items-center gap-1.5">
          {presenceLabel ? <Badge variant="warning">{presenceLabel}</Badge> : null}
          {record ? <Badge variant={record.status === "present" ? "success" : "secondary"}>{record.status}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent>
        {meLoading || attendanceLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : meError ? (
          <p className="text-sm text-error">{meErrorDetail?.message ?? "Couldn’t load employee record."}</p>
        ) : attendanceError ? (
          <p className="text-sm text-error">Couldn’t load today&apos;s attendance.</p>
        ) : (
          <div className="space-y-1 text-sm text-text-secondary">
            <p>
              Checked in:{" "}
              <span className="text-text">{record?.checkInAt ? formatTime(record.checkInAt) : "—"}</span>
            </p>
            <p>
              Checked out:{" "}
              <span className="text-text">{record?.checkOutAt ? formatTime(record.checkOutAt) : "—"}</span>
            </p>
          </div>
        )}
        {checkin.error ? <p className="mt-2 text-xs text-error">{checkin.error.message}</p> : null}
        {checkout.error ? <p className="mt-2 text-xs text-error">{checkout.error.message}</p> : null}
        {presence.error ? <p className="mt-2 text-xs text-error">{presence.error.message}</p> : null}
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <PermissionGate permission="hrms.attendance.checkin">
              {me?.id && !record?.checkInAt ? (
                <Button size="sm" disabled={checkin.isPending} onClick={() => checkin.mutate()}>
                  <LogIn className="mr-1.5 h-4 w-4" />
                  Check in
                </Button>
              ) : null}
            </PermissionGate>
            <PermissionGate permission="hrms.attendance.checkout">
              {me?.id && record?.checkInAt && !record?.checkOutAt ? (
                <Button variant="secondary" size="sm" disabled={checkout.isPending} onClick={() => checkout.mutate()}>
                  <LogOut className="mr-1.5 h-4 w-4" />
                  Check out
                </Button>
              ) : null}
            </PermissionGate>
          </div>
          {canSetPresence ? (
            <div className="grid grid-cols-3 gap-2">
              {PRESENCE_STATUSES.map(({ key, label, icon: Icon }) => {
                const active = presenceStatus === key;
                return (
                  <Button
                    key={key}
                    variant={active ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    disabled={presence.isPending}
                    onClick={() => presence.mutate(active ? null : key)}
                  >
                    <Icon className="mr-1.5 h-4 w-4 shrink-0" />
                    <span className="truncate">{label}</span>
                  </Button>
                );
              })}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
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

function NewMessageDialog({
  open,
  onOpenChange,
  members,
  createDirectChannel,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: { userId: string; id: string; displayName?: string }[];
  createDirectChannel: ReturnType<typeof useCreateDirectChannel>;
  onSuccess: (channel: { id: string }) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>New direct message</DialogTitle>
          <DialogDescription>Select one or more organisation members.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
            {members.map((member) => (
              <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-elevated">
                <input
                  type="checkbox"
                  checked={selected.includes(member.userId)}
                  onChange={(e) => {
                    setSelected((prev) =>
                      e.target.checked
                        ? [...prev, member.userId]
                        : prev.filter((id) => id !== member.userId),
                    );
                  }}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">{member.displayName ?? "Unknown"}</span>
              </label>
            ))}
            {!members.length && <p className="text-sm text-text-muted">No members found.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={selected.length === 0 || createDirectChannel.isPending}
              onClick={() => createDirectChannel.mutate(selected, { onSuccess })}
            >
              Start conversation
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  projects,
  createTask,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; name: string }[];
  createTask: ReturnType<typeof useCreateTask>;
  onSuccess: (task: { id: string; projectId: string }) => void;
}) {
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");

  const selectClass = "h-9 w-full rounded-md border bg-surface px-3 text-sm text-text";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>Create task</DialogTitle>
          <DialogDescription>Add a new task to a project.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          <select
            className={selectClass}
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">Select a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
          <div className="grid grid-cols-2 gap-2">
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="backlog">Backlog</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="in_review">In Review</option>
              <option value="blocked">Blocked</option>
              <option value="done">Done</option>
            </select>
            <select className={selectClass} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={!projectId || !title.trim() || createTask.isPending}
              onClick={() =>
                createTask.mutate(
                  { projectId, title: title.trim(), status, priority },
                  { onSuccess },
                )
              }
            >
              Create task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateProjectDialog({
  open,
  onOpenChange,
  workspaces,
  clients,
  members,
  createProject,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  members: { userId: string; id: string; displayName?: string }[];
  createProject: ReturnType<typeof useCreateProject>;
  onSuccess: (project: { id: string }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [clientId, setClientId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);

  const selectClass = "h-9 w-full rounded-md border bg-surface px-3 text-sm text-text";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>Set up a new project for your workspace.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)" />
          <select className={selectClass} value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
            <option value="">No workspace</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
          <select className={selectClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border p-2">
            {members.map((member) => (
              <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-elevated">
                <input
                  type="checkbox"
                  checked={memberIds.includes(member.userId)}
                  onChange={(e) => {
                    setMemberIds((prev) =>
                      e.target.checked
                        ? [...prev, member.userId]
                        : prev.filter((id) => id !== member.userId),
                    );
                  }}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm">{member.displayName ?? "Unknown"}</span>
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={!name.trim() || createProject.isPending}
              onClick={() =>
                createProject.mutate(
                  {
                    name: name.trim(),
                    description: description.trim() || undefined,
                    workspaceId: workspaceId || undefined,
                    clientId: clientId || undefined,
                    memberIds,
                  },
                  { onSuccess },
                )
              }
            >
              Create project
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
