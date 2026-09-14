import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDot, Copy, Download, ExternalLink, FileText, Filter, Folder, ListTodo, Paperclip, Plus, Send, Settings, Trash2, Users, X, ZoomIn, ZoomOut } from "lucide-react";
import { useUIStore } from "../stores/ui";
import {
  useAddProjectAttachment,
  useAddTaskAttachment,
  useApprovals,
  useClients,
  useCreateApproval,
  useCreateProject,
  useCreateProjectComment,
  useCreateTask,
  useDeleteProject,
  useDeleteProjectComment,
  useDeleteTask,
  useFile,
  useFiles,
  useMe,
  useMembers,
  useProjectActivity,
  useProjectAttachments,
  useProjectComments,
  useProjects,
  useRemoveProjectAttachment,
  useRemoveTaskAttachment,
  useResolveApproval,
  useTaskAttachments,
  useTasks,
  useUpdateProject,
  useUpdateProjectComment,
  useUpdateTask,
  useUploadFile,
  useUsers,
  useWorkspaces,
} from "../hooks/api";
import { downloadFile, fetchFilePreview, getActiveOrganisation, type FileRecord, type Project, type ProjectActivity, type ProjectComment, type Task, type UserDto } from "../lib/api";
import { Card } from "@teamspace-one/ui/card";
import { Badge } from "@teamspace-one/ui/badge";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@teamspace-one/ui/dialog";
import { MessageAttachment } from "../components/ui/message-attachment";
import { UserAvatar } from "../components/user-avatar";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasPermission } from "@teamspace-one/authorization";
import { cn, getUserDisplayName } from "../lib/utils";

function useCan(permission: string) {
  const { user } = usePermissionContext();
  return user ? hasPermission(user, permission) : false;
}

const tabs = ["overview", "board", "list", "timeline", "files", "discussions", "approvals", "activity"] as const;
const statuses = ["backlog", "todo", "in_progress", "in_review", "blocked", "done"];
const priorities = ["low", "medium", "high", "urgent"];
const labels: Record<string, string> = { backlog: "Backlog", todo: "Todo", in_progress: "In Progress", in_review: "In Review", blocked: "Blocked", done: "Done" };
const selectClass = "h-9 w-full rounded-md border bg-surface px-3 text-sm text-text";

function isExternalMember(roleName: string) {
  return roleName.toLowerCase().includes("client") || roleName.toLowerCase().includes("external");
}

export function ProjectScreen() {
  const activeProjectId = useUIStore((state) => state.activeProjectId);
  const organisationId = getActiveOrganisation() ?? undefined;
  const { data: user } = useMe();
  const { data: projects } = useProjects();
  const { data: members } = useMembers(organisationId);
  const { data: clients } = useClients(organisationId);
  const { data: workspaces } = useWorkspaces(organisationId);
  const project = projects?.find((item) => item.id === activeProjectId) ?? projects?.[0];
  const { data: tasks } = useTasks(project?.id);
  const memberUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of members ?? []) ids.add(m.userId);
    for (const m of project?.members ?? []) ids.add(m.userId);
    for (const t of tasks ?? []) if (t.assigneeId) ids.add(t.assigneeId);
    return [...ids];
  }, [members, project?.members, tasks]);
  const { data: users } = useUsers(memberUserIds);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const [tab, setTab] = useState<(typeof tabs)[number]>("board");
  const [newTask, setNewTask] = useState<Record<string, string>>({});
  const [projectDialog, setProjectDialog] = useState<"create" | "settings" | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const canCreateProject = useCan("collaboration.project.create");
  const canManageProject = useCan("collaboration.project.manage");
  const canDeleteProject = useCan("collaboration.project.delete");
  const canCreateTask = useCan("collaboration.task.create");
  const canEditTask = useCan("collaboration.task.edit");

  const grouped = useMemo(() => Object.fromEntries(statuses.map((status) => [status, (tasks ?? []).filter((task) => task.status === status)])), [tasks]);

  function dropTask(status: string) {
    if (!dragTaskId || !project || !canEditTask) return;
    const task = (tasks ?? []).find((item) => item.id === dragTaskId);
    setDragTaskId(null);
    setDragOverStatus(null);
    if (!task || task.status === status) return;
    updateTask.mutate({ taskId: task.id, projectId: project.id, body: { status, position: grouped[status]?.length ?? 0 } });
  }

  const projectClient = project?.clientId ? clients?.find((client) => client.id === project.clientId) : undefined;

  function addTask(status: string) {
    const title = newTask[status]?.trim();
    if (!title || !project) return;
    createTask.mutate({ projectId: project.id, title, status, position: grouped[status]?.length ?? 0 });
    setNewTask((current) => ({ ...current, [status]: "" }));
  }

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-text-muted">
        <Folder className="h-10 w-10" />
        <p>No projects yet.</p>
        {canCreateProject ? (
          <Button onClick={() => setProjectDialog("create")}><Plus className="mr-1 h-4 w-4" />Create project</Button>
        ) : (
          <p className="text-xs">You don&apos;t have permission to create projects.</p>
        )}
        <ProjectDialog mode="create" open={projectDialog === "create"} onOpenChange={(open) => setProjectDialog(open ? "create" : null)} members={members ?? []} userMap={userMap} workspaces={workspaces ?? []} clients={clients ?? []} />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <header className="border-b px-3 sm:px-6 py-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle text-primary"><Folder className="h-5 w-5" /></div>
              <div>
                <h1 className="flex items-center gap-2 text-lg font-semibold text-text">
                  {project.name}
                  {project.clientId ? (
                    <Badge variant="warning" className="gap-1">
                      <ExternalLink className="h-3 w-3" />
                      Client{projectClient ? `: ${projectClient.name}` : " project"}
                    </Badge>
                  ) : null}
                </h1>
                <p className="text-xs text-text-muted capitalize">{project.status.replace("_", " ")}{project.description ? ` · ${project.description}` : ""}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">{project.members.slice(0, 4).map((member) => <Avatar key={member.id} className="h-7 w-7 border-2 border-surface"><AvatarFallback className="text-[10px]">{getInitials(member, userMap.get(member.userId))}</AvatarFallback></Avatar>)}</div>
              {project.ownerId === user?.id && (canManageProject || canDeleteProject) ? <Button variant="ghost" size="icon" onClick={() => setProjectDialog("settings")}><Settings className="h-4 w-4" /></Button> : null}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-1 overflow-x-auto">{tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors", tab === item ? "bg-primary-subtle text-primary" : "text-text-secondary hover:bg-surface-elevated hover:text-text")}>{item}</button>)}</div>
            {canCreateTask ? <Button size="sm" onClick={() => setCreateTaskOpen(true)}><Plus className="mr-1.5 h-4 w-4" />New task</Button> : null}
          </div>
          {project.clientId ? (
            <div className="mt-3 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              This project is shared with an external client workspace{projectClient ? ` (${projectClient.name})` : ""}. Internal-only channels, tasks, and files stay hidden from client members.
            </div>
          ) : null}
        </header>

        {tab === "overview" ? <ProjectOverview tasks={tasks} project={project} /> : null}
        {tab === "board" ? (
          <div className="flex flex-1 gap-3 overflow-x-auto p-4">{statuses.map((status) => (
            <div
              key={status}
              className={cn("flex w-64 shrink-0 flex-col rounded-lg border bg-surface-elevated/50 transition-colors", dragOverStatus === status && dragTaskId && "border-primary bg-primary-subtle/40")}
              onDragOver={(event) => {
                if (!dragTaskId) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (dragOverStatus !== status) setDragOverStatus(status);
              }}
              onDragLeave={() => { if (dragOverStatus === status) setDragOverStatus(null); }}
              onDrop={(event) => { event.preventDefault(); dropTask(status); }}
            >
              <div className="flex items-center justify-between px-3 py-2"><span className="text-xs font-semibold text-text">{labels[status]}</span><span className="text-xs text-text-muted">{grouped[status]?.length ?? 0}</span></div>
              <div className="flex-1 space-y-2 p-2">{grouped[status]?.map((task) => <TaskCard key={task.id} task={task} userMap={userMap} dragging={dragTaskId === task.id} draggable={canEditTask} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); setDragTaskId(task.id); }} onDragEnd={() => { setDragTaskId(null); setDragOverStatus(null); }} onClick={() => setSelectedTask(task)} />)}{!grouped[status]?.length ? <div className="rounded-md border border-dashed py-6 text-center text-xs text-text-muted">Drop tasks here</div> : null}</div>
              {status === "todo" && canCreateTask ? (
                <div className="m-2 space-y-1"><Input placeholder="Add task…" value={newTask[status] ?? ""} onChange={(event) => setNewTask((current) => ({ ...current, [status]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addTask(status); }} className="h-7 text-xs" /><button type="button" onClick={() => addTask(status)} className="flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-text-muted hover:bg-surface-elevated hover:text-text"><Plus className="h-3.5 w-3.5" />Add task</button></div>
              ) : null}
            </div>
          ))}</div>
        ) : null}
        {tab === "list" ? <TaskList tasks={tasks ?? []} onSelect={setSelectedTask} /> : null}
        {tab === "timeline" ? <Gantt project={project} tasks={tasks ?? []} userMap={userMap} onSelect={setSelectedTask} /> : null}
        {tab === "files" ? <ProjectFiles projectId={project.id} /> : null}
        {tab === "discussions" ? <ProjectDiscussions projectId={project.id} userMap={userMap} /> : null}
        {tab === "approvals" ? <ProjectApprovals projectId={project.id} tasks={tasks ?? []} userMap={userMap} /> : null}
        {tab === "activity" ? <ProjectActivityView projectId={project.id} /> : null}
      </div>
      <ProjectDialog mode="settings" project={project} open={projectDialog === "settings"} onOpenChange={(open) => setProjectDialog(open ? "settings" : null)} members={members ?? []} userMap={userMap} workspaces={workspaces ?? []} clients={clients ?? []} />
      <TaskDialog task={selectedTask} members={members ?? []} userMap={userMap} open={Boolean(selectedTask)} onOpenChange={(open) => { if (!open) setSelectedTask(null); }} onSave={(body) => updateTask.mutate({ taskId: selectedTask!.id, projectId: project.id, body }, { onSuccess: () => setSelectedTask(null) })} />
      <CreateTaskDialog projectId={project.id} members={members ?? []} userMap={userMap} open={createTaskOpen} onOpenChange={setCreateTaskOpen} />
    </>
  );
}

