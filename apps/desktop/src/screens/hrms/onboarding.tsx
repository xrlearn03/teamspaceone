import { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import {
  useActiveOrganisation,
  useCancelOnboardingInstance,
  useConvertOnboardingInstance,
  useCreateOnboardingInstance,
  useCreateOnboardingTemplate,
  useDeleteOnboardingTemplate,
  useDepartments,
  useDesignations,
  useEmployees,
  useMembers,
  useOnboardingInstances,
  useOnboardingTemplates,
  useSetOnboardingTaskStatus,
  useUpdateOnboardingTemplate,
  useUsers,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import type { OnboardingInstance, OnboardingTemplate } from "../../lib/api";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { Input } from "../../components/ui/input";
import { SectionError, SectionSkeleton, StatusBadge, formatDate } from "./common";

const labelCls = "text-xs font-medium text-text-secondary";
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm text-text";

function instanceName(o: OnboardingInstance) {
  if (o.employee) return `${o.employee.firstName} ${o.employee.lastName}`.trim();
  return o.candidateName ?? o.candidateEmail ?? "—";
}

function taskProgress(o: OnboardingInstance) {
  const total = o.tasks.length;
  const done = o.tasks.filter((t) => t.status === "completed").length;
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

function EmployeeSelect({
  value,
  onChange,
  allowNone = true,
}: {
  value: string;
  onChange: (v: string) => void;
  allowNone?: boolean;
}) {
  const employees = useEmployees({});
  return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone ? <option value="">None</option> : <option value="">Select…</option>}
      {(employees.data ?? []).map((e) => (
        <option key={e.id} value={e.id}>
          {e.firstName} {e.lastName}
        </option>
      ))}
    </select>
  );
}

/** Picks an organisation user by membership (for convert-to-employee). */
function MemberUserSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { id: orgId } = useActiveOrganisation();
  const members = useMembers(orgId ?? undefined);
  const userIds = useMemo(
    () => [...new Set((members.data ?? []).map((m) => m.userId))],
    [members.data],
  );
  const users = useUsers(userIds);
  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    (users.data ?? []).forEach((u) => {
      const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      m.set(u.id, name ? `${name} (${u.email})` : u.email);
    });
    return m;
  }, [users.data]);
  return (
    <select className={selectCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a user…</option>
      {userIds.map((id) => (
        <option key={id} value={id}>
          {userMap.get(id) ?? id}
        </option>
      ))}
    </select>
  );
}

function StartOnboardingDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const templates = useOnboardingTemplates();
  const create = useCreateOnboardingInstance();
  const [employeeId, setEmployeeId] = useState("");
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [startDate, setStartDate] = useState("");

  const valid = employeeId || candidateName.trim();

  function submit() {
    if (!valid) return;
    create.mutate(
      {
        employeeId: employeeId || undefined,
        candidateName: !employeeId && candidateName.trim() ? candidateName.trim() : undefined,
        candidateEmail: !employeeId && candidateEmail.trim() ? candidateEmail.trim() : undefined,
        templateId: templateId || undefined,
        startDate: startDate || undefined,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start onboarding</DialogTitle>
          <DialogDescription>
            Kick off an onboarding checklist for an employee or a hired candidate.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Employee</span>
            <EmployeeSelect value={employeeId} onChange={setEmployeeId} />
          </label>
          {!employeeId ? (
            <>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Candidate name</span>
                <Input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Candidate email</span>
                <Input type="email" value={candidateEmail} onChange={(e) => setCandidateEmail(e.target.value)} />
              </label>
            </>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Template</span>
            <select className={selectCls} value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Default</option>
              {(templates.data ?? []).filter((t) => t.isActive).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Start date</span>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || !valid}>Start</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConvertToEmployeeDialog({
  instance,
  open,
  onOpenChange,
}: {
  instance: OnboardingInstance;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const departments = useDepartments();
  const designations = useDesignations();
  const convert = useConvertOnboardingInstance();
  const nameParts = (instance.candidateName ?? "").trim().split(/\s+/);
  const [form, setForm] = useState({
    userId: "",
    firstName: nameParts[0] ?? "",
    lastName: nameParts.slice(1).join(" "),
    workEmail: instance.candidateEmail ?? "",
    phone: "",
    departmentId: "",
    designationId: "",
    joiningDate: instance.startDate?.slice(0, 10) ?? "",
    employmentType: "full_time",
    employeeNumber: "",
  });

  function field<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const valid = form.userId && form.firstName.trim() && form.lastName.trim();

  function submit() {
    if (!valid) return;
    convert.mutate(
      {
        id: instance.id,
        body: {
          userId: form.userId,
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          workEmail: form.workEmail || undefined,
          phone: form.phone || undefined,
          departmentId: form.departmentId || undefined,
          designationId: form.designationId || undefined,
          joiningDate: form.joiningDate || undefined,
          employmentType: form.employmentType || undefined,
          employeeNumber: form.employeeNumber || undefined,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert to employee</DialogTitle>
          <DialogDescription>
            Create an employee record for {instance.candidateName ?? "this candidate"}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 p-4 pt-2">
          <label className="col-span-2 flex flex-col gap-1">
            <span className={labelCls}>Organisation user *</span>
            <MemberUserSelect value={form.userId} onChange={(v) => field("userId", v)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>First name *</span>
            <Input value={form.firstName} onChange={(e) => field("firstName", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Last name *</span>
            <Input value={form.lastName} onChange={(e) => field("lastName", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Work email</span>
            <Input type="email" value={form.workEmail} onChange={(e) => field("workEmail", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Phone</span>
            <Input value={form.phone} onChange={(e) => field("phone", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Department</span>
            <select className={selectCls} value={form.departmentId} onChange={(e) => field("departmentId", e.target.value)}>
              <option value="">None</option>
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Designation</span>
            <select className={selectCls} value={form.designationId} onChange={(e) => field("designationId", e.target.value)}>
              <option value="">None</option>
              {(designations.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.title ?? d.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Joining date</span>
            <Input type="date" value={form.joiningDate} onChange={(e) => field("joiningDate", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Employment type</span>
            <select className={selectCls} value={form.employmentType} onChange={(e) => field("employmentType", e.target.value)}>
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Employee number</span>
            <Input value={form.employeeNumber} onChange={(e) => field("employeeNumber", e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={convert.isPending || !valid}>Convert</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TaskRowDraft {
  title: string;
  description: string;
  category: string;
  dueDaysOffset: string;
}

const EMPTY_TASK: TaskRowDraft = { title: "", description: "", category: "", dueDaysOffset: "" };

function TemplateDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template?: OnboardingTemplate | null;
}) {
  const create = useCreateOnboardingTemplate();
  const update = useUpdateOnboardingTemplate();
  const busy = create.isPending || update.isPending;
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [tasks, setTasks] = useState<TaskRowDraft[]>(
    template?.tasks.map((t) => ({
      title: t.title,
      description: t.description ?? "",
      category: t.category ?? "",
      dueDaysOffset: t.dueDaysOffset != null ? String(t.dueDaysOffset) : "",
    })) ?? [],
  );

  const valid = name.trim() && tasks.every((t) => t.title.trim());

  function submit() {
    if (!valid) return;
    const body = {
      name: name.trim(),
      description: description || undefined,
      tasks: tasks
        .filter((t) => t.title.trim())
        .map((t, i) => ({
          title: t.title.trim(),
          description: t.description || undefined,
          category: t.category || undefined,
          dueDaysOffset: t.dueDaysOffset ? Number(t.dueDaysOffset) : undefined,
          sortOrder: i,
        })),
    };
    if (template) {
      update.mutate({ id: template.id, body }, { onSuccess: () => onOpenChange(false) });
    } else {
      create.mutate(body, { onSuccess: () => onOpenChange(false) });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{template ? "Edit template" : "New template"}</DialogTitle>
          <DialogDescription>Templates define the checklist applied to new joiners.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Name *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Description</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="flex items-center justify-between">
            <span className={labelCls}>Tasks</span>
            <Button variant="secondary" size="sm" onClick={() => setTasks((t) => [...t, { ...EMPTY_TASK }])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add task
            </Button>
          </div>
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {tasks.length === 0 ? (
              <p className="text-xs text-text-muted">No tasks yet — add the first checklist item.</p>
            ) : (
              tasks.map((t, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border p-2">
                  <div className="grid flex-1 grid-cols-2 gap-2">
                    <Input
                      placeholder="Task title *"
                      value={t.title}
                      onChange={(e) => setTasks((ts) => ts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    />
                    <Input
                      placeholder="Category"
                      value={t.category}
                      onChange={(e) => setTasks((ts) => ts.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))}
                    />
                    <Input
                      placeholder="Description"
                      value={t.description}
                      onChange={(e) => setTasks((ts) => ts.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                    />
                    <Input
                      type="number"
                      placeholder="Due in N days"
                      value={t.dueDaysOffset}
                      onChange={(e) => setTasks((ts) => ts.map((x, j) => (j === i ? { ...x, dueDaysOffset: e.target.value } : x)))}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove task"
                    onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !valid}>
            {template ? "Save changes" : "Create template"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InstanceDetail({ instance, canManage }: { instance: OnboardingInstance; canManage: boolean }) {
  const setTask = useSetOnboardingTaskStatus();
  const cancel = useCancelOnboardingInstance();
  const [convertOpen, setConvertOpen] = useState(false);
  const { done, total, pct } = taskProgress(instance);

  return (
    <div className="border-t bg-surface-elevated/40 px-4 py-3">
      <div className="mb-2 flex items-center gap-3">
        <div className="h-2 w-40 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-text-muted">{done}/{total} tasks · {pct}%</span>
        <div className="ml-auto flex gap-1">
          {canManage && instance.status === "pending" && instance.sourceType === "interview" ? (
            <Button size="sm" variant="secondary" onClick={() => setConvertOpen(true)}>
              <UserCheck className="mr-1 h-3.5 w-3.5" /> Convert to employee
            </Button>
          ) : null}
          {canManage && instance.status !== "completed" && instance.status !== "cancelled" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={cancel.isPending}
              onClick={() => {
                if (window.confirm("Cancel this onboarding?")) cancel.mutate(instance.id);
              }}
            >
              Cancel onboarding
            </Button>
          ) : null}
        </div>
      </div>
      <ul className="flex flex-col gap-1">
        {instance.tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm">
            {t.status === "completed" ? (
              <Check className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-border" />
            )}
            <span className={t.status === "completed" ? "flex-1 text-text-muted line-through" : "flex-1 text-text"}>
              {t.title}
            </span>
            {t.category ? <Badge variant="secondary">{t.category}</Badge> : null}
            <span className="text-xs text-text-muted">
              {t.status === "completed" ? formatDate(t.completedAt) : t.dueDate ? `due ${formatDate(t.dueDate)}` : ""}
            </span>
            {canManage ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={setTask.isPending}
                onClick={() =>
                  setTask.mutate({
                    id: instance.id,
                    taskId: t.id,
                    action: t.status === "completed" ? "reopen" : "complete",
                  })
                }
              >
                {t.status === "completed" ? "Reopen" : "Complete"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <ConvertToEmployeeDialog instance={instance} open={convertOpen} onOpenChange={setConvertOpen} />
    </div>
  );
}

export function OnboardingSection() {
  const { can } = usePermissions();
  const canView = can("hrms.onboarding.view");
  const canManage = can("hrms.onboarding.manage");
  const [status, setStatus] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);
  const [templateDialog, setTemplateDialog] = useState<{ open: boolean; template: OnboardingTemplate | null }>({
    open: false,
    template: null,
  });
  const [showTemplates, setShowTemplates] = useState(false);

  const instances = useOnboardingInstances(canView ? status || undefined : undefined);
  const templates = useOnboardingTemplates();
  const deleteTemplate = useDeleteOnboardingTemplate();

  if (!canView) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="You don't have access to onboarding"
          description="Onboarding requires the hrms.onboarding.view permission."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <div className="ml-auto flex gap-2">
          {canManage ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => setShowTemplates((v) => !v)}>
                <ClipboardList className="mr-1 h-4 w-4" /> Templates
              </Button>
              <Button size="sm" onClick={() => setStartOpen(true)}>
                <UserPlus className="mr-1 h-4 w-4" /> Start onboarding
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Onboarding</CardTitle></CardHeader>
        <CardContent className="p-0">
          {instances.isLoading ? (
            <div className="p-4"><SectionSkeleton /></div>
          ) : instances.isError ? (
            <SectionError onRetry={() => instances.refetch()} />
          ) : (instances.data ?? []).length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="No onboarding in progress"
              description="Start an onboarding to generate a checklist for a new joiner."
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium" />
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Template</th>
                  <th className="px-4 py-2 font-medium">Progress</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Start date</th>
                </tr>
              </thead>
              <tbody>
                {(instances.data ?? []).map((o) => {
                  const { done, total, pct } = taskProgress(o);
                  const expanded = expandedId === o.id;
                  return [
                    <tr
                      key={o.id}
                      className="cursor-pointer border-b hover:bg-surface-elevated"
                      onClick={() => setExpandedId(expanded ? null : o.id)}
                    >
                      <td className="w-8 px-4 py-2.5 text-text-muted">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </td>
                      <td className="px-4 py-2.5 text-text">{instanceName(o)}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{o.template?.name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-elevated">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-text-muted">{done}/{total}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-2.5 text-text-secondary">{formatDate(o.startDate)}</td>
                    </tr>,
                    expanded ? (
                      <tr key={`${o.id}-detail`} className="border-b last:border-0">
                        <td colSpan={6} className="p-0">
                          <InstanceDetail instance={o} canManage={canManage} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {canManage && showTemplates ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Templates</CardTitle>
            <Button size="sm" variant="secondary" onClick={() => setTemplateDialog({ open: true, template: null })}>
              <Plus className="mr-1 h-4 w-4" /> New template
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {templates.isLoading ? (
              <div className="p-4"><SectionSkeleton rows={2} /></div>
            ) : (templates.data ?? []).length === 0 ? (
              <p className="p-4 text-xs text-text-muted">No templates yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-text-muted">
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Tasks</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {(templates.data ?? []).map((t) => (
                    <tr key={t.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-text">{t.name}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{t.tasks.length}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={t.isActive ? "active" : "inactive"} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Edit template"
                            onClick={() => setTemplateDialog({ open: true, template: t })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete template"
                            disabled={deleteTemplate.isPending}
                            onClick={() => {
                              if (window.confirm(`Delete template "${t.name}"?`)) deleteTemplate.mutate(t.id);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-error" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <StartOnboardingDialog open={startOpen} onOpenChange={setStartOpen} />
      {templateDialog.open ? (
        <TemplateDialog
          open={templateDialog.open}
          onOpenChange={(o) => setTemplateDialog({ open: o, template: o ? templateDialog.template : null })}
          template={templateDialog.template}
        />
      ) : null}
    </div>
  );
}
