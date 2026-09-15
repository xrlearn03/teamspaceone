import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  Activity,
  Bug,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Filter,
  Flag,
  Folder,
  Grid2X2,
  Lightbulb,
  List,
  ListChecks,
  Search,
  Smartphone,
  Target,
  Users,
} from "lucide-react";
import {
  useClients,
  useCreateTask,
  useCreateTicket,
  useMe,
  useMembers,
  useProjects,
  useProjectFiles,
  useRoles,
  useTimeEntries,
  useUsers,
  useWorkspaces,
} from "../hooks/api";
import {
  downloadFile,
  getActiveOrganisation,
  getMilestones,
  getProjectActivity,
  getTasks,
  type FileRecord,
  type Milestone,
  type Project,
  type ProjectActivity,
  type Task,
  type UserDto,
} from "../lib/api";
import { useUIStore } from "../stores/ui";
import { usePermissions } from "../hooks/usePermissions";
import { toast, toastError } from "../lib/toast";
import { cn, getUserDisplayName } from "../lib/utils";
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
import { PageHeader } from "./hr/common";
import { SectionError, SectionSkeleton, formatDate } from "./hrms/common";
import { MyTasksBoard, isBugTask, severityClasses, severityLabel, timeAgo } from "./my-tasks-board";
import { Gantt, ProjectDialog } from "./project";

/* =========================================================
   TYPES & HELPERS
========================================================= */

type DisplayStatus = "On Track" | "At Risk" | "On Hold" | "Completed" | "Archived";
type Tab = "projects" | "tasks" | "timeline" | "milestones" | "files";

/** Card art is cycled deterministically by project id so it stays stable. */
const CARD_THEMES = [
  { icon: Folder, iconClass: "bg-indigo-50 text-indigo-600", bannerClass: "bg-gradient-to-r from-[#071b36] via-[#12345a] to-[#0b203b]" },
  { icon: Smartphone, iconClass: "bg-emerald-50 text-emerald-600", bannerClass: "bg-gradient-to-r from-[#203638] via-[#304f4e] to-[#071a1b]" },
  { icon: Target, iconClass: "bg-orange-50 text-orange-500", bannerClass: "bg-gradient-to-r from-[#263952] via-[#526a7e] to-[#28384b]" },
  { icon: ListChecks, iconClass: "bg-blue-50 text-blue-600", bannerClass: "bg-gradient-to-r from-[#071a32] via-[#102d4d] to-[#08182e]" },
  { icon: Users, iconClass: "bg-pink-50 text-pink-500", bannerClass: "bg-gradient-to-r from-[#283f91] via-[#5b68d0] to-[#7d4bd1]" },
  { icon: Lightbulb, iconClass: "bg-cyan-50 text-cyan-600", bannerClass: "bg-gradient-to-r from-[#061a30] via-[#102d4d] to-[#09192e]" },
] as const;

function themeFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CARD_THEMES[h % CARD_THEMES.length];
}

function displayStatus(project: Project): DisplayStatus {
  if (project.status === "on_hold") return "On Hold";
  if (project.status === "completed") return "Completed";
  if (project.status === "archived") return "Archived";
  if (project.targetDate && new Date(project.targetDate).getTime() < Date.now()) return "At Risk";
  return "On Track";
}

function statusClasses(status: DisplayStatus) {
  switch (status) {
    case "On Track":
      return "bg-emerald-50 text-emerald-600 border-emerald-100";
    case "At Risk":
      return "bg-red-50 text-red-500 border-red-100";
    case "On Hold":
      return "bg-rose-50 text-rose-500 border-rose-100";
    case "Completed":
      return "bg-blue-50 text-blue-600 border-blue-100";
    default:
      return "bg-slate-50 text-slate-500 border-slate-200";
  }
}

function progressBarClass(status: DisplayStatus) {
  if (status === "At Risk") return "bg-orange-400";
  if (status === "On Hold") return "bg-pink-400";
  if (status === "Completed") return "bg-blue-500";
  return "bg-indigo-500";
}

