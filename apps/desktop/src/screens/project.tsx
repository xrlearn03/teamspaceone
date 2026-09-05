import { useEffect, useMemo, useState } from "react";
import { Calendar, CheckCircle2, Copy, ExternalLink, Folder, Plus, Send, Settings, Trash2 } from "lucide-react";
import { useUIStore } from "../stores/ui";
import {
  useAddProjectAttachment,
  useApprovals,
  useClients,
  useCreateApproval,
  useCreateProject,
  useCreateProjectComment,
  useCreateTask,
  useDeleteProject,
  useDeleteProjectComment,
  useDeleteTask,
  useMe,
  useMembers,
  useProjectActivity,
  useProjectAttachments,
  useProjectComments,
  useProjects,
  useRemoveProjectAttachment,
  useResolveApproval,
  useTasks,
  useUpdateProject,
  useUpdateProjectComment,
  useUpdateTask,
  useUploadFile,
  useWorkspaces,
} from "../hooks/api";
import { getActiveOrganisation, type Project, type ProjectComment, type Task } from "../lib/api";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { MessageAttachment } from "../components/ui/message-attachment";
import { cn } from "../lib/utils";

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
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const [tab, setTab] = useState<(typeof tabs)[number]>("board");
  const [newTask, setNewTask] = useState<Record<string, string>>({});
  const [projectDialog, setProjectDialog] = useState<"create" | "settings" | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  const grouped = useMemo(() => Object.fromEntries(statuses.map((status) => [status, (tasks ?? []).filter((task) => task.status === status)])), [tasks]);

  function dropTask(status: string) {
    if (!dragTaskId || !project) return;
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
        <Button onClick={() => setProjectDialog("create")}><Plus className="mr-1 h-4 w-4" />Create project</Button>
        <ProjectDialog mode="create" open={projectDialog === "create"} onOpenChange={(open) => setProjectDialog(open ? "create" : null)} members={members ?? []} workspaces={workspaces ?? []} clients={clients ?? []} />
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <header className="border-b px-6 py-4">
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
              <div className="flex -space-x-2">{project.members.slice(0, 4).map((member) => <Avatar key={member.id} className="h-7 w-7 border-2 border-surface"><AvatarFallback className="text-[10px]">{member.userId.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>)}</div>
              {project.ownerId === user?.id ? <Button variant="ghost" size="icon" onClick={() => setProjectDialog("settings")}><Settings className="h-4 w-4" /></Button> : null}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-1 overflow-x-auto">{tabs.map((item) => <button key={item} type="button" onClick={() => setTab(item)} className={cn("rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors", tab === item ? "bg-primary-subtle text-primary" : "text-text-secondary hover:bg-surface-elevated hover:text-text")}>{item}</button>)}</div>
            <Button size="sm" onClick={() => setTab("board")}><Plus className="mr-1.5 h-4 w-4" />New task</Button>
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
              <div className="flex-1 space-y-2 p-2">{grouped[status]?.map((task) => <TaskCard key={task.id} task={task} dragging={dragTaskId === task.id} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", task.id); setDragTaskId(task.id); }} onDragEnd={() => { setDragTaskId(null); setDragOverStatus(null); }} onClick={() => setSelectedTask(task)} />)}{!grouped[status]?.length ? <div className="rounded-md border border-dashed py-6 text-center text-xs text-text-muted">Drop tasks here</div> : null}</div>
              <div className="m-2 space-y-1"><Input placeholder="Add task…" value={newTask[status] ?? ""} onChange={(event) => setNewTask((current) => ({ ...current, [status]: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter") addTask(status); }} className="h-7 text-xs" /><button type="button" onClick={() => addTask(status)} className="flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-xs font-medium text-text-muted hover:bg-surface-elevated hover:text-text"><Plus className="h-3.5 w-3.5" />Add task</button></div>
            </div>
          ))}</div>
        ) : null}
        {tab === "list" ? <TaskList tasks={tasks ?? []} onSelect={setSelectedTask} /> : null}
        {tab === "timeline" ? <Timeline tasks={tasks ?? []} /> : null}
        {tab === "files" ? <ProjectFiles projectId={project.id} /> : null}
        {tab === "discussions" ? <ProjectDiscussions projectId={project.id} /> : null}
        {tab === "approvals" ? <ProjectApprovals projectId={project.id} tasks={tasks ?? []} /> : null}
        {tab === "activity" ? <ProjectActivityView projectId={project.id} /> : null}
      </div>
      <ProjectDialog mode="settings" project={project} open={projectDialog === "settings"} onOpenChange={(open) => setProjectDialog(open ? "settings" : null)} members={members ?? []} workspaces={workspaces ?? []} clients={clients ?? []} />
      <TaskDialog task={selectedTask} members={members ?? []} open={Boolean(selectedTask)} onOpenChange={(open) => { if (!open) setSelectedTask(null); }} onSave={(body) => updateTask.mutate({ taskId: selectedTask!.id, projectId: project.id, body }, { onSuccess: () => setSelectedTask(null) })} />
    </>
  );
}

function TaskCard({ task, onClick, dragging, onDragStart, onDragEnd }: { task: Task; onClick: () => void; dragging?: boolean; onDragStart?: (event: React.DragEvent) => void; onDragEnd?: () => void }) {
  return (
    <Card
      className={cn("cursor-pointer p-3 hover:border-primary/30", dragging && "opacity-40")}
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => { if (event.key === "Enter") onClick(); }}
    >
      <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-text">{task.title}</p><span className={cn("h-2 w-2 shrink-0 rounded-full", task.priority === "urgent" ? "bg-error" : task.priority === "high" ? "bg-warning" : "bg-primary")} /></div>
      <div className="mt-2 flex items-center justify-between"><span className="text-xs text-text-muted">{task.assigneeId ? task.assigneeId.slice(0, 8) : "Unassigned"}</span>{task.dueDate ? <span className="text-xs text-text-muted">{new Date(task.dueDate).toLocaleDateString()}</span> : null}</div>
    </Card>
  );
}