function TaskCard({ task, userMap, onClick, dragging, draggable, onDragStart, onDragEnd }: { task: Task; userMap: Map<string, UserDto>; onClick: () => void; dragging?: boolean; draggable?: boolean; onDragStart?: (event: React.DragEvent) => void; onDragEnd?: () => void }) {
  return (
    <Card
      className={cn("cursor-pointer p-3 hover:border-primary/30", dragging && "opacity-40")}
      onClick={onClick}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === "Enter") onClick(); }}
    >
      <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-text">{task.title}</p><span className={cn("h-2 w-2 shrink-0 rounded-full", task.priority === "urgent" ? "bg-error" : task.priority === "high" ? "bg-warning" : "bg-primary")} /></div>
      <div className="mt-2 flex items-center justify-between"><span className="text-xs text-text-muted">{task.assigneeId ? getUserDisplayName(userMap.get(task.assigneeId)) : "Unassigned"}</span>{task.dueDate ? <span className="text-xs text-text-muted">{new Date(task.dueDate).toLocaleDateString()}</span> : null}</div>
    </Card>
  );
}

function TaskList({ tasks, onSelect }: { tasks: Task[]; onSelect: (task: Task) => void }) {
  return <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6"><div className="overflow-x-auto rounded-lg border">{tasks.map((task) => <button key={task.id} type="button" onClick={() => onSelect(task)} className="grid w-full min-w-[640px] grid-cols-[1fr_140px_100px_120px] gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-surface-elevated"><span>{task.title}</span><span className="capitalize text-text-muted">{labels[task.status]}</span><span className="capitalize text-text-muted">{task.priority}</span><span className="text-text-muted">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No due date"}</span></button>)}{!tasks.length ? <p className="p-8 text-center text-sm text-text-muted">No tasks yet.</p> : null}</div></div>;
}

