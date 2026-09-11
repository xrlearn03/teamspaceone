import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Search, UserPlus, Users } from "lucide-react";
import {
  useActiveOrganisation,
  useCreateEmployee,
  useDepartments,
  useDesignations,
  useEmployee,
  useEmployeeDocuments,
  useEmployees,
  useMembers,
  useUpdateEmployee,
  useUsers,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import type { Employee, OrganisationMember, UserDto } from "../../lib/api";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { Badge } from "@teamspace-one/ui/badge";
import { Button } from "@teamspace-one/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@teamspace-one/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Input } from "@teamspace-one/ui/input";
import { SectionError, SectionSkeleton, StatusBadge, formatDate } from "./common";

function employeeName(e: Pick<Employee, "firstName" | "lastName">) {
  return `${e.firstName} ${e.lastName}`.trim();
}

function employeeDept(e: Employee) {
  return e.department?.name ?? e.departmentName ?? "—";
}

function employeeTitle(e: Employee) {
  return e.designation?.title ?? e.designation?.name ?? e.designationName ?? "—";
}

interface Draft {
  isDraft: true;
  id: string;
  userId: string;
  membershipId: string;
  firstName: string;
  lastName: string;
  workEmail: string | null;
  phone: string | null;
}

interface EmployeeFormState {
  userId: string;
  membershipId: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  phone: string;
  departmentId: string;
  designationId: string;
  managerEmployeeId: string;
  joiningDate: string;
  employmentType: string;
  employeeNumber: string;
  status: string;
}

const EMPTY_FORM: EmployeeFormState = {
  userId: "",
  membershipId: "",
  firstName: "",
  lastName: "",
  workEmail: "",
  phone: "",
  departmentId: "",
  designationId: "",
  managerEmployeeId: "",
  joiningDate: "",
  employmentType: "full_time",
  employeeNumber: "",
  status: "active",
};

function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
  draft,
  availableDrafts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee | null;
  draft?: Draft | null;
  availableDrafts?: Draft[];
}) {
  const init = (): EmployeeFormState => {
    if (employee) {
      return {
        userId: employee.userId,
        membershipId: "",
        firstName: employee.firstName,
        lastName: employee.lastName,
        workEmail: employee.workEmail ?? "",
        phone: employee.phone ?? "",
        departmentId: employee.departmentId ?? "",
        designationId: employee.designationId ?? "",
        managerEmployeeId: employee.managerEmployeeId ?? "",
        joiningDate: employee.joiningDate?.slice(0, 10) ?? "",
        employmentType: employee.employmentType || "full_time",
        employeeNumber: employee.employeeNumber ?? "",
        status: employee.status || "active",
      };
    }
    if (draft) {
      return {
        userId: draft.userId,
        membershipId: draft.membershipId,
        firstName: draft.firstName,
        lastName: draft.lastName,
        workEmail: draft.workEmail ?? "",
        phone: draft.phone ?? "",
        departmentId: "",
        designationId: "",
        managerEmployeeId: "",
        joiningDate: "",
        employmentType: "full_time",
        employeeNumber: "",
        status: "active",
      };
    }
    return EMPTY_FORM;
  };

  const [form, setForm] = useState<EmployeeFormState>(init);
  const departments = useDepartments();
  const designations = useDesignations();
  const allEmployees = useEmployees();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const busy = createEmployee.isPending || updateEmployee.isPending;

  useEffect(() => {
    setForm(init());
  }, [employee?.id, draft?.id, open]);

  function field<K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function pickDraft(userId: string) {
    const selected = (availableDrafts ?? []).find((d) => d.userId === userId) ?? draft;
    if (!selected) return;
    setForm({
      ...form,
      userId: selected.userId,
      membershipId: selected.membershipId,
      firstName: selected.firstName,
      lastName: selected.lastName,
      workEmail: selected.workEmail ?? "",
      phone: selected.phone ?? "",
    });
  }

  function submit() {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    if (employee) {
      const body = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        workEmail: form.workEmail || undefined,
        phone: form.phone || undefined,
        departmentId: form.departmentId || undefined,
        designationId: form.designationId || undefined,
        managerEmployeeId: form.managerEmployeeId || undefined,
        joiningDate: form.joiningDate || undefined,
        employmentType: form.employmentType || undefined,
        employeeNumber: form.employeeNumber || undefined,
        status: form.status || undefined,
      };
      updateEmployee.mutate(
        { id: employee.id, body },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      if (!form.userId) return;
      const body = {
        userId: form.userId,
        membershipId: form.membershipId || undefined,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        workEmail: form.workEmail || undefined,
        phone: form.phone || undefined,
        departmentId: form.departmentId || undefined,
        designationId: form.designationId || undefined,
        managerEmployeeId: form.managerEmployeeId || undefined,
        joiningDate: form.joiningDate || undefined,
        employmentType: form.employmentType || undefined,
        employeeNumber: form.employeeNumber || undefined,
        status: form.status || undefined,
      };
      createEmployee.mutate(body, { onSuccess: () => onOpenChange(false) });
    }
  }

  const label = "text-xs font-medium text-text-secondary";
  const selectingMember = !employee && !draft;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{employee ? "Edit employee" : draft ? "Edit draft employee" : "Add employee"}</DialogTitle>
          <DialogDescription>
            {employee
              ? "Update this employee's record."
              : draft
                ? "Complete this employee's record."
                : "Create a new employee record."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 pt-2">
          {selectingMember ? (
            <label className="col-span-2 flex flex-col gap-1">
              <span className={label}>Member *</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm text-text"
                value={form.userId}
                onChange={(e) => pickDraft(e.target.value)}
              >
                <option value="">Select an invited member…</option>
                {(availableDrafts ?? []).map((d) => (
                  <option key={d.userId} value={d.userId}>
                    {employeeName(d)} {d.workEmail ? `(${d.workEmail})` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className={label}>First name *</span>
            <Input value={form.firstName} onChange={(e) => field("firstName", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Last name *</span>
            <Input value={form.lastName} onChange={(e) => field("lastName", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Work email</span>
            <Input type="email" value={form.workEmail} onChange={(e) => field("workEmail", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Phone</span>
            <Input value={form.phone} onChange={(e) => field("phone", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Department</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm text-text"
              value={form.departmentId}
              onChange={(e) => field("departmentId", e.target.value)}
            >
              <option value="">None</option>
              {(departments.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Designation</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm text-text"
              value={form.designationId}
              onChange={(e) => field("designationId", e.target.value)}
            >
              <option value="">None</option>
              {(designations.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>{d.title ?? d.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Joining date</span>
            <Input type="date" value={form.joiningDate} onChange={(e) => field("joiningDate", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Employment type</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm text-text"
              value={form.employmentType}
              onChange={(e) => field("employmentType", e.target.value)}
            >
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Employee number</span>
            <Input value={form.employeeNumber} onChange={(e) => field("employeeNumber", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Manager</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm text-text"
              value={form.managerEmployeeId}
              onChange={(e) => field("managerEmployeeId", e.target.value)}
            >
              <option value="">None</option>
              {(allEmployees.data ?? []).filter((e) => e.id !== employee?.id).map((e) => (
                <option key={e.id} value={e.id}>{employeeName(e)}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={label}>Status</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm text-text"
              value={form.status}
              onChange={(e) => field("status", e.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_leave">On leave</option>
              <option value="terminated">Terminated</option>
            </select>
          </label>
        </div>
        {createEmployee.error || updateEmployee.error ? (
          <p className="px-4 text-sm text-error">{(createEmployee.error ?? updateEmployee.error)?.message}</p>
        ) : null}
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={busy || !form.firstName.trim() || !form.lastName.trim() || (!employee && !form.userId)}
          >
            {employee ? "Save changes" : "Add employee"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeDetail({ employeeId, onBack }: { employeeId: string; onBack: () => void }) {
  const { can } = usePermissions();
  const { data: employee, isLoading, isError, refetch } = useEmployee(employeeId);
  const documents = useEmployeeDocuments(employeeId);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) return <SectionSkeleton />;
  if (isError || !employee) {
    return <SectionError onRetry={() => refetch()} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to directory
        </Button>
        {can("hrms.employee.edit") ? (
          <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg">
              {employeeName(employee).slice(0, 1).toUpperCase() || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-text">{employeeName(employee)}</h2>
              <StatusBadge status={employee.status} />
            </div>
            <p className="text-sm text-text-secondary">
              {employeeTitle(employee)} · {employeeDept(employee)}
            </p>
            {employee.employeeNumber ? (
              <p className="text-xs text-text-muted">#{employee.employeeNumber}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            <p><span className="text-text-muted">Email: </span>{employee.workEmail ?? "—"}</p>
            <p><span className="text-text-muted">Phone: </span>{employee.phone ?? "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Employment</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-1.5 text-sm">
            <p><span className="text-text-muted">Joining date: </span>{formatDate(employee.joiningDate)}</p>
            <p><span className="text-text-muted">Type: </span><Badge variant="secondary">{employee.employmentType}</Badge></p>
            <p>
              <span className="text-text-muted">Manager: </span>
              {employee.manager
                ? `${employee.manager.firstName ?? ""} ${employee.manager.lastName ?? ""}`.trim() || "—"
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
        <CardContent>
          {documents.isLoading ? (
            <SectionSkeleton rows={2} />
          ) : (documents.data ?? []).length === 0 ? (
            <p className="text-xs text-text-muted">No documents on file.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {(documents.data ?? []).map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span className="truncate text-text">{d.name ?? d.fileId}</span>
                  <span className="text-xs text-text-muted">{d.category ?? "document"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <EmployeeFormDialog open={editOpen} onOpenChange={setEditOpen} employee={employee} />
    </div>
  );
}

function isInternalMember(m: OrganisationMember) {
  return m.role.roleCategory !== "external" && m.role.roleCategory !== "guest";
}

export function EmployeesSection() {
  const { can } = usePermissions();
  const { id: orgId } = useActiveOrganisation();
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);

  const departments = useDepartments();
  const employees = useEmployees({
    search: search || undefined,
    departmentId: departmentId || undefined,
  });
  const directoryEmployees = useEmployees();
  const members = useMembers(orgId ?? undefined);
  const memberUserIds = useMemo(
    () => [...new Set((members.data ?? []).map((m) => m.userId))],
    [members.data],
  );
  const users = useUsers(memberUserIds);

  const userMap = useMemo(() => {
    const map = new Map<string, UserDto>();
    (users.data ?? []).forEach((u) => map.set(u.id, u));
    return map;
  }, [users.data]);

  const employeeUserIds = useMemo(
    () => new Set((directoryEmployees.data ?? []).map((e) => e.userId)),
    [directoryEmployees.data],
  );

  const drafts = useMemo<Draft[]>(() => {
    return (members.data ?? [])
      .filter((m) => isInternalMember(m) && !employeeUserIds.has(m.userId))
      .map((m) => {
        const u = userMap.get(m.userId);
        return {
          isDraft: true,
          id: m.id,
          userId: m.userId,
          membershipId: m.id,
          firstName: u?.firstName ?? u?.email?.split("@")[0] ?? "Unknown",
          lastName: u?.lastName ?? "",
          workEmail: u?.email ?? null,
          phone: null,
        };
      });
  }, [members.data, employeeUserIds, userMap]);

  const allRows = useMemo(() => {
    const term = search.toLowerCase().trim();
    const employeesFiltered = (employees.data ?? []).filter((e) => {
      if (!term) return true;
      const text = `${e.firstName} ${e.lastName} ${e.workEmail ?? ""} ${e.employeeNumber ?? ""}`.toLowerCase();
      return text.includes(term);
    });
    const draftsFiltered = term
      ? drafts.filter((d) =>
          `${d.firstName} ${d.lastName} ${d.workEmail ?? ""}`.toLowerCase().includes(term)
        )
      : drafts;
    return [...employeesFiltered, ...draftsFiltered];
  }, [employees.data, drafts, search]);

  if (selectedId) {
    return <EmployeeDetail employeeId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  const isLoading = employees.isLoading || directoryEmployees.isLoading || members.isLoading || users.isLoading;
  const isError = employees.isError || directoryEmployees.isError || members.isError || users.isError;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search employees"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm text-text"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        >
          <option value="">All departments</option>
          {(departments.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {can("hrms.employee.create") ? (
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" /> Add employee
          </Button>
        ) : null}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4"><SectionSkeleton /></div>
          ) : isError ? (
            <SectionError onRetry={() => { employees.refetch(); directoryEmployees.refetch(); members.refetch(); users.refetch(); }} />
          ) : allRows.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No employees found"
              description="Try a different search, or add the first employee."
            />
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Designation</th>
                  <th className="px-4 py-2 font-medium">Department</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {allRows.map((row) => {
                  const isDraft = "isDraft" in row;
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b last:border-0 hover:bg-surface-elevated"
                      onClick={() => {
                        if (isDraft) {
                          setEditingDraft(row as Draft);
                        } else {
                          setSelectedId(row.id);
                        }
                      }}
                    >
                      <td className="px-4 py-2.5 text-text">{employeeName(row as Employee)}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{isDraft ? "—" : employeeTitle(row as Employee)}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{isDraft ? "—" : employeeDept(row as Employee)}</td>
                      <td className="px-4 py-2.5 text-text-secondary">{isDraft ? "—" : (row as Employee).employmentType}</td>
                      <td className="px-4 py-2.5"><StatusBadge status={isDraft ? "draft" : (row as Employee).status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      <EmployeeFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        availableDrafts={drafts}
      />
      <EmployeeFormDialog
        open={!!editingDraft}
        onOpenChange={(open) => { if (!open) setEditingDraft(null); }}
        draft={editingDraft ?? undefined}
      />
    </div>
  );
}
