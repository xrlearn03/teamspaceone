import { useEffect, useState } from "react";
import {
  Calendar,
  CheckSquare,
  FileText,
  Folder,
  MessageSquare,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import {
  useChannels,
  useClients,
  useCreateDirectChannel,
  useCreateMeeting,
  useCreateProject,
  useCreateTask,
  useDailyDigest,
  useMe,
  useMeetings,
  useMembers,
  useMessages,
  useNotifications,
  useProjects,
  useTasks,
  useWorkspaces,
} from "../hooks/api";
import { getActiveOrganisation } from "../lib/api";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { Input } from "../components/ui/input";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

export function HomeScreen() {
  const { setActiveView } = useUIStore(
    useShallow((s) => ({ setActiveView: s.setActiveView })),
  );

  const { data: user } = useMe();
  const organisationId = getActiveOrganisation() ?? undefined;
  const { data: projects } = useProjects();
  const { data: meetings } = useMeetings();
  const { data: notifications } = useNotifications();
  const { data: channels } = useChannels();
  const { data: workspaces } = useWorkspaces(organisationId);
  const { data: clients } = useClients(organisationId);
  const { data: members } = useMembers(organisationId);
  const createMeeting = useCreateMeeting();
  const createDirectChannel = useCreateDirectChannel();
  const createTask = useCreateTask();
  const createProject = useCreateProject();

  const firstChannelId = channels?.[0]?.id;
  const { data: messages } = useMessages(firstChannelId);
  const firstProjectId = projects?.[0]?.id;
  const { data: tasks } = useTasks(firstProjectId);
  const dailyDigest = useDailyDigest();
  const [digest, setDigest] = useState("");

  useEffect(() => {
    if (digest || dailyDigest.isPending) return;
    dailyDigest
      .mutateAsync({ hours: 24 })
      .then((result) => setDigest(result.result))
      .catch(() => setDigest(""));
  }, [digest, dailyDigest]);

  const [dialog, setDialog] = useState<"message" | "task" | "project" | null>(null);

  const firstName =
    user?.firstName ?? user?.email?.split("@")[0] ?? "there";
  const unread = notifications?.filter((n) => !n.read) ?? [];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
        <h1 className="text-xl font-semibold text-text">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-text-secondary">
          Here is what needs your attention today.
        </p>
      </header>

      <div className="grid auto-rows-min grid-cols-1 gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        <Card className="md:col-span-2 xl:col-span-3">
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setDialog("message")}>
                <MessageSquare className="mr-1.5 h-4 w-4" />
                New message
              </Button>
              <Button variant="secondary" onClick={() => setDialog("task")}>
                <CheckSquare className="mr-1.5 h-4 w-4" />
                Create task
              </Button>
              <Button variant="secondary" onClick={() => setDialog("project")}>
                <Folder className="mr-1.5 h-4 w-4" />
                Create project
              </Button>
              <Button
                variant="secondary"
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
                <Video className="mr-1.5 h-4 w-4" />
                Start meeting
              </Button>
              <Button variant="secondary" onClick={() => setActiveView("files")}>
                <Upload className="mr-1.5 h-4 w-4" />
                Upload file
              </Button>
              <Button variant="secondary" onClick={() => setActiveView("ai")}>
                <Sparkles className="mr-1.5 h-4 w-4" />
                Ask AI
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My tasks</CardTitle>
            <Badge variant="secondary">{tasks?.length ?? 0}</Badge>
          </CardHeader>
          <CardContent>
            {tasks && tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveView("project", { projectId: t.projectId })}
                    className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-surface-elevated"
                  >
                    <span
                      className="h-2 w-2 rounded-full bg-primary"
                    />
                    <span className="flex-1 truncate text-sm text-text">{t.title}</span>
                    <span className="text-xs text-text-muted capitalize">{t.status}</span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={CheckSquare} title="No tasks" description="Create a task in a project to see it here." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming meetings</CardTitle>
          </CardHeader>
          <CardContent>
            {meetings && meetings.length > 0 ? (
              <div className="space-y-2">
                {meetings.slice(0, 6).map((m) => (
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

        <Card>
          <CardHeader>
            <CardTitle>Recent conversations</CardTitle>
          </CardHeader>
          <CardContent>
            {messages && messages.length > 0 ? (
              <div className="space-y-3">
                {messages.slice(-6).reverse().map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveView("channel", { channelId: m.channelId })}
                    className="flex w-full flex-col gap-0.5 rounded-md p-1.5 text-left hover:bg-surface-elevated"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-text">{m.senderId.slice(0, 8)}</span>
                      <span className="text-xs text-text-muted">{formatRelative(m.createdAt)}</span>
                    </div>
                    <p className="line-clamp-1 text-xs text-text-secondary">{m.content}</p>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={MessageSquare} title="No messages" description="Send a message in a channel to see it here." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent projects</CardTitle>
          </CardHeader>
          <CardContent>
            {projects && projects.length > 0 ? (
              <div className="space-y-3">
                {projects.map((p) => (
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

        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>AI daily brief</CardTitle>
            <Sparkles className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-text-secondary">
              {dailyDigest.isPending
                ? "Generating daily brief..."
                : digest || (unread.length > 0
                  ? `You have ${unread.length} unread notification${unread.length === 1 ? "" : "s"}. Open the Inbox to review them.`
                  : "No new notifications. You're all caught up.")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => setActiveView("ai")}
            >
              Ask follow-up
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-3">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setActiveView("inbox")}>
              View all
            </Button>
          </CardHeader>
          <CardContent>
            {notifications && notifications.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {notifications.slice(0, 8).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setActiveView("inbox")}
                    className="flex items-start gap-3 rounded-md p-2 text-left hover:bg-surface-elevated"
                  >
                    <span
                      className={
                        `mt-0.5 h-2 w-2 rounded-full ${!n.read ? "bg-unread" : "bg-text-muted"}`
                      }
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
      </div>

      <NewMessageDialog
        open={dialog === "message"}
        onOpenChange={(open) => { if (!open) setDialog(null); }}
        members={members ?? []}
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
        members={members ?? []}
        createProject={createProject}
        onSuccess={(project) => { setDialog(null); setActiveView("project", { projectId: project.id }); }}
      />
    </div>
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
  members: { userId: string; id: string }[];
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
                <span className="text-sm">{member.userId}</span>
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
  members: { userId: string; id: string }[];
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
                <span className="text-sm">{member.userId}</span>
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
