import { useMemo, useState } from "react";
import {
  Calendar,
  Filter,
  Folder,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  SortAsc,
  Users,
} from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useProjects, useTasks, useCreateTask } from "../hooks/api";
import { type Task } from "../lib/api";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { cn } from "../lib/utils";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "board", label: "Board" },
  { id: "list", label: "List" },
  { id: "timeline", label: "Timeline" },
  { id: "files", label: "Files" },
  { id: "discussions", label: "Discussions" },
  { id: "activity", label: "Activity" },
];

export function ProjectScreen() {
  const activeProjectId = useUIStore((s) => s.activeProjectId);
  const { data: projects } = useProjects();
  const project =
    projects?.find((p) => p.id === activeProjectId) ?? projects?.[0];
  const { data: tasks } = useTasks(project?.id);
  const createTask = useCreateTask();
  const [tab, setTab] = useState("board");
  const [newTask, setNewTask] = useState<Record<string, string>>({});

  const grouped = useMemo(() => {
    const g: Record<string, Task[]> = {};
    if (!tasks) return g;
    for (const t of tasks) {
      const status = t.status || "Backlog";
      if (!g[status]) g[status] = [];
      g[status].push(t);
    }
    return g;
  }, [tasks]);

  const columns =
    tasks && tasks.length > 0 ? Object.keys(grouped) : ["Backlog", "Todo", "In Progress", "In Review", "Blocked", "Done"];

  function addTask(status: string) {
    const title = newTask[status]?.trim();
    if (!title || !project) return;
    createTask.mutate({ projectId: project.id, title });
    setNewTask((prev) => ({ ...prev, [status]: "" }));
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        No project selected.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b px-6 py-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle text-primary">
              <Folder className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text">{project.name}</h1>
              <p className="text-xs text-text-muted capitalize">
                {project.status} · {project.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {["A", "S", "J"].map((initial, i) => (
                <Avatar key={i} className="h-7 w-7 border-2 border-surface">
                  <AvatarFallback className="text-[10px]">{initial}</AvatarFallback>
                </Avatar>
              ))}
            </div>
            <Button variant="ghost" size="icon">
              <Users className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-primary-subtle text-primary"
                    : "text-text-secondary hover:bg-surface-elevated hover:text-text",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <Input placeholder="Filter tasks" className="h-8 w-48 pl-7 text-xs" />
            </div>
            <Button variant="ghost" size="icon">
              <Filter className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <SortAsc className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon">
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => addTask("Todo")}>
              <Plus className="mr-1.5 h-4 w-4" />
              New task
            </Button>
          </div>
        </div>
      </header>

      {tab === "overview" && <ProjectOverview tasks={tasks} />}
      {(tab === "board" || tab === "list") && (
        <div className="flex flex-1 gap-3 overflow-x-auto p-4">
          {columns.map((col) => {
            const colTasks = grouped[col] ?? [];
            return (
              <div
                key={col}
                className="flex w-64 shrink-0 flex-col rounded-lg border bg-surface-elevated/50"
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs font-semibold text-text">{col}</span>
                  <span className="text-xs text-text-muted">{colTasks.length}</span>
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {colTasks.map((t) => (
                    <Card key={t.id} className="cursor-pointer p-3 hover:border-primary/30">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium text-text">{t.title}</p>
                        <span className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-text-muted">
                          {t.assigneeId ? t.assigneeId.slice(0, 8) : "Unassigned"}
                        </span>
                      </div>
                    </Card>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="rounded-md border border-dashed py-6 text-center text-xs text-text-muted">
                      No tasks
                    </div>
                  )}
                </div>
                <div className="m-2 space-y-1">
                  <Input
                    placeholder="Add task…"
                    value={newTask[col] ?? ""}
                    onChange={(e) =>
                      setNewTask((prev) => ({ ...prev, [col]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTask(col);
                    }}
                    className="h-7 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => addTask(col)}
                    className="flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-text-muted hover:bg-surface-elevated hover:text-text"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add task
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab === "timeline" && (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          Timeline view is coming soon.
        </div>
      )}
      {tab === "files" && (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          Files view is coming soon.
        </div>
      )}
      {tab === "discussions" && (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          Discussions view is coming soon.
        </div>
      )}
      {tab === "activity" && (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">
          Activity view is coming soon.
        </div>
      )}
    </div>
  );
}

function ProjectOverview({
  tasks,
}: {
  tasks?: Task[];
}) {
  const total = tasks?.length ?? 0;
  const done = tasks?.filter((t) => t.status.toLowerCase() === "done").length ?? 0;
  const progress = total > 0 ? done / total : 0;

  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!tasks) return {};
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    return counts;
  }, [tasks]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid auto-rows-min grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <h3 className="text-sm font-semibold text-text">Progress summary</h3>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-surface-elevated">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-text-muted">
            {Math.round(progress * 100)}% complete ({done} of {total})
          </p>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-text">Task breakdown</h3>
          <div className="mt-3 space-y-2">
            {Object.entries(breakdown).length > 0 ? (
              Object.entries(breakdown).map(([label, count]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary capitalize">{label}</span>
                  <span className="font-medium text-text">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-muted">No tasks yet.</p>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-text">Upcoming deadlines</h3>
          <div className="mt-3 space-y-2">
            {tasks && tasks.length > 0 ? (
              tasks.slice(0, 6).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-text-muted" />
                  <span className="flex-1 text-text-secondary">{t.title}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-text-muted">No upcoming deadlines.</p>
            )}
          </div>
        </Card>

        <Card className="md:col-span-2">
          <h3 className="text-sm font-semibold text-text">AI project summary</h3>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            {total > 0
              ? `This project has ${total} task${total === 1 ? "" : "s"}. ${done} ${done === 1 ? "is" : "are"} done. Keep up the momentum.`
              : "No tasks yet. Create one to start tracking progress."}
          </p>
        </Card>
      </div>
    </div>
  );
}
