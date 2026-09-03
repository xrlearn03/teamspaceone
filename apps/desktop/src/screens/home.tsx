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
  useMe,
  useMeetings,
  useMessages,
  useNotifications,
  useProjects,
  useTasks,
} from "../hooks/api";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";

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
  const { data: projects } = useProjects();
  const { data: meetings } = useMeetings();
  const { data: notifications } = useNotifications();
  const { data: channels } = useChannels();
  const firstChannelId = channels?.[0]?.id;
  const { data: messages } = useMessages(firstChannelId);
  const firstProjectId = projects?.[0]?.id;
  const { data: tasks } = useTasks(firstProjectId);

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
              <Button onClick={() => setActiveView("dm")}>
                <MessageSquare className="mr-1.5 h-4 w-4" />
                New message
              </Button>
              <Button variant="secondary" onClick={() => setActiveView("project")}>
                <CheckSquare className="mr-1.5 h-4 w-4" />
                Create task
              </Button>
              <Button variant="secondary" onClick={() => setActiveView("project")}>
                <Folder className="mr-1.5 h-4 w-4" />
                Create project
              </Button>
              <Button variant="secondary" onClick={() => setActiveView("meeting")}>
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
                    onClick={() => setActiveView("meeting", { meetingId: m.id })}
                    className="flex w-full items-center justify-between rounded-md p-1.5 text-left hover:bg-surface-elevated"
                  >
                    <span className="text-sm text-text">{m.title}</span>
                    <span className="text-xs text-text-muted">
                      {m.status === "live" ? "Live" : m.scheduledAt ? formatTime(m.scheduledAt) : "Upcoming"}
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
              {unread.length > 0
                ? `You have ${unread.length} unread notification${unread.length === 1 ? "" : "s"}. Open the Inbox to review them.`
                : "No new notifications. You're all caught up."}
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
    </div>
  );
}
