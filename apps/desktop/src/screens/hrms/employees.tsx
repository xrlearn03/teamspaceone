import { useState } from "react";
import { ArrowLeft, Pencil, Search, UserPlus, Users } from "lucide-react";
import {
  useCreateEmployee,
  useDepartments,
  useDesignations,
  useEmployee,
  useEmployeeDocuments,
  useEmployees,
  useUpdateEmployee,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import type { Employee } from "../../lib/api";
import { Avatar, AvatarFallback } from "../../components/ui/avatar";
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

function employeeName(e: Pick<Employee, "firstName" | "lastName">) {
  return `${e.firstName} ${e.lastName}`.trim();
}

function employeeDept(e: Employee) {
  return e.department?.name ?? e.departmentName ?? "—";
}

function employeeTitle(e: Employee) {
  return e.designation?.title ?? e.designation?.name ?? e.designationName ?? "—";
}

interface EmployeeFormState {
  firstName: string;
  lastName: string;
  workEmail: string;
  phone: string;
  departmentId: string;
  designationId: string;
  joiningDate: string;
  employmentType: string;
  employeeNumber: string;
}

const EMPTY_FORM: EmployeeFormState = {
  firstName: "",
  lastName: "",
  workEmail: "",
  phone: "",
  departmentId: "",
  designationId: "",
  joiningDate: "",
  employmentType: "full_time",
  employeeNumber: "",
};

function EmployeeFormDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: Employee | null;
}) {
  const [form, setForm] = useState<EmployeeFormState>(
    employee
      ? {
          firstName: employee.firstName,
          lastName: employee.lastName,
          workEmail: employee.workEmail ?? "",
          phone: employee.phone ?? "",
          departmentId: employee.departmentId ?? "",
          designationId: employee.designationId ?? "",
          joiningDate: employee.joiningDate?.slice(0, 10) ?? "",
          employmentType: employee.employmentType || "full_time",
          employeeNumber: employee.employeeNumber ?? "",
        }
      : EMPTY_FORM,
  );
  const departments = useDepartments();
  const designations = useDesignations();
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const busy = createEmployee.isPending || updateEmployee.isPending;

  function field<K extends keyof EmployeeFormState>(key: K, value: EmployeeFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    if (!form.firstName.trim() || !form.lastName.trim()) return;
    const body = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      workEmail: form.workEmail || undefined,
      phone: form.phone || undefined,
      departmentId: form.departmentId || undefined,
      designationId: form.designationId || undefined,
      joiningDate: form.joiningDate || undefined,
      employmentType: form.employmentType || undefined,
      employeeNumber: form.employeeNumber || undefined,
    };
    if (employee) {
      updateEmployee.mutate(
        { id: employee.id, body },
        { onSuccess: () => onOpenChange(false) },
      );
    } else {
      createEmployee.mutate(body, { onSuccess: () => onOpenChange(false) });
    }
  }

  const label = "text-xs font-medium text-text-secondary";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{employee ? "Edit employee" : "Add employee"}</DialogTitle>
          <DialogDescription>
            {employee ? "Update this employee's record." : "Create a new employee record."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 p-4 pt-2">
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
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !form.firstName.trim() || !form.lastName.trim()}>
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

export function EmployeesSection() {
  const { can } = usePermissions();
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const departments = useDepartments();
  const employees = useEmployees({
    search: search || undefined,
    departmentId: departmentId || undefined,
  });

  if (selectedId) {
    return <EmployeeDetail employeeId={selectedId} onBack={() => setSelectedId(null)} />;
  }

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
          {employees.isLoading ? (
            <div className="p-4"><SectionSkeleton /></div>
          ) : employees.isError ? (
            <SectionError onRetry={() => employees.refetch()} />
          ) : (employees.data ?? []).length === 0 ? (
            <EmptyState
              icon={Users}
              title="No employees found"
              description="Try a different search, or add the first employee."
            />
          ) : (
            <table className="w-full text-sm">
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
                {(employees.data ?? []).map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-surface-elevated"
                    onClick={() => setSelectedId(e.id)}
                  >
                    <td className="px-4 py-2.5 text-text">{employeeName(e)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{employeeTitle(e)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{employeeDept(e)}</td>
                    <td className="px-4 py-2.5 text-text-secondary">{e.employmentType}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <EmployeeFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