function TaskList({ tasks, onSelect }: { tasks: Task[]; onSelect: (task: Task) => void }) {
  return <div className="flex-1 overflow-y-auto p-6"><div className="overflow-hidden rounded-lg border">{tasks.map((task) => <button key={task.id} type="button" onClick={() => onSelect(task)} className="grid w-full grid-cols-[1fr_140px_100px_120px] gap-3 border-b px-4 py-3 text-left text-sm last:border-0 hover:bg-surface-elevated"><span>{task.title}</span><span className="capitalize text-text-muted">{labels[task.status]}</span><span className="capitalize text-text-muted">{task.priority}</span><span className="text-text-muted">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No due date"}</span></button>)}{!tasks.length ? <p className="p-8 text-center text-sm text-text-muted">No tasks yet.</p> : null}</div></div>;
}

function ProjectDialog({ mode, project, open, onOpenChange, members, workspaces, clients }: { mode: "create" | "settings"; project?: Project; open: boolean; onOpenChange: (open: boolean) => void; members: { userId: string; role: { name: string } }[]; workspaces: { id: string; name: string }[]; clients: { id: string; name: string }[] }) {
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
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

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg p-0"><DialogHeader><DialogTitle>{mode === "create" ? "Create project" : "Project settings"}</DialogTitle><DialogDescription>Configure project ownership, schedule, and access.</DialogDescription></DialogHeader><div className="space-y-3 px-4 pb-4"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" /><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" />{mode === "create" ? <select className={selectClass} value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="">No workspace</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select> : <select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select>}<select className={selectClass} value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">No client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select><div className="grid grid-cols-2 gap-2"><label className="text-xs text-text-muted">Start date<Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="text-xs text-text-muted">Target date<Input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></label></div><div className="max-h-36 overflow-y-auto rounded-md border p-2">{members.map((member) => <label key={member.userId} className="flex items-center gap-2 px-2 py-1 text-sm"><input type="checkbox" checked={memberIds.includes(member.userId)} disabled={member.userId === project?.ownerId} onChange={() => setMemberIds((ids) => ids.includes(member.userId) ? ids.filter((id) => id !== member.userId) : [...ids, member.userId])} /><span className="flex-1 truncate">{member.userId}</span>{isExternalMember(member.role.name) ? <Badge variant="warning">External</Badge> : <span className="text-xs text-text-muted">{member.role.name}</span>}</label>)}</div><div className="flex justify-between">{mode === "settings" ? <Button variant="ghost" className="text-error" onClick={() => project && deleteProject.mutate(project.id, { onSuccess: () => { onOpenChange(false); useUIStore.getState().setActiveView("home"); } })}>Delete project</Button> : <span />}<div className="flex gap-2"><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!name.trim() || createProject.isPending || updateProject.isPending} onClick={submit}>Save</Button></div></div></div></DialogContent></Dialog>;
}

function TaskDialog({ task, members, open, onOpenChange, onSave }: { task: Task | null; members: { userId: string; role?: { name: string } }[]; open: boolean; onOpenChange: (open: boolean) => void; onSave: (body: Parameters<ReturnType<typeof useUpdateTask>["mutate"]>[0]["body"]) => void }) {
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState(task?.status ?? "todo");
  const [priority, setPriority] = useState(task?.priority ?? "medium");
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? "");
  const [copied, setCopied] = useState(false);
  const { data: activity } = useProjectActivity(task?.projectId);
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
    setDueDate(task?.dueDate?.slice(0, 10) ?? "");
    setCopied(false);
  }, [task]);
  if (!task) return null;

  const isDone = status === "done";

  function duplicate() {
    if (!task) return;
    createTask.mutate(
      { projectId: task.projectId, title: `${title.trim() || task.title} (copy)`, description: description.trim() || undefined, assigneeId: assigneeId || undefined, priority, dueDate: dueDate || undefined, status },
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
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-text-muted">Status
              <select className={cn(selectClass, "mt-1")} value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select>
            </label>
            <label className="text-xs text-text-muted">Priority
              <select className={cn(selectClass, "mt-1 capitalize")} value={priority} onChange={(event) => setPriority(event.target.value)}>{priorities.map((item) => <option key={item}>{item}</option>)}</select>
            </label>
            <label className="text-xs text-text-muted">Assignee
              <select className={cn(selectClass, "mt-1")} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{members.map((member) => <option key={member.userId} value={member.userId}>{member.userId}{member.role && isExternalMember(member.role.name) ? " (external)" : ""}</option>)}</select>
            </label>
            <label className="text-xs text-text-muted">Due date
              <Input type="date" className="mt-1" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </label>
          </div>
          <div className="space-y-1 rounded-md border border-dashed p-3">
            <p className="text-xs font-medium text-text-muted">Labels · Subtasks · Checklist · Dependencies</p>
            <p className="text-xs text-text-muted">Coming soon — not yet supported by the projects service.</p>
          </div>
          {taskActivity.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium text-text-muted">Activity</p>
              <div className="space-y-1 rounded-md border p-2">
                {taskActivity.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-text-secondary">{item.action.replace(/[._]/g, " ")} by {item.actorId.slice(0, 8)}</span>
                    <span className="text-text-muted">{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={() => onSave({ status: isDone ? "todo" : "done" })}>
                <CheckCircle2 className={cn("mr-1 h-4 w-4", isDone ? "text-success" : undefined)} />
                {isDone ? "Reopen" : "Mark complete"}
              </Button>
              <Button variant="ghost" size="sm" onClick={duplicate} disabled={createTask.isPending}>Duplicate</Button>
              <Button variant="ghost" size="sm" onClick={copyLink}>
                <Copy className="mr-1 h-4 w-4" />
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button variant="ghost" size="sm" className="text-error" onClick={() => deleteTask.mutate({ taskId: task.id, projectId: task.projectId }, { onSuccess: () => onOpenChange(false) })}>
                <Trash2 className="mr-1 h-4 w-4" />Delete
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => onSave({ title: title.trim(), description: description.trim() || null, status, priority, assigneeId: assigneeId || null, dueDate: dueDate || null })}>Save</Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Timeline({ tasks }: { tasks: Task[] }) {
  const dated = tasks.filter((task) => task.dueDate).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  return <div className="flex-1 overflow-y-auto p-6"><div className="mx-auto max-w-3xl space-y-3">{dated.map((task) => <Card key={task.id} className="flex items-center gap-3"><Calendar className="h-5 w-5 text-primary" /><div className="flex-1"><p className="text-sm font-medium">{task.title}</p><p className="text-xs text-text-muted">{labels[task.status]} · {task.priority}</p></div><time className="text-sm text-text-secondary">{new Date(task.dueDate!).toLocaleDateString()}</time></Card>)}{!dated.length ? <p className="py-12 text-center text-sm text-text-muted">Add task due dates to build the timeline.</p> : null}</div></div>;
}

function ProjectFiles({ projectId }: { projectId: string }) {
  const { data: attachments } = useProjectAttachments(projectId);
  const upload = useUploadFile();
  const add = useAddProjectAttachment();
  const remove = useRemoveProjectAttachment();
  function uploadFile(file?: File) { if (!file) return; upload.mutate(file, { onSuccess: (record) => add.mutate({ projectId, fileId: record.id }) }); }
  return <div className="flex-1 overflow-y-auto p-6"><div className="mb-4 flex justify-end"><Button asChild><label className="cursor-pointer"><Plus className="mr-1 h-4 w-4" />Upload file<input type="file" className="hidden" onChange={(event) => { uploadFile(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label></Button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{attachments?.map((attachment) => <Card key={attachment.id}><MessageAttachment fileId={attachment.fileId} /><Button variant="ghost" size="sm" className="mt-2 text-error" onClick={() => remove.mutate({ projectId, fileId: attachment.fileId })}>Remove</Button></Card>)}{!attachments?.length ? <p className="col-span-full py-12 text-center text-sm text-text-muted">No project files.</p> : null}</div></div>;
}

function ProjectDiscussions({ projectId }: { projectId: string }) {
  const { data: user } = useMe();
  const { data: comments, hasNextPage, fetchNextPage } = useProjectComments(projectId);
  const create = useCreateProjectComment();
  const update = useUpdateProjectComment();
  const remove = useDeleteProjectComment();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<ProjectComment | null>(null);
  return <div className="flex flex-1 flex-col overflow-hidden"><div className="flex-1 space-y-3 overflow-y-auto p-6">{hasNextPage ? <div className="text-center"><Button variant="ghost" onClick={() => void fetchNextPage()}>Load older</Button></div> : null}{comments?.map((comment) => <Card key={comment.id}><div className="flex justify-between"><span className="text-xs font-medium">{comment.authorId}</span><span className="text-xs text-text-muted">{new Date(comment.createdAt).toLocaleString()}</span></div>{editing?.id === comment.id ? <div className="mt-2 flex gap-2"><Input value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} /><Button onClick={() => update.mutate({ projectId, commentId: comment.id, content: editing.content }, { onSuccess: () => setEditing(null) })}>Save</Button></div> : <p className="mt-2 text-sm">{comment.deletedAt ? <em>Comment deleted</em> : comment.content}</p>}{!comment.deletedAt && comment.authorId === user?.id ? <div className="mt-2 flex gap-1"><Button size="sm" variant="ghost" onClick={() => setEditing(comment)}>Edit</Button><Button size="sm" variant="ghost" className="text-error" onClick={() => remove.mutate({ projectId, commentId: comment.id })}>Delete</Button></div> : null}</Card>)}{!comments?.length ? <p className="py-12 text-center text-sm text-text-muted">No discussions yet.</p> : null}</div><div className="flex gap-2 border-t p-3"><Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a comment" onKeyDown={(event) => { if (event.key === "Enter" && draft.trim()) create.mutate({ projectId, content: draft.trim() }, { onSuccess: () => setDraft("") }); }} /><Button size="icon" disabled={!draft.trim()} onClick={() => create.mutate({ projectId, content: draft.trim() }, { onSuccess: () => setDraft("") })}><Send className="h-4 w-4" /></Button></div></div>;
}

function ProjectApprovals({ projectId, tasks }: { projectId: string; tasks: Task[] }) {
  const { data: approvals } = useApprovals(projectId);
  const create = useCreateApproval();
  const resolve = useResolveApproval();
  const [taskId, setTaskId] = useState("");
  const [message, setMessage] = useState("");
  return <div className="flex-1 overflow-y-auto p-6"><div className="mb-4 flex gap-2"><select className={selectClass} value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">Select a task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select><Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Approval note" /><Button disabled={!taskId || create.isPending} onClick={() => create.mutate({ projectId, resourceType: "task", resourceId: taskId, message: message || undefined }, { onSuccess: () => { setTaskId(""); setMessage(""); } })}>Request</Button></div><div className="space-y-2">{approvals?.map((approval) => <Card key={approval.id}><div className="flex items-start justify-between"><div><p className="text-sm font-medium">{approval.resourceType} · {approval.resourceId}</p><p className="text-xs text-text-muted">Requested by {approval.requestedBy}</p>{approval.message ? <p className="mt-2 text-sm">{approval.message}</p> : null}</div><span className="text-xs capitalize text-text-muted">{approval.status}</span></div>{approval.status === "pending" ? <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => resolve.mutate({ projectId, approvalId: approval.id, status: "approved" })}>Approve</Button><Button size="sm" variant="ghost" className="text-error" onClick={() => resolve.mutate({ projectId, approvalId: approval.id, status: "rejected" })}>Reject</Button></div> : null}</Card>)}{!approvals?.length ? <p className="py-12 text-center text-sm text-text-muted">No approval requests.</p> : null}</div></div>;
}

function ProjectActivityView({ projectId }: { projectId: string }) {
  const { data: activity, hasNextPage, fetchNextPage } = useProjectActivity(projectId);
  return <div className="flex-1 overflow-y-auto p-6"><div className="mx-auto max-w-3xl space-y-2">{activity?.map((item) => <div key={item.id} className="flex gap-3 rounded-md border p-3"><Avatar className="h-8 w-8"><AvatarFallback>{item.actorId.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar><div className="flex-1"><p className="text-sm"><span className="font-medium">{item.actorId}</span> {item.action.split(".").join(" ")}</p><time className="text-xs text-text-muted">{new Date(item.createdAt).toLocaleString()}</time></div></div>)}{hasNextPage ? <div className="text-center"><Button variant="ghost" onClick={() => void fetchNextPage()}>Load more</Button></div> : null}{!activity?.length ? <p className="py-12 text-center text-sm text-text-muted">No activity yet.</p> : null}</div></div>;
}

function ProjectOverview({ tasks, project }: { tasks?: Task[]; project: Project }) {
  const total = tasks?.length ?? 0;
  const done = tasks?.filter((task) => task.status === "done")?.length ?? 0;
  const progress = total ? done / total : 0;
  const breakdown = useMemo(() => Object.fromEntries(statuses.map((status) => [status, tasks?.filter((task) => task.status === status)?.length ?? 0])), [tasks]);
  return <div className="flex-1 overflow-y-auto p-6"><div className="grid auto-rows-min grid-cols-1 gap-4 md:grid-cols-3"><Card className="md:col-span-2"><h3 className="text-sm font-semibold">Progress summary</h3><div className="mt-3 h-3 overflow-hidden rounded-full bg-surface-elevated"><div className="h-full rounded-full bg-primary" style={{ width: `${progress * 100}%` }} /></div><p className="mt-2 text-xs text-text-muted">{Math.round(progress * 100)}% complete ({done} of {total})</p></Card><Card><h3 className="text-sm font-semibold">Schedule</h3><p className="mt-3 text-sm text-text-secondary">{project.startDate ? new Date(project.startDate).toLocaleDateString() : "No start date"} — {project.targetDate ? new Date(project.targetDate).toLocaleDateString() : "No target date"}</p></Card><Card><h3 className="text-sm font-semibold">Task breakdown</h3><div className="mt-3 space-y-1">{Object.entries(breakdown).map(([status, count]) => <div key={status} className="flex justify-between text-sm"><span>{labels[status]}</span><span>{count}</span></div>)}</div></Card><Card className="md:col-span-2"><h3 className="text-sm font-semibold">Project summary</h3><p className="mt-3 text-sm text-text-secondary">{total} tasks, {done} completed, {total - done} remaining.</p></Card></div></div>;
}