function ProjectDialog({ mode, project, open, onOpenChange, members, userMap, workspaces, clients }: { mode: "create" | "settings"; project?: Project; open: boolean; onOpenChange: (open: boolean) => void; members: { userId: string; role: { name: string } }[]; userMap: Map<string, UserDto>; workspaces: { id: string; name: string }[]; clients: { id: string; name: string }[] }) {
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const canCreateProject = useCan("collaboration.project.create");
  const canManageProject = useCan("collaboration.project.manage");
  const canDeleteProject = useCan("collaboration.project.delete");
  const canSubmit = mode === "create" ? canCreateProject : canManageProject;
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [workspaceId, setWorkspaceId] = useState(project?.workspaceId ?? "");
  const [clientId, setClientId] = useState(project?.clientId ?? "");
  const [status, setStatus] = useState(project?.status ?? "active");
  const [startDate, setStartDate] = useState(project?.startDate?.slice(0, 10) ?? "");
  const [targetDate, setTargetDate] = useState(project?.targetDate?.slice(0, 10) ?? "");
  const [memberIds, setMemberIds] = useState(project?.members.map((member) => member.userId) ?? []);

  function submit() {
    const body = { name: name.trim(), description: description.trim() || undefined, clientId: clientId || undefined, startDate: startDate || undefined, targetDate: targetDate || undefined, memberIds };
    if (mode === "create") createProject.mutate({ ...body, workspaceId: workspaceId || undefined }, { onSuccess: (created) => { useUIStore.getState().setActiveView("project", { projectId: created.id }); onOpenChange(false); } });
    else if (project) updateProject.mutate({ projectId: project.id, body: { ...body, clientId: clientId || null, status } }, { onSuccess: () => onOpenChange(false) });
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg p-0 sm:top-[55%]"><DialogHeader><DialogTitle>{mode === "create" ? "Create project" : "Project settings"}</DialogTitle><DialogDescription>Configure project ownership, schedule, and access.</DialogDescription></DialogHeader><div className="space-y-3 px-4 pb-4"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" /><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />{mode === "create" ? <select className={selectClass} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="">No workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select> : <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select>}<select className={selectClass} value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">No client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="text-xs text-text-muted">Start date<Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="text-xs text-text-muted">Target date<Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label></div><div className="max-h-36 overflow-y-auto rounded-md border p-2">{members.map((member) => <label key={member.userId} className="flex items-center gap-2 px-2 py-1 text-sm"><input type="checkbox" checked={memberIds.includes(member.userId)} disabled={member.userId === project?.ownerId} onChange={() => setMemberIds((ids) => ids.includes(member.userId) ? ids.filter((id) => id !== member.userId) : [...ids, member.userId])} /><span className="flex-1 truncate">{getUserDisplayName(userMap.get(member.userId))}</span>{isExternalMember(member.role.name) ? <Badge variant="warning">External</Badge> : <span className="text-xs text-text-muted">{member.role.name}</span>}</label>)}</div><div className="flex justify-between">{mode === "settings" && canDeleteProject ? <Button variant="ghost" className="text-error" onClick={() => project && deleteProject.mutate(project.id, { onSuccess: () => { onOpenChange(false); useUIStore.getState().setActiveView("home"); } })}>Delete project</Button> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!canSubmit || !name.trim() || createProject.isPending || updateProject.isPending} onClick={submit}>Save</Button></div></div></div></DialogContent></Dialog>;
}

function TaskDialog({ task, members, userMap, open, onOpenChange, onSave }: { task: Task | null; members: { userId: string; role?: { name: string } }[]; userMap: Map<string, UserDto>; open: boolean; onOpenChange: (open: boolean) => void; onSave: (body: Parameters<ReturnType<typeof useUpdateTask>["mutate"]>[0]["body"]) => void }) {
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const canCreateTask = useCan("collaboration.task.create");
  const canEditTask = useCan("collaboration.task.edit");
  const canDeleteTask = useCan("collaboration.task.delete");
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState(task?.status ?? "todo");
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? "");
  const [startDate, setStartDate] = useState(task?.startDate?.slice(0, 10) ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? "");
  const [copied, setCopied] = useState(false);
  const { data: activity } = useProjectActivity(task?.projectId);
  const actorMap = useActorMap(activity);
  const taskActivity = useMemo(
    () => (activity ?? []).filter((item) => item.resourceId === task?.id).slice(0, 8),
    [activity, task?.id],
  );
  useEffect(() => {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setStatus(task?.status ?? "todo");
    setPriority(task?.priority ?? "medium");
    setAssigneeId(task?.assigneeId ?? "");
    setStartDate(task?.startDate?.slice(0, 10) ?? "");
    setDueDate(task?.dueDate?.slice(0, 10) ?? "");
    setCopied(false);
  }, [task]);
  if (!task) return null;

  const isDone = status === "done";

  function duplicate() {
    if (!task) return;
    createTask.mutate(
      { projectId: task.projectId, title: `${title.trim() || task.title} (copy)`, description: description.trim() || undefined, assigneeId: assigneeId || undefined, priority, startDate: startDate || undefined, dueDate: dueDate || undefined, status },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  function copyLink() {
    void navigator.clipboard.writeText(`teamspace-one://project/${task!.projectId}/task/${task!.id}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <DialogHeader>
          <DialogTitle>Task details</DialogTitle>
          <DialogDescription>Update task details, workflow state, and linked activity.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 pb-4">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Task title" />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add a description…"
            rows={4}
            className="w-full resize-y rounded-md border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted focus-visible:ring-1 focus-visible:ring-primary"
          />
          <TaskAttachments task={task} />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-text-muted">Status
              <select className={cn(selectClass, "mt-1")} value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select>
            </label>
            <label className="text-xs text-text-muted">Priority
              <select className={cn(selectClass, "mt-1 capitalize")} value={priority} onChange={(event) => setPriority(event.target.value)}>{priorities.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="text-xs text-text-muted">Assignee
              <select className={cn(selectClass, "mt-1")} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{getUserDisplayName(userMap.get(member.userId))}{member.role && isExternalMember(member.role.name) ? " (external)" : ""}</option>)}</select>
            </label>
            <label className="text-xs text-text-muted">Start date
              <Input type="date" className="mt-1" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="text-xs text-text-muted">Due date
              <Input type="date" className="mt-1" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
          </div>
          {taskActivity.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium text-text-muted">Activity</p>
              <div className="space-y-1 rounded-md border p-2">
                {taskActivity.map((item) => {
                  const actor = actorMap.get(item.actorId);
                  const name = getActorLabel(actor, item.actorId);
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-text-secondary">{item.action.replace(/[._]/g, " ")} by {name}</span>
                      <span className="text-text-muted">{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              {canEditTask ? (
                <Button variant="ghost" size="sm" onClick={() => onSave({ status: isDone ? "todo" : "done" })}>
                  <CheckCircle2 className={cn("mr-1 h-4 w-4", isDone ? "text-success" : undefined)} />
                  {isDone ? "Reopen" : "Mark complete"}
                </Button>
              ) : null}
              {canCreateTask ? <Button variant="ghost" size="sm" onClick={duplicate} disabled={createTask.isPending}>Duplicate</Button> : null}
              <Button variant="ghost" size="sm" onClick={copyLink}>
                <Copy className="mr-1 h-4 w-4" />
                {copied ? "Copied" : "Copy link"}
              </Button>
              {canDeleteTask ? (
                <Button variant="ghost" size="sm" className="text-error" onClick={() => deleteTask.mutate({ taskId: task.id, projectId: task.projectId }, { onSuccess: () => onOpenChange(false) })}>
                  <Trash2 className="mr-1 h-4 w-4" />Delete
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!canEditTask} onClick={() => onSave({ title: title.trim(), description: description.trim() || null, status, priority, assigneeId: assigneeId || null, startDate: startDate || null, dueDate: dueDate || null })}>Save</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useAttachmentObjectUrl(file: FileRecord | undefined, kind: "image" | "video" | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file || !kind) {
      setUrl(null);
      setLoading(false);
      return;
    }
    let objectUrl: string | null = null;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        return kind === "image" ? await fetchFilePreview(file.id, "preview") : await downloadFile(file.id);
      } catch {
        return downloadFile(file.id);
      }
    })()
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, kind]);

  return { url, loading };
}

function TaskAttachmentItem({ fileId, onRemove }: { fileId: string; onRemove: () => void }) {
  const { data: file } = useFile(fileId);
  const kind = file?.mimeType.startsWith("image/") ? "image" : file?.mimeType.startsWith("video/") ? "video" : null;
  const { url, loading } = useAttachmentObjectUrl(file, kind);

  const removeButton = (
    <Button variant="secondary" size="icon" className="absolute right-1.5 top-1.5 h-6 w-6" onClick={onRemove} aria-label="Remove attachment">
      <X className="h-3.5 w-3.5" />
    </Button>
  );

  if (kind === "image" || kind === "video") {
    return (
      <div className="relative">
        {loading ? (
          <div className="h-32 animate-pulse rounded-md bg-surface-elevated" />
        ) : url ? (
          kind === "image" ? (
            <img src={url} alt={file?.originalName ?? "attachment"} className="max-h-56 w-full rounded-md border object-contain" />
          ) : (
            <video src={url} controls className="max-h-56 w-full rounded-md border" />
          )
        ) : (
          <MessageAttachment fileId={fileId} />
        )}
        {removeButton}
      </div>
    );
  }

  return (
    <div className="relative">
      <MessageAttachment fileId={fileId} />
      {removeButton}
    </div>
  );
}

function TaskAttachments({ task }: { task: Task }) {
  const { data: attachments } = useTaskAttachments(task.id);
  const addAttachment = useAddTaskAttachment();
  const removeAttachment = useRemoveTaskAttachment();
  const upload = useUploadFile();
  const { data: files } = useFiles();
  const [pickerOpen, setPickerOpen] = useState(false);
  const attachedIds = new Set((attachments ?? []).map((item) => item.fileId));
  const available = (files ?? []).filter((file) => !attachedIds.has(file.id));

  function attach(fileId: string) {
    addAttachment.mutate({ taskId: task.id, projectId: task.projectId, fileId });
  }

  function uploadAndAttach(file?: File) {
    if (!file) return;
    upload.mutate(
      { file, resource: { resourceType: "project", resourceId: task.projectId } },
      { onSuccess: (record) => attach(record.id) },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-text-muted">Attachments</p>
        <Button variant="ghost" size="sm" asChild>
          <label className="cursor-pointer">
            <Paperclip className="mr-1 h-3.5 w-3.5" />{upload.isPending ? "Uploading…" : "Browse files"}
            <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.txt,.md,.zip" className="hidden" onChange={(event) => { uploadAndAttach(event.target.files?.[0]); event.currentTarget.value = ""; }} />
          </label>
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPickerOpen((open) => !open)}>
          <Folder className="mr-1 h-3.5 w-3.5" />App files
        </Button>
      </div>
      {pickerOpen ? (
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
          {available.map((file) => (
            <button
              key={file.id}
              type="button"
              disabled={addAttachment.isPending}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-surface-elevated disabled:opacity-50"
              onClick={() => { attach(file.id); setPickerOpen(false); }}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              <span className="truncate text-text">{file.originalName}</span>
              <span className="ml-auto shrink-0 text-text-muted">{Math.max(1, Math.round(file.size / 1024))} KB</span>
            </button>
          ))}
          {!available.length ? <p className="px-2 py-3 text-center text-xs text-text-muted">No other files available.</p> : null}
        </div>
      ) : null}
      {attachments?.length ? (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <TaskAttachmentItem
              key={attachment.id}
              fileId={attachment.fileId}
              onRemove={() => removeAttachment.mutate({ taskId: task.id, projectId: task.projectId, fileId: attachment.fileId })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CreateTaskDialog({
  open,
  onOpenChange,
  projectId,
  members,
  userMap,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  members: { userId: string; role?: { name: string } }[];
  userMap: Map<string, UserDto>;
}) {
  const createTask = useCreateTask();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setStatus("todo");
    setPriority("medium");
    setAssigneeId("");
    setStartDate("");
    setDueDate("");
  }, [open]);

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    createTask.mutate(
      {
        projectId,
        title: trimmed,
        description: description.trim() || undefined,
        status,
        priority,
        assigneeId: assigneeId || undefined,
        startDate: startDate || undefined,
        dueDate: dueDate || undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
          <DialogDescription>Create a new task for this project.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-4 pb-4">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Task title" />
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add a description…"
            rows={4}
            className="w-full resize-y rounded-md border bg-surface px-3 py-2 text-sm text-text outline-none placeholder:text-text-muted focus-visible:ring-1 focus-visible:ring-primary"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-text-muted">Status
              <select className={cn(selectClass, "mt-1")} value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select>
            </label>
            <label className="text-xs text-text-muted">Priority
              <select className={cn(selectClass, "mt-1 capitalize")} value={priority} onChange={(event) => setPriority(event.target.value)}>{priorities.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="text-xs text-text-muted">Assignee
              <select className={cn(selectClass, "mt-1")} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{getUserDisplayName(userMap.get(member.userId))}{member.role && isExternalMember(member.role.name) ? " (external)" : ""}</option>)}</select>
            </label>
            <label className="text-xs text-text-muted">Start date
              <Input type="date" className="mt-1" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label className="text-xs text-text-muted">Due date
              <Input type="date" className="mt-1" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!title.trim() || createTask.isPending} onClick={submit}>Create task</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const statusColors: Record<string, string> = {
  backlog: "var(--text-muted)",
  todo: "var(--primary)",
  in_progress: "var(--info)",
  in_review: "var(--warning)",
  blocked: "var(--error)",
  done: "var(--success)",
};

function toLocalDay(value: string) {
  if (!value) return new Date();
  if (value.includes("T")) {
    const d = new Date(value);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const [y, m, day] = value.split("-").map(Number);
  return new Date(y, m - 1, day);
}

function addDays(date: Date, n: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
}

function dayDiff(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/* =========================================================
   GANTT / TIMELINE
========================================================= */

const GANTT_ROW_H = 39;
const GANTT_LEFT_W = 560;
const GANTT_GROUP_ORDER = ["in_progress", "in_review", "todo", "backlog", "blocked", "done"] as const;
const GANTT_STATUS_CHIP: Record<string, string> = {
  done: "bg-success/10 text-success",
  in_progress: "bg-info/10 text-info",
  in_review: "bg-primary/10 text-primary",
  blocked: "bg-error/10 text-error",
  todo: "bg-surface-elevated text-text-secondary",
  backlog: "bg-surface-elevated text-text-muted",
};
const GANTT_VIEW_DAY_WIDTH: Record<string, number> = { Day: 48, Week: 24, Month: 12, Quarter: 5 };

interface GanttRow {
  task: Task;
  start: Date | null;
  end: Date | null;
  /** Single-day deadline — rendered as a diamond instead of a bar. */
  milestone: boolean;
}

function ganttRow(task: Task): GanttRow {
  const start = task.startDate ? toLocalDay(task.startDate) : null;
  const end = task.dueDate ? toLocalDay(task.dueDate) : null;
  if (!start && !end) return { task, start: null, end: null, milestone: false };
  // A due-date-only task is a deadline — draw it as a milestone diamond.
  if (!start && end) return { task, start: end, end, milestone: true };
  const s = start!;
  const e = end && end >= s ? end : addDays(s, 2);
  return { task, start: s, end: e, milestone: s.getTime() === e.getTime() };
}

function GanttStat({ icon, value, label, iconClass }: { icon: React.ReactNode; value: string; label: string; iconClass: string }) {
  return (
    <div className="flex h-[72px] items-center gap-3 rounded-xl border border-border bg-surface px-4 shadow-sm">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconClass)}>{icon}</div>
      <div>
        <div className="text-[17px] font-semibold text-text">{value}</div>
        <div className="mt-0.5 text-[10px] text-text-muted">{label}</div>
      </div>
    </div>
  );
}

function Gantt({ project, tasks, userMap, onSelect }: { project: Project; tasks: Task[]; userMap: Map<string, UserDto>; onSelect?: (task: Task) => void }) {
  const [view, setView] = useState("Month");
  const [dayWidth, setDayWidth] = useState(GANTT_VIEW_DAY_WIDTH.Month);
  const [offset, setOffset] = useState(0);
  const [showFilter, setShowFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => {
    const mapped = tasks.map(ganttRow);
    return mapped.filter((r) => {
      if (statusFilter.length && !statusFilter.includes(r.task.status)) return false;
      if (assigneeFilter && r.task.assigneeId !== assigneeFilter) return false;
      return true;
    });
  }, [tasks, statusFilter, assigneeFilter]);

  const scheduled = rows.filter((r) => r.start && r.end);
  const unscheduled = rows.filter((r) => !r.start || !r.end);

  const { rangeStart, totalDays } = useMemo(() => {
    let start: Date | null = project.startDate ? toLocalDay(project.startDate) : null;
    let end: Date | null = project.targetDate ? toLocalDay(project.targetDate) : null;
    for (const r of scheduled) {
      if (!start || r.start! < start) start = r.start;
      if (!end || r.end! > end) end = r.end;
    }
    const today = toLocalDay(new Date().toISOString());
    if (!start || today < start) start = today;
    if (!end || today > end) end = today;
    // Pad a little on both sides so bars don't touch the edges.
    start = addDays(start, -3);
    end = addDays(end, 7);
    start = addDays(start, offset);
    end = addDays(end, offset);
    return { rangeStart: start, rangeEnd: end, totalDays: Math.max(1, dayDiff(start, end) + 1) };
  }, [scheduled, project.startDate, project.targetDate, offset]);

  const totalWidth = totalDays * dayWidth;
  const todayOffset = dayDiff(rangeStart, toLocalDay(new Date().toISOString()));
  const showToday = todayOffset >= 0 && todayOffset < totalDays;

  const months = useMemo(() => {
    const out: { label: string; start: number; end: number }[] = [];
    let current: { label: string; start: number; end: number } | null = null;
    for (let i = 0; i < totalDays; i++) {
      const label = addDays(rangeStart, i).toLocaleDateString(undefined, { month: "short", year: "numeric" });
      if (!current || current.label !== label) {
        if (current) out.push(current);
        current = { label, start: i, end: i };
      } else {
        current.end = i;
      }
    }
    if (current) out.push(current);
    return out;
  }, [rangeStart, totalDays]);

  const groups = useMemo(() => {
    const out: { status: string; label: string; color: string; rows: GanttRow[] }[] = [];
    for (const status of GANTT_GROUP_ORDER) {
      const items = scheduled.filter((r) => r.task.status === status).sort((a, b) => a.start!.getTime() - b.start!.getTime());
      if (items.length) out.push({ status, label: labels[status] ?? status, color: statusColors[status] ?? "var(--primary)", rows: items });
    }
    if (unscheduled.length) out.push({ status: "unscheduled", label: "Unscheduled", color: "var(--text-muted)", rows: unscheduled });
    return out;
  }, [scheduled, unscheduled]);

  const assignees = useMemo(() => [...new Set(tasks.map((t) => t.assigneeId).filter((id): id is string => Boolean(id)))], [tasks]);

  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  const progress = total ? Math.round((done / total) * 100) : 0;
  const daysLeft = project.targetDate ? Math.max(0, dayDiff(toLocalDay(new Date().toISOString()), toLocalDay(project.targetDate))) : null;

  function dayIndex(date: Date) {
    return Math.max(0, Math.min(totalDays - 1, dayDiff(rangeStart, date)));
  }

  function exportCsv() {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const lines = [
      "Task,Status,Priority,Assignee,Start,Due",
      ...tasks.map((t) =>
        [
          escape(t.title),
          t.status,
          t.priority,
          escape(t.assigneeId ? getUserDisplayName(userMap.get(t.assigneeId)) : ""),
          t.startDate?.slice(0, 10) ?? "",
          t.dueDate?.slice(0, 10) ?? "",
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, "-").toLowerCase()}-timeline.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const dayGridBg = `repeating-linear-gradient(to right, var(--border) 0, var(--border) 1px, transparent 1px, transparent ${dayWidth}px)`;

  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
      {/* Stats */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <GanttStat icon={<ListTodo size={20} />} iconClass="bg-primary/10 text-primary" value={String(total)} label="Total Tasks" />
        <GanttStat icon={<CheckCircle2 size={20} />} iconClass="bg-success/10 text-success" value={String(done)} label="Completed" />
        <GanttStat icon={<CircleDot size={20} />} iconClass="bg-info/10 text-info" value={`${progress}%`} label="Overall Progress" />
        <GanttStat icon={<Users size={20} />} iconClass="bg-mention/10 text-mention" value={String(project.members.length)} label="Team Members" />
        <GanttStat icon={<CalendarDays size={20} />} iconClass="bg-warning/10 text-warning" value={daysLeft === null ? "—" : String(daysLeft)} label="Days Left" />
      </section>

      {/* Toolbar */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setOffset((o) => o - 30)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-surface-elevated" aria-label="Earlier">
            <ChevronLeft size={15} />
          </button>
          <button type="button" onClick={() => setOffset((o) => o + 30)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-text-secondary hover:bg-surface-elevated" aria-label="Later">
            <ChevronRight size={15} />
          </button>
          <button type="button" onClick={() => setOffset(0)} className="ml-1 h-9 rounded-lg border border-border px-4 text-[10px] font-semibold text-text-secondary hover:bg-surface-elevated">
            Today
          </button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-surface-elevated p-1">
            {Object.keys(GANTT_VIEW_DAY_WIDTH).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => { setView(item); setDayWidth(GANTT_VIEW_DAY_WIDTH[item]); }}
                className={cn("rounded-md px-4 py-1.5 text-[10px] font-medium", view === item ? "bg-primary/15 text-primary shadow-sm" : "text-text-muted")}
              >
                {item}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowFilter((s) => !s)}
            className={cn("flex h-9 items-center gap-2 rounded-lg border px-4 text-[10px] font-semibold", showFilter || statusFilter.length || assigneeFilter ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-surface text-text-secondary")}
          >
            <Filter size={14} />
            Filter
          </button>
          <button type="button" onClick={exportCsv} className="flex h-9 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-[10px] font-semibold text-text-secondary hover:bg-surface-elevated">
            <Download size={14} />
            Export
          </button>
        </div>
      </div>

      {/* Filter strip */}
      {showFilter ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-surface p-3">
          <span className="mr-1 text-[10px] font-semibold text-text-secondary">Status:</span>
          {statuses.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter((s) => (s.includes(status) ? s.filter((x) => x !== status) : [...s, status]))}
              className={cn("rounded-lg px-3 py-1.5 text-[10px] font-semibold", statusFilter.includes(status) ? "bg-primary/10 text-primary" : "border border-border text-text-muted hover:bg-surface-elevated")}
            >
              {labels[status]}
            </button>
          ))}
          <span className="ml-2 mr-1 text-[10px] font-semibold text-text-secondary">Assignee:</span>
          <select className="h-8 w-44 rounded-md border border-border bg-surface px-3 text-[11px] text-text" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
            <option value="">All assignees</option>
            {assignees.map((id) => (
              <option key={id} value={id}>{getUserDisplayName(userMap.get(id))}</option>
            ))}
          </select>
          {(statusFilter.length > 0 || assigneeFilter) && (
            <button type="button" onClick={() => { setStatusFilter([]); setAssigneeFilter(""); }} className="ml-auto text-[10px] font-semibold text-primary">
              Clear filters
            </button>
          )}
        </div>
      ) : null}

      {/* Chart */}
      <section className="mt-3 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="relative overflow-x-auto">
          <div style={{ minWidth: GANTT_LEFT_W + totalWidth }}>
            {/* Header row */}
            <div className="flex border-b border-border">
              <div className="sticky left-0 z-30 grid shrink-0 grid-cols-[210px_90px_110px_110px_1fr] items-end border-r border-border bg-surface-elevated px-2 pb-2 pt-2 text-[10px] font-semibold text-text-secondary" style={{ width: GANTT_LEFT_W }}>
                <span>Task</span>
                <span>Assignee</span>
                <span>Start Date</span>
                <span>End Date</span>
                <span>Status</span>
              </div>
              <div className="shrink-0" style={{ width: totalWidth }}>
                <div className="flex h-7 border-b border-border">
                  {months.map((month) => (
                    <div key={`${month.label}-${month.start}`} className="border-r border-border px-2 pt-1 text-[10px] font-semibold text-text" style={{ width: (month.end - month.start + 1) * dayWidth }}>
                      {month.label}
                    </div>
                  ))}
                </div>
                <div className="flex h-6">
                  {Array.from({ length: totalDays }, (_, i) => {
                    const day = addDays(rangeStart, i);
                    const weekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div key={i} className={cn("shrink-0 border-r border-border/50 text-center text-[8px] leading-6", weekend ? "bg-surface-elevated text-text" : "text-text-muted")} style={{ width: dayWidth }}>
                        {dayWidth >= 10 ? day.getDate() : day.getDate() === 1 ? day.getDate() : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Today line */}
            {showToday ? (
              <div className="pointer-events-none absolute bottom-0 top-[53px] z-20 border-l-2 border-dashed border-error/70" style={{ left: GANTT_LEFT_W + todayOffset * dayWidth + dayWidth / 2 }}>
                <div className="absolute -top-0.5 left-[-18px] rounded-sm bg-error px-1.5 py-0.5 text-[8px] font-semibold text-white">Today</div>
              </div>
            ) : null}

            {/* Groups + rows */}
            {!rows.length ? (
              <p className="py-12 text-center text-sm text-text-muted">No tasks match the current filters.</p>
            ) : null}
            {groups.map((group) => {
              const groupStart = group.rows.reduce<Date | null>((min, r) => (r.start && (!min || r.start < min) ? r.start : min), null);
              const groupEnd = group.rows.reduce<Date | null>((max, r) => (r.end && (!max || r.end > max) ? r.end : max), null);
              const isCollapsed = collapsed[group.status] ?? false;
              return (
                <div key={group.status}>
                  {/* Group row */}
                  <div className="flex border-b border-border" style={{ height: GANTT_ROW_H }}>
                    <button
                      type="button"
                      onClick={() => setCollapsed((c) => ({ ...c, [group.status]: !isCollapsed }))}
                      className="sticky left-0 z-30 flex shrink-0 items-center gap-2 border-r border-border bg-surface px-3 text-left"
                      style={{ width: GANTT_LEFT_W }}
                    >
                      {isCollapsed ? <ChevronRight size={14} className="text-text" /> : <ChevronDown size={14} className="text-text" />}
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color }} />
                      <span className="text-[11px] font-semibold text-text">{group.label}</span>
                      <span className="text-[10px] text-text-muted">({group.rows.length})</span>
                    </button>
                    <div className="relative shrink-0" style={{ width: totalWidth, backgroundImage: dayGridBg }}>
                      {groupStart && groupEnd ? (
                        <div
                          className="absolute top-1/2 h-4 -translate-y-1/2 rounded-md opacity-70"
                          style={{ left: dayIndex(groupStart) * dayWidth, width: Math.max(dayWidth, (dayIndex(groupEnd) - dayIndex(groupStart) + 1) * dayWidth), backgroundColor: group.color }}
                        />
                      ) : null}
                    </div>
                  </div>

                  {/* Task rows */}
                  {!isCollapsed
                    ? group.rows.map((row) => {
                        const { task, start, end, milestone } = row;
                        return (
                          <div key={task.id} className="flex border-b border-border/60" style={{ height: GANTT_ROW_H }}>
                            <div className="sticky left-0 z-30 grid shrink-0 grid-cols-[210px_90px_110px_110px_1fr] items-center border-r border-border bg-surface px-2 text-[10px]" style={{ width: GANTT_LEFT_W }}>
                              <button type="button" onClick={() => onSelect?.(task)} className="truncate pl-8 text-left font-medium text-text hover:text-primary">
                                {task.title}
                              </button>
                              <span className="flex justify-center">
                                {task.assigneeId ? <UserAvatar user={userMap.get(task.assigneeId)} className="h-6 w-6" fallbackClassName="text-[8px]" /> : <span className="text-text-muted">—</span>}
                              </span>
                              <span className="text-text-muted">{start ? start.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                              <span className="text-text-muted">{end ? end.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—"}</span>
                              <span>
                                <span className={cn("rounded-md px-2 py-1 text-[8px] font-semibold", GANTT_STATUS_CHIP[task.status] ?? "bg-surface-elevated text-text-muted")}>
                                  {labels[task.status] ?? task.status}
                                </span>
                              </span>
                            </div>
                            <div className="relative shrink-0" style={{ width: totalWidth, backgroundImage: dayGridBg }}>
                              {start && end ? (
                                milestone ? (
                                  <button
                                    type="button"
                                    onClick={() => onSelect?.(task)}
                                    title={`${task.title} · ${labels[task.status]} · due ${end.toLocaleDateString()}`}
                                    className="absolute top-1/2 -translate-y-1/2"
                                    style={{ left: dayIndex(start) * dayWidth + dayWidth / 2 - 7 }}
                                  >
                                    <div className="h-3.5 w-3.5 rotate-45 rounded-[2px] border border-white/60 shadow-sm" style={{ backgroundColor: statusColors[task.status] ?? "var(--primary)" }} />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onSelect?.(task)}
                                    title={`${task.title} · ${labels[task.status]} · ${task.priority}`}
                                    className="absolute top-1/2 flex h-6 -translate-y-1/2 items-center overflow-hidden rounded-md px-2 text-[9px] font-medium text-white shadow-sm"
                                    style={{
                                      left: dayIndex(start) * dayWidth,
                                      width: Math.max(dayWidth, (dayIndex(end) - dayIndex(start) + 1) * dayWidth - 2),
                                      backgroundColor: statusColors[task.status] ?? "var(--primary)",
                                    }}
                                  >
                                    {dayWidth >= 16 ? task.title : ""}
                                  </button>
                                )
                              ) : null}
                            </div>
                          </div>
                        );
                      })
                    : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer: legend + zoom */}
      <footer className="mt-3 flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-4">
          {GANTT_GROUP_ORDER.filter((status) => groups.some((g) => g.status === status)).map((status) => (
            <div key={status} className="flex items-center gap-2 text-[10px] text-text-muted">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: statusColors[status] }} />
              {labels[status]}
            </div>
          ))}
          <div className="flex items-center gap-2 text-[10px] text-text-muted">
            <span className="h-3 w-3 rotate-45 rounded-[2px] bg-text-muted" />
            Milestone (due-date only)
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-text-muted">Zoom</span>
          <button type="button" onClick={() => setDayWidth((w) => Math.max(4, w - 4))} className="text-text-muted hover:text-text" aria-label="Zoom out">
            <ZoomOut size={14} />
          </button>
          <input type="range" min={4} max={64} step={2} value={dayWidth} onChange={(e) => setDayWidth(Number(e.target.value))} className="w-28 accent-primary" aria-label="Timeline zoom" />
          <button type="button" onClick={() => setDayWidth((w) => Math.min(64, w + 4))} className="text-text-muted hover:text-text" aria-label="Zoom in">
            <ZoomIn size={14} />
          </button>
        </div>
      </footer>
    </div>
  );
}

function ProjectFiles({ projectId }: { projectId: string }) {
  const { data: attachments } = useProjectAttachments(projectId);
  const upload = useUploadFile();
  const add = useAddProjectAttachment();
  const remove = useRemoveProjectAttachment();
  function uploadFile(file?: File) { if (!file) return; upload.mutate({ file, resource: { resourceType: "project", resourceId: projectId } }, { onSuccess: (record) => add.mutate({ projectId, fileId: record.id }) }); }
  return <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6"><div className="mb-4 flex justify-end"><Button asChild><label className="cursor-pointer"><Plus className="mr-1 h-4 w-4" />Upload file<input type="file" className="hidden" onChange={(event) => { uploadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></Button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{attachments?.map((attachment) => <Card key={attachment.id}><MessageAttachment fileId={attachment.fileId} /><Button variant="ghost" size="sm" className="mt-2 text-error" onClick={() => remove.mutate({ projectId, fileId: attachment.fileId })}>Remove</Button></Card>)}{!attachments?.length ? <p className="col-span-full py-12 text-center text-sm text-text-muted">No project files.</p> : null}</div></div>;
}

function ProjectDiscussions({ projectId, userMap }: { projectId: string; userMap: Map<string, UserDto> }) {
  const { data: user } = useMe();
  const { data: comments, hasNextPage, fetchNextPage } = useProjectComments(projectId);
  const create = useCreateProjectComment();
  const update = useUpdateProjectComment();
  const remove = useDeleteProjectComment();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<ProjectComment | null>(null);
  return <div className="flex flex-1 flex-col overflow-hidden"><div className="flex-1 space-y-3 overflow-y-auto p-3 sm:p-4 lg:p-6">{hasNextPage ? <div className="text-center"><Button variant="ghost" onClick={() => void fetchNextPage()}>Load older</Button></div> : null}{comments?.map((comment) => <Card key={comment.id}><div className="flex justify-between"><span className="text-xs font-medium">{getUserDisplayName(userMap.get(comment.authorId))}</span><span className="text-xs text-text-muted">{new Date(comment.createdAt).toLocaleString()}</span></div>{editing?.id === comment.id ? <div className="mt-2 flex gap-2"><Input value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} /><Button onClick={() => update.mutate({ projectId, commentId: comment.id, content: editing.content }, { onSuccess: () => setEditing(null) })}>Save</Button></div> : <p className="mt-2 text-sm">{comment.deletedAt ? <em>Comment deleted</em> : comment.content}</p>}{!comment.deletedAt && comment.authorId === user?.id ? <div className="mt-2 flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(comment)}>Edit</Button><Button size="sm" variant="ghost" className="text-error" onClick={() => remove.mutate({ projectId, commentId: comment.id })}>Delete</Button></div> : null}</Card>)}{!comments?.length ? <p className="py-12 text-center text-sm text-text-muted">No discussions yet.</p> : null}</div><div className="flex gap-2 border-t p-3"><Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a comment" onKeyDown={(event) => { if (event.key === "Enter" && draft.trim()) create.mutate({ projectId, content: draft.trim() }, { onSuccess: () => setDraft("") }); }} /><Button size="icon" disabled={!draft.trim()} onClick={() => create.mutate({ projectId, content: draft.trim() }, { onSuccess: () => setDraft("") })}><Send className="h-4 w-4" /></Button></div></div>;
}

function ProjectApprovals({ projectId, tasks, userMap }: { projectId: string; tasks: Task[]; userMap: Map<string, UserDto> }) {
  const { data: approvals } = useApprovals(projectId);
  const create = useCreateApproval();
  const resolve = useResolveApproval();
  const [taskId, setTaskId] = useState("");
  const [message, setMessage] = useState("");
  return <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6"><div className="mb-4 flex gap-2"><select className={selectClass} value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">Select a task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Approval note" /><Button disabled={!taskId || create.isPending} onClick={() => create.mutate({ projectId, resourceType: "task", resourceId: taskId, message: message || undefined }, { onSuccess: () => { setTaskId(""); setMessage(""); } })}>Request</Button></div><div className="space-y-2">{approvals?.map((approval) => <Card key={approval.id}><div className="flex items-start justify-between"><div><p className="text-sm font-medium">{approval.resourceType} · {approval.resourceId}</p><p className="text-xs text-text-muted">Requested by {getUserDisplayName(userMap.get(approval.requestedBy))}</p>{approval.message ? <p className="mt-2 text-sm">{approval.message}</p> : null}</div><span className="text-xs capitalize text-text-muted">{approval.status}</span></div>{approval.status === "pending" ? <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => resolve.mutate({ projectId, approvalId: approval.id, status: "approved" })}>Approve</Button><Button size="sm" variant="ghost" className="text-error" onClick={() => resolve.mutate({ projectId, approvalId: approval.id, status: "rejected" })}>Reject</Button></div> : null}</Card>)}{!approvals?.length ? <p className="py-12 text-center text-sm text-text-muted">No approval requests.</p> : null}</div></div>;
}

function useActorMap(activity: ProjectActivity[] | undefined) {
  const actorIds = useMemo(() => [...new Set(activity?.map((item) => item.actorId) ?? [])], [activity]);
  const { data: users } = useUsers(actorIds);
  return useMemo(() => {
    const map = new Map<string, UserDto>();
    for (const user of users ?? []) map.set(user.id, user);
    return map;
  }, [users]);
}

function getActorLabel(actor: UserDto | undefined, _fallbackId: string) {
  if (!actor) return "Unknown";
  return `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() || actor.email;
}

function getActorInitials(actor: UserDto | undefined, fallbackId: string) {
  const label = getActorLabel(actor, fallbackId);
  return label.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function getInitials(_member: { userId: string }, user: UserDto | undefined) {
  const label = getUserDisplayName(user);
  return label.split(/\s+/).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function ProjectActivityView({ projectId }: { projectId: string }) {
  const { data: activity, hasNextPage, fetchNextPage } = useProjectActivity(projectId);
  const actorMap = useActorMap(activity);
  return (
    <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
      <div className="mx-auto max-w-3xl space-y-2">
        {activity?.map((item) => {
          const actor = actorMap.get(item.actorId);
          const name = getActorLabel(actor, item.actorId);
          const initials = getActorInitials(actor, item.actorId);
          return (
            <div key={item.id} className="flex gap-3 rounded-md border p-3">
              <Avatar className="h-8 w-8"><AvatarFallback>{initials}</AvatarFallback></Avatar>
              <div className="flex-1">
                <p className="text-sm"><span className="font-medium">{name}</span> {item.action.split(".").join(" ")}</p>
                <time className="text-xs text-text-muted">{new Date(item.createdAt).toLocaleString()}</time>
              </div>
            </div>
          );
        })}
        {hasNextPage ? <div className="text-center"><Button variant="ghost" onClick={() => void fetchNextPage()}>Load more</Button></div> : null}
        {!activity?.length ? <p className="py-12 text-center text-sm text-text-muted">No activity yet.</p> : null}
      </div>
    </div>
  );
}

function ProjectOverview({ tasks, project }: { tasks?: Task[]; project: Project }) {
  const total = tasks?.length ?? 0;
  const done = tasks?.filter((task) => task.status === "done")?.length ?? 0;
  const progress = total ? done / total : 0;
  const breakdown = useMemo(() => Object.fromEntries(statuses.map((status) => [status, tasks?.filter((task) => task.status === status)?.length ?? 0])), [tasks]);
  return <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6"><div className="grid auto-rows-min grid-cols-1 gap-4 md:grid-cols-3"><Card className="md:col-span-2"><h3 className="text-sm font-semibold">Progress summary</h3><div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-elevated"><div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} /></div><p className="mt-2 text-xs text-text-muted">{Math.round(progress * 100)}% complete ({done} of {total})</p></Card><Card><h3 className="text-sm font-semibold">Schedule</h3><p className="mt-3 text-sm text-text-secondary">{project.startDate ? new Date(project.startDate).toLocaleDateString() : "No start date"} — {project.targetDate ? new Date(project.targetDate).toLocaleDateString() : "No target date"}</p></Card><Card><h3 className="text-sm font-semibold">Task breakdown</h3><div className="mt-3 space-y-1">{Object.entries(breakdown).map(([status, count]) => <div key={status} className="flex justify-between text-sm"><span>{labels[status]}</span><span>{count}</span></div>)}</div></Card><Card className="md:col-span-2"><h3 className="text-sm font-semibold">Project summary</h3><p className="mt-3 text-sm text-text-secondary">{total} tasks, {done} completed, {total - done} remaining.</p></Card></div></div>;
}
