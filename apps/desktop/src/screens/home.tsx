import {
  CheckSquare,
  FileText,
  Folder,
  MessageSquare,
  Sparkles,
  Upload,
  Video,
} from "lucide-react";
import { useUIStore } from "../stores/ui";
import { currentUser, messages, meetings, notifications, projects, tasks } from "../lib/data";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { cn } from "../lib/utils";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen() {
  const setActiveView = useUIStore((s) => s.setActiveView);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
        <h1 className="text-xl font-semibold text-text">
          {getGreeting()}, {currentUser.name.split(" ")[0]}
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
              <Button variant="secondary">
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
            <Badge variant="secondary">{tasks.length}</Badge>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveView("project")}
                  className="flex w-full items-center gap-2 rounded-md p-1.5 text-left hover:bg-surface-elevated"
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      t.priority === "high" && "bg-error",
                      t.priority === "medium" && "bg-warning",
                      t.priority === "low" && "bg-info",
                    )}
                  />
                  <span className="flex-1 truncate text-sm text-text">{t.title}</span>
                  <span className="text-xs text-text-muted">{t.due}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming meetings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {meetings.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveView("meeting")}
                  className="flex w-full items-center justify-between rounded-md p-1.5 text-left hover:bg-surface-elevated"
                >
                  <span className="text-sm text-text">{m.title}</span>
                  <span className="text-xs text-text-muted">{m.time}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent conversations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {messages.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setActiveView("channel")}
                  className="flex w-full flex-col gap-0.5 rounded-md p-1.5 text-left hover:bg-surface-elevated"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-text">{m.author}</span>
                    <span className="text-xs text-text-muted">{m.time}</span>
                  </div>
                  <p className="line-clamp-1 text-xs text-text-secondary">{m.content}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent projects</CardTitle>
          </CardHeader>
          <CardContent>
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
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${p.progress * 100}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              onClick={() => setActiveView("inbox")}
              className="flex w-full items-center gap-3 rounded-md p-2 hover:bg-surface-elevated"
            >
              <FileText className="h-4 w-4 text-text-muted" />
              <div className="flex-1 text-left">
                <p className="text-sm text-text">Website homepage v3</p>
                <p className="text-xs text-text-muted">Awaiting approval from ClientCo</p>
              </div>
              <Badge variant="warning">1</Badge>
            </button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 xl:col-span-1">
          <CardHeader>
            <CardTitle>AI daily brief</CardTitle>
            <Sparkles className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-text-secondary">
              You have 2 tasks due today, 1 overdue approval, and 3 unread mentions in
              #design. Engineering standup is live now. Consider reviewing the brand
              palette thread before the client review.
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
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setActiveView("inbox")}
                  className="flex items-start gap-3 rounded-md p-2 text-left hover:bg-surface-elevated"
                >
                  <span
                    className={cn(
                      "mt-0.5 h-2 w-2 rounded-full",
                      !n.read && "bg-unread",
                      n.read && "bg-text-muted",
                    )}
                  />
                  <div className="flex-1">
                    <p className="text-sm text-text">{n.title}</p>
                    <p className="text-xs text-text-muted">{n.body}</p>
                  </div>
                  <span className="text-xs text-text-muted">{n.time}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