function taskProgress(tasks: Task[] | undefined) {
  if (!tasks || tasks.length === 0) return 0;
  return Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100);
}

function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${sizes[i]}`;
}

function startOfWeek(d: Date) {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function describeActivity(item: ProjectActivity) {
  const meta = (item.metadata ?? {}) as { title?: string; name?: string };
  const target = meta.title ?? meta.name;
  const suffix = target ? ` "${target}"` : "";
  switch (item.action) {
    case "project.created":
      return `created the project${suffix}`;
    case "project.updated":
      return "updated the project";
    case "task.created":
    case "task.created.from_message":
      return `created a task${suffix}`;
    case "task.completed":
      return `completed a task${suffix}`;
    case "task.updated":
      return `updated a task${suffix}`;
    case "task.deleted":
      return `deleted a task${suffix}`;
    case "comment.created":
      return "posted a comment";
    case "attachment.added":
    case "task.attachment.added":
      return "uploaded a file";
    case "approval.created":
      return "requested an approval";
    default:
      return item.action.replace(/[._]/g, " ");
  }
}

function activityIcon(action: string) {
  if (action.startsWith("task.completed")) return <CheckCircle2 size={12} />;
  if (action.includes("attachment")) return <FileText size={12} />;
  if (action.startsWith("comment")) return <Activity size={12} />;
  if (action.startsWith("task")) return <ListChecks size={12} />;
  return <Activity size={12} />;
}

/* =========================================================
   PROJECT CARD
========================================================= */

function ProjectCard({ project, tasks, userMap, onOpen }: { project: Project; tasks: Task[] | undefined; userMap: Map<string, UserDto>; onOpen: () => void }) {
  const theme = themeFor(project.id);
  const status = displayStatus(project);
  const progress = taskProgress(tasks);
  const Icon = theme.icon;
  const members = project.members ?? [];

  return (
    <article
      onClick={onOpen}
      className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg"
    >
      <div className={cn("relative h-[78px] overflow-hidden", theme.bannerClass)}>
        <div className="absolute -right-8 top-[-45px] h-32 w-72 rotate-[-12deg] rounded-[50%] border-t border-white/20" />
        <div className="absolute -right-12 top-[-25px] h-24 w-72 rotate-[-15deg] rounded-[50%] border-t border-white/10" />
        <div className="absolute bottom-[-50px] left-[25%] h-24 w-72 rotate-[10deg] rounded-[50%] border-t border-white/10" />
        <div className={cn("absolute left-5 top-3 flex h-12 w-12 items-center justify-center rounded-xl border border-white/50", theme.iconClass)}>
          <Icon size={21} />
        </div>
        <span className={cn("absolute right-5 top-4 rounded-lg border px-3 py-1 text-[10px] font-semibold", statusClasses(status))}>
          {status}
        </span>
      </div>

      <div className="p-4">
        <h3 className="text-[14px] font-semibold text-text">{project.name}</h3>
        <p className="mt-1 min-h-[32px] text-[11px] leading-4 text-text-muted line-clamp-2">
          {project.description || "No description yet."}
        </p>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-[11px] font-semibold text-text">{progress}%</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-elevated">
            <div className={cn("h-full rounded-full transition-all", progressBarClass(status))} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
            <CalendarDays size={13} />
            <span>{project.startDate ? formatDate(project.startDate) : "—"}</span>
            <span>–</span>
            <span>{project.targetDate ? formatDate(project.targetDate) : "—"}</span>
          </div>
          <div className="flex items-center">
            <MemberStack memberIds={members.map((m) => m.userId)} userMap={userMap} />
          </div>
        </div>
      </div>
    </article>
  );
}

function MemberStack({ memberIds, userMap }: { memberIds: string[]; userMap: Map<string, UserDto> }) {
  const shown = memberIds.slice(0, 3);
  const extra = memberIds.length - shown.length;
  if (memberIds.length === 0) return null;
  return (
    <>
      {shown.map((id, index) => (
        <UserAvatar
          key={id}
          user={userMap.get(id)}
          className={cn("h-7 w-7 border-2 border-surface", index > 0 && "-ml-2")}
          fallbackClassName="text-[9px]"
        />
      ))}
      {extra > 0 ? (
        <span className="ml-1 flex h-7 min-w-7 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[9px] font-semibold text-primary">
          +{extra}
        </span>
      ) : null}
    </>
  );
}

/* =========================================================
   LOWER PANELS
========================================================= */

function Panel({ icon, title, action, children }: { icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-[14px] font-semibold text-text">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RecentBugReports({ bugs, projectMap, userMap, onReport }: { bugs: Task[]; projectMap: Map<string, Project>; userMap: Map<string, UserDto>; onReport?: () => void }) {
  return (
    <Panel
      icon={<Bug size={17} className="text-error" />}
      title="Recent Bug Reports"
      action={
        onReport ? (
          <button type="button" onClick={onReport} className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-primary-hover">
            <Bug size={12} />
            Report Bug
          </button>
        ) : undefined
      }
    >
      <div>
        {bugs.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] text-text-muted">No open bugs in your projects.</p>
        ) : (
          bugs.map((bug) => (
            <div key={bug.id} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
              <span className={cn("rounded-md px-2 py-1 text-[9px] font-semibold", severityClasses(bug.priority))}>
                {severityLabel(bug.priority)}
              </span>
              <p className="min-w-0 flex-1 truncate text-[11px] font-medium text-text">{bug.title}</p>
              <span className="hidden text-[10px] text-text-muted sm:block">
                {projectMap.get(bug.projectId)?.name ?? "Project"}
                {bug.assigneeId && userMap.get(bug.assigneeId) ? ` · ${getUserDisplayName(userMap.get(bug.assigneeId))}` : ""}
              </span>
              <span className="w-12 shrink-0 text-right text-[10px] text-text-muted">{timeAgo(bug.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function UpcomingMilestonesPanel({ milestones, projectMap, onViewAll }: { milestones: Milestone[]; projectMap: Map<string, Project>; onViewAll: () => void }) {
  return (
    <Panel
      icon={<Flag size={17} className="text-primary" />}
      title="Upcoming Milestones"
      action={
        <button type="button" onClick={onViewAll} className="text-[10px] font-medium text-primary">
          View All
        </button>
      }
    >
      <div className="px-4 py-2">
        {milestones.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-text-muted">No upcoming milestones.</p>
        ) : (
          milestones.map((milestone, index) => (
            <div key={milestone.id} className="relative grid grid-cols-[92px_18px_1fr] gap-2 py-2.5">
              {index !== milestones.length - 1 && <div className="absolute left-[100px] top-7 h-10 w-px bg-border" />}
              <p className="text-[10px] text-text-secondary">{formatDate(milestone.dueDate)}</p>
              <div className="relative z-10 flex justify-center">
                <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", milestone.status === "completed" ? "bg-success" : "bg-primary")} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-text">{milestone.name}</p>
                <p className="mt-0.5 text-[9px] text-text-muted">{projectMap.get(milestone.projectId)?.name ?? "Project"}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

function ProjectActivityPanel({ items, projectMap, userMap }: { items: ProjectActivity[]; projectMap: Map<string, Project>; userMap: Map<string, UserDto> }) {
  return (
    <Panel icon={<Activity size={17} className="text-primary" />} title="Project Activity">
      <div className="px-4">
        {items.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-text-muted">No recent activity.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-text-secondary">
                {activityIcon(item.action)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] text-text-secondary">
                  <span className="font-semibold text-text">{getUserDisplayName(userMap.get(item.actorId))}</span>{" "}
                  {describeActivity(item)}{" "}
                  {projectMap.get(item.projectId) ? (
                    <span className="font-medium text-text">in {projectMap.get(item.projectId)!.name}</span>
                  ) : null}
                </p>
              </div>
              <span className="shrink-0 text-[9px] text-text-muted">{timeAgo(item.createdAt)}</span>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}

/* =========================================================
   STAT CARD
========================================================= */

function StatCard({ icon, iconClass, value, label }: { icon: React.ReactNode; iconClass: string; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconClass)}>{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[18px] font-semibold text-text">{value}</p>
        <p className="text-[10px] text-text-muted">{label}</p>
      </div>
      <ChevronRight size={16} className="text-text-muted" />
    </div>
  );
}

/* =========================================================
   DIALOGS
========================================================= */

const selectCls = "h-9 w-full rounded-lg border border-border bg-surface px-3 text-[11px] text-text outline-none focus:border-primary/50";
const labelCls = "text-[10px] font-medium text-text-secondary";

function ReportBugDialog({ open, onOpenChange, projects }: { open: boolean; onOpenChange: (o: boolean) => void; projects: Project[] }) {
  const createTask = useCreateTask();
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("high");
  const [description, setDescription] = useState("");

  function submit() {
    if (!projectId || !title.trim()) return;
    // The "Bug: " prefix keeps the task in the Bug column/bucket even when the
    // chosen severity isn't high/critical.
    const bugTitle = /^bug/i.test(title.trim()) ? title.trim() : `Bug: ${title.trim()}`;
    createTask.mutate(
      { projectId, title: bugTitle, description: description.trim() || undefined, priority, status: "todo" },
      {
        onSuccess: () => {
          toast.success("Bug reported.");
          setTitle("");
          setDescription("");
          onOpenChange(false);
        },
        onError: (err) => toastError(err, "Failed to report bug"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report a bug</DialogTitle>
          <DialogDescription>File a bug against one of your projects. It is tracked as a task.</DialogDescription>
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
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What broke?" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Severity</span>
            <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="urgent">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Description</span>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Steps to reproduce, expected vs actual…"
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-[11px] text-text outline-none focus:border-primary/50"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createTask.isPending || !projectId || !title.trim()}>Report Bug</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Internal tickets can only be routed to these system roles (enforced server-side too). */
const TICKET_ASSIGNEE_ROLE_NAMES = ["owner", "org_admin", "hr_admin", "hr_manager"];

function RequestJoinDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const organisationId = useUIStore((s) => s.organisationId) ?? undefined;
  const { data: roles } = useRoles(organisationId);
  const createTicket = useCreateTicket();
  const assignableRoles = (roles ?? []).filter((r) => TICKET_ASSIGNEE_ROLE_NAMES.includes(r.name));
  const [projectName, setProjectName] = useState("");
  const [note, setNote] = useState("");
  const [roleId, setRoleId] = useState("");

  function submit() {
    if (!organisationId || !projectName.trim() || !roleId) return;
    createTicket.mutate(
      {
        organisationId,
        subject: `Request to join project: ${projectName.trim()}`,
        description: note.trim() || `I'd like to be added to the "${projectName.trim()}" project.`,
        category: "project-access",
        priority: "medium",
        assigneeRoleId: roleId,
      },
      {
        onSuccess: () => {
          toast.success("Request sent to your organisation admins.");
          setProjectName("");
          setNote("");
          onOpenChange(false);
        },
        onError: (err) => toastError(err, "Failed to send request"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request to join a project</DialogTitle>
          <DialogDescription>Project membership is managed by admins — this raises a request ticket to them.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Project name *</span>
            <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Website Redesign" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Send to *</span>
            <select className={selectCls} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Select a role</option>
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.description || r.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Note</span>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why do you want to join?"
              className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-[11px] text-text outline-none focus:border-primary/50"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={createTicket.isPending || !projectName.trim() || !roleId}>Send Request</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================
   TAB PANELS
========================================================= */

function MilestonesTab({ milestones, projectMap }: { milestones: Milestone[]; projectMap: Map<string, Project> }) {
  if (milestones.length === 0) {
    return <EmptyTab icon={<Flag size={28} />} title="Milestones" description="Project milestones will appear here once they are created." />;
  }
  return (
    <div className="px-2 py-2">
      {milestones.map((milestone, index) => (
        <div key={milestone.id} className="relative grid grid-cols-[110px_20px_1fr] gap-2 py-2.5">
          {index !== milestones.length - 1 && <div className="absolute left-[118px] top-7 h-10 w-px bg-border" />}
          <p className="text-[11px] text-text-secondary">{formatDate(milestone.dueDate)}</p>
          <div className="relative z-10 flex justify-center">
            <span className={cn("mt-1 h-2.5 w-2.5 rounded-full", milestone.status === "completed" ? "bg-success" : "bg-primary")} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-medium text-text">{milestone.name}</p>
            <p className="mt-0.5 text-[10px] text-text-muted">
              {projectMap.get(milestone.projectId)?.name ?? "Project"} · {milestone.status.replace("_", " ")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineTab({
  projects,
  tasksByProject,
  userMap,
  onOpenProject,
}: {
  projects: Project[];
  tasksByProject: Map<string, Task[]>;
  userMap: Map<string, UserDto>;
  onOpenProject: (projectId: string) => void;
}) {
  const withWork = projects.filter(
    (p) => (tasksByProject.get(p.id)?.length ?? 0) > 0 || p.startDate || p.targetDate,
  );
  if (withWork.length === 0) {
    return <EmptyTab icon={<Flag size={28} />} title="Timelines" description="Project timelines will appear here once your projects have scheduled tasks." />;
  }
  return (
    <div className="flex flex-col gap-4">
      {withWork.map((project) => {
        const tasks = tasksByProject.get(project.id) ?? [];
        const progress = taskProgress(tasks);
        return (
          <div key={project.id} className="overflow-hidden rounded-xl border border-border">
            <button
              type="button"
              onClick={() => onOpenProject(project.id)}
              className="flex w-full items-center justify-between gap-3 border-b border-border bg-surface px-4 py-2.5 text-left transition hover:bg-surface-elevated"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="truncate text-[13px] font-semibold text-text">{project.name}</span>
                <span className={cn("rounded-md border px-2 py-0.5 text-[9px] font-medium", statusClasses(displayStatus(project)))}>
                  {displayStatus(project)}
                </span>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-[10px] text-text-muted">
                {tasks.length} tasks · {progress}%
                <ChevronRight size={14} />
              </span>
            </button>
            <Gantt project={project} tasks={tasks} userMap={userMap} compact onSelect={() => onOpenProject(project.id)} />
          </div>
        );
      })}
    </div>
  );
}

function ProjectFilesTab({ files, projectMap }: { files: FileRecord[]; projectMap: Map<string, Project> }) {
  const [downloading, setDownloading] = useState<string | null>(null);

  async function handleDownload(file: FileRecord) {
    setDownloading(file.id);
    try {
      const blob = await downloadFile(file.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toastError(err, "Couldn't download file");
    } finally {
      setDownloading(null);
    }
  }

  if (files.length === 0) {
    return <EmptyTab icon={<FileText size={28} />} title="Project Files" description="Files shared in your projects will appear here." />;
  }
  return (
    <div className="divide-y divide-border">
      {files.map((file) => (
        <div key={file.id} className="flex items-center gap-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FileText size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium text-text">{file.originalName}</p>
            <p className="text-[10px] text-text-muted">
              {(file.resourceId && projectMap.get(file.resourceId)?.name) || "Project"} · {formatBytes(file.size)} · {timeAgo(file.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleDownload(file)}
            disabled={downloading === file.id}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
            aria-label={`Download ${file.originalName}`}
          >
            <Download size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

function EmptyTab({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-4 text-[15px] font-semibold text-text">{title}</h3>
      <p className="mt-2 max-w-sm text-[11px] leading-5 text-text-muted">{description}</p>
    </div>
  );
}

/* =========================================================
   MAIN SCREEN
========================================================= */

const TABS: { key: Tab; label: string }[] = [
  { key: "projects", label: "My Projects" },
  { key: "tasks", label: "My Tasks" },
  { key: "timeline", label: "Timelines" },
  { key: "milestones", label: "Milestones" },
  { key: "files", label: "Project Files" },
];

export function MyProjectsScreen() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { can, canAny } = usePermissions();
  const { data: me } = useMe();
  const { data: projects, isLoading, isError, refetch } = useProjects();
  const organisationId = getActiveOrganisation() ?? undefined;
  const { data: members } = useMembers(organisationId);
  const { data: workspaces } = useWorkspaces(organisationId);
  const { data: clients } = useClients(organisationId);
  const projectList = useMemo(() => projects ?? [], [projects]);
  const projectMap = useMemo(() => new Map(projectList.map((p) => [p.id, p])), [projectList]);
  const projectIds = useMemo(() => projectList.map((p) => p.id), [projectList]);

  // Per-project task + activity fetches (member scope keeps this list small).
  const taskQueries = useQueries({
    queries: projectIds.map((id) => ({
      queryKey: ["tasks", id],
      queryFn: () => getTasks(id),
      staleTime: 60 * 1000,
    })),
  });
  const activityQueries = useQueries({
    queries: projectIds.map((id) => ({
      queryKey: ["project-activity-page", id],
      queryFn: () => getProjectActivity(id),
      staleTime: 60 * 1000,
    })),
  });
  const milestoneQueries = useQueries({
    queries: projectIds.map((id) => ({
      queryKey: ["milestones", id],
      queryFn: () => getMilestones(id),
      staleTime: 60 * 1000,
    })),
  });

  const tasksByProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    projectIds.forEach((id, i) => map.set(id, taskQueries[i]?.data ?? []));
    return map;
  }, [projectIds, taskQueries]);

  const allTasks = useMemo(() => [...tasksByProject.values()].flat(), [tasksByProject]);

  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const weekEnd = useMemo(() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); return d; }, [weekStart]);
  const { data: weekEntries } = useTimeEntries({ from: weekStart.toISOString(), to: weekEnd.toISOString() });
  const { data: projectFiles } = useProjectFiles();

  const [tab, setTab] = useState<Tab>("projects");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // The role sidebar deep-links here via the store (e.g. "My Tasks" → tasks).
  const projectsTab = useUIStore((s) => s.projectsTab);
  const setProjectsTab = useUIStore((s) => s.setProjectsTab);
  useEffect(() => {
    if (projectsTab && TABS.some((t) => t.key === projectsTab)) {
      setTab(projectsTab as Tab);
    }
  }, [projectsTab]);

  const canReportBug = can("collaboration.task.create");
  const canEditTask = can("collaboration.task.edit");
  const canRequestJoin = canAny(["collaboration.ticket.create"]);
  const canCreateProject = can("collaboration.project.create");

  const myTasks = useMemo(
    () => allTasks.filter((t) => t.assigneeId === me?.id)
      .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
    [allTasks, me?.id],
  );
  const myOpenTaskCount = useMemo(() => myTasks.filter((t) => t.status !== "done").length, [myTasks]);
  const bugTasks = useMemo(
    () => allTasks.filter(isBugTask).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [allTasks],
  );
  const milestones = useMemo(
    () => milestoneQueries
      .flatMap((q) => q.data ?? [])
      .filter((m) => m.dueDate && m.status !== "completed" && new Date(m.dueDate).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
      .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()),
    [milestoneQueries],
  );
  const activityItems = useMemo(
    () => activityQueries
      .flatMap((q) => q.data?.items ?? [])
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6),
    [activityQueries],
  );

  // Users referenced by cards, tasks and the activity feed.
  const userIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of projectList) for (const m of p.members ?? []) ids.add(m.userId);
    for (const t of allTasks) if (t.assigneeId) ids.add(t.assigneeId);
    for (const a of activityItems) ids.add(a.actorId);
    return [...ids];
  }, [projectList, allTasks, activityItems]);
  const { data: users } = useUsers(userIds);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const activeCount = projectList.filter((p) => p.status === "active").length;
  const avgProgress = projectList.length
    ? Math.round(projectList.reduce((sum, p) => sum + taskProgress(tasksByProject.get(p.id)), 0) / projectList.length)
    : 0;
  const weekMinutes = (weekEntries ?? []).reduce((s, e) => s + e.minutes, 0);

  const filteredProjects = projectList.filter((project) => {
    const matchesSearch =
      !search ||
      project.name.toLowerCase().includes(search.toLowerCase()) ||
      (project.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "All Statuses" || displayStatus(project) === statusFilter;
    return matchesSearch && matchesStatus;
  });

  function openProject(projectId: string) {
    setActiveView("project", { projectId });
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="My Projects" />
        <div className="mt-6"><SectionSkeleton rows={8} /></div>
      </div>
    );
  }
  if (isError) {
    return (
      <div className="p-4 sm:p-6">
        <PageHeader title="My Projects" />
        <div className="mt-6"><SectionError onRetry={() => refetch()} /></div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-[1500px]">
        {/* Header */}
        <PageHeader title="My Projects">
          {canRequestJoin ? (
            <Button variant="secondary" onClick={() => setJoinDialogOpen(true)} className="h-10">
              <Users size={16} className="mr-1.5" /> Request to Join Project
            </Button>
          ) : null}
          {canCreateProject ? (
            <Button onClick={() => setCreateDialogOpen(true)} className="h-10">
              <Folder size={16} className="mr-1.5" /> New Project
            </Button>
          ) : null}
        </PageHeader>
        <p className="mt-1 text-sm text-text-secondary">
          Your work, your impact. Everything you need to stay aligned and deliver results.
        </p>

        {/* Stats */}
        <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatCard icon={<Folder size={22} />} iconClass="bg-primary/10 text-primary" value={String(activeCount)} label="Active Projects" />
          <StatCard icon={<CheckCircle2 size={22} />} iconClass="bg-success/10 text-success" value={String(myOpenTaskCount)} label="My Open Tasks" />
          <StatCard icon={<Bug size={22} />} iconClass="bg-mention/10 text-mention" value={String(bugTasks.length)} label="Open Bugs" />
          <StatCard icon={<Target size={22} />} iconClass="bg-info/10 text-info" value={`${avgProgress}%`} label="Average Progress" />
          <StatCard icon={<Clock3 size={22} />} iconClass="bg-warning/10 text-warning" value={formatMinutes(weekMinutes)} label="Logged This Week" />
        </section>

        {/* Tabs + filters */}
        <section className="mt-4 rounded-xl border border-border bg-surface">
          <div className="flex flex-col gap-3 border-b border-border px-4 pt-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex overflow-x-auto">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setTab(t.key); setProjectsTab(t.key); }}
                  className={cn(
                    "relative whitespace-nowrap px-4 py-4 text-[11px] font-medium",
                    tab === t.key ? "text-primary" : "text-text-secondary hover:text-text",
                  )}
                >
                  {t.label}
                  {tab === t.key && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-primary" />}
                </button>
              ))}
            </div>

            {tab === "projects" ? (
              <div className="flex flex-wrap items-center gap-2 pb-2 lg:pb-0">
                <div className="relative">
                  <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-9 appearance-none rounded-lg border border-border bg-surface pl-9 pr-8 text-[10px] text-text-secondary outline-none focus:border-primary/50"
                  >
                    <option>All Statuses</option>
                    <option>On Track</option>
                    <option>At Risk</option>
                    <option>On Hold</option>
                    <option>Completed</option>
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted" />
                </div>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search projects..."
                    className="h-9 w-[220px] rounded-lg border border-border bg-surface pl-9 pr-3 text-[10px] text-text outline-none placeholder:text-text-muted focus:border-primary/50"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={cn("flex h-9 w-10 items-center justify-center rounded-lg border", view === "list" ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-text-muted")}
                  aria-label="List view"
                >
                  <List size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setView("grid")}
                  className={cn("flex h-9 w-10 items-center justify-center rounded-lg border", view === "grid" ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-text-muted")}
                  aria-label="Grid view"
                >
                  <Grid2X2 size={16} />
                </button>
              </div>
            ) : null}
          </div>

          <div className="p-4">
            {tab === "projects" && (
              <>
                {view === "grid" ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filteredProjects.map((project) => (
                      <ProjectCard key={project.id} project={project} tasks={tasksByProject.get(project.id)} userMap={userMap} onOpen={() => openProject(project.id)} />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredProjects.map((project) => {
                      const theme = themeFor(project.id);
                      const status = displayStatus(project);
                      const progress = taskProgress(tasksByProject.get(project.id));
                      const Icon = theme.icon;
                      return (
                        <div
                          key={project.id}
                          onClick={() => openProject(project.id)}
                          className="flex cursor-pointer flex-col gap-4 rounded-xl border border-border p-4 transition hover:border-primary/30 md:flex-row md:items-center"
                        >
                          <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-xl", theme.iconClass)}>
                            <Icon size={22} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <h3 className="text-[13px] font-semibold text-text">{project.name}</h3>
                              <span className={cn("rounded-md border px-2 py-1 text-[9px] font-medium", statusClasses(status))}>{status}</span>
                            </div>
                            <p className="mt-1 text-[11px] text-text-muted">{project.description || "No description yet."}</p>
                          </div>
                          <div className="w-full md:w-40">
                            <div className="flex justify-between text-[10px] text-text-secondary">
                              <span>Progress</span>
                              <span>{progress}%</span>
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-surface-elevated">
                              <div className={cn("h-full rounded-full", progressBarClass(status))} style={{ width: `${progress}%` }} />
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-text-muted" />
                        </div>
                      );
                    })}
                  </div>
                )}
                {filteredProjects.length === 0 && (
                  <div className="flex min-h-[180px] items-center justify-center text-sm text-text-muted">
                    {projectList.length === 0 ? "You're not a member of any projects yet." : "No projects found."}
                  </div>
                )}
              </>
            )}

            {tab === "tasks" && (
              <MyTasksBoard
                tasks={myTasks}
                projects={projectList}
                projectMap={projectMap}
                userMap={userMap}
                meId={me?.id}
                canEdit={canEditTask}
                canCreate={canReportBug}
                onOpenProject={openProject}
              />
            )}
            {tab === "timeline" && (
              <TimelineTab
                projects={projectList}
                tasksByProject={tasksByProject}
                userMap={userMap}
                onOpenProject={openProject}
              />
            )}
            {tab === "milestones" && <MilestonesTab milestones={milestones} projectMap={projectMap} />}
            {tab === "files" && <ProjectFilesTab files={projectFiles ?? []} projectMap={projectMap} />}
          </div>
        </section>

        {/* Lower panels */}
        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <RecentBugReports bugs={bugTasks.slice(0, 5)} projectMap={projectMap} userMap={userMap} onReport={canReportBug ? () => setBugDialogOpen(true) : undefined} />
          <UpcomingMilestonesPanel milestones={milestones.slice(0, 4)} projectMap={projectMap} onViewAll={() => { setTab("milestones"); setProjectsTab("milestones"); }} />
          <ProjectActivityPanel items={activityItems} projectMap={projectMap} userMap={userMap} />
        </section>
      </div>

      <ReportBugDialog open={bugDialogOpen} onOpenChange={setBugDialogOpen} projects={projectList} />
      <RequestJoinDialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen} />
      <ProjectDialog
        mode="create"
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        members={members ?? []}
        userMap={userMap}
        workspaces={workspaces ?? []}
        clients={clients ?? []}
      />
    </div>
  );
}
