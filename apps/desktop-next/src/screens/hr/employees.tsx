import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Eye,
  Mail,
  MoreVertical,
  Pencil,
  PlusCircle,
  TrendingUp,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { useEmployees, useInviteEmployee, useMembers, useTerminateEmployee, useUpdateEmployee, useUsers } from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useUIStore } from "@/stores/ui";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { EmployeeFormDialog, isInternalMember, type Draft } from "@/screens/hrms/employees";
import { Button } from "@teamspace-one/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { Input } from "@teamspace-one/ui/input";
import { toast } from "@/lib/toast";
import {
  DATE_RANGE_OPTIONS,
  FilterDropdown,
  PageHeader,
  Pagination,
  PrimaryAction,
  withinDateRange,
} from "./common";
import { SectionError, SectionSkeleton } from "@/screens/hrms/common";
import { cn } from "@/lib/utils";
import { getActiveOrganisation, type Employee } from "@/lib/api";

function initials(e: { firstName: string; lastName: string }) {
  return `${e.firstName} ${e.lastName}`.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function formatRoleLabel(name?: string | null) {
  return (name ?? "member").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  iconClass: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface p-5">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", iconClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs font-medium text-text-secondary">{label}</div>
        <div className="text-lg font-semibold text-text">{value}</div>
      </div>
      <span className="ml-auto flex items-center gap-1 rounded bg-surface-elevated px-1.5 py-0.5 text-xs text-text-secondary">
        <TrendingUp className="h-3 w-3" />
      </span>
    </div>
  );
}

const PAGE_SIZE = 10;

function InviteEmployeeDialog({
  employee,
  onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  const invite = useInviteEmployee();
  const [email, setEmail] = useState("");

  useEffect(() => {
    setEmail(employee?.workEmail ?? employee?.personalEmail ?? "");
  }, [employee]);

  const name = employee ? `${employee.firstName} ${employee.lastName}`.trim() : "";

  function close() {
    invite.reset();
    onClose();
  }

  function submit() {
    if (!employee) return;
    const trimmed = email.trim();
    if (!trimmed) return;
    invite.mutate(
      { id: employee.id, email: trimmed },
      {
        onSuccess: () => {
          toast.success(`Invitation sent to ${trimmed}`);
          close();
        },
      },
    );
  }

  return (
    <Dialog open={Boolean(employee)} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite {name || "employee"}</DialogTitle>
          <DialogDescription>
            Creates their login account and emails them the sign-in email and a temporary password.
            They must set a new password on first sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Email</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
            />
          </label>
          {invite.error ? <p className="text-sm text-error">{invite.error.message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={submit} disabled={!email.trim() || invite.isPending}>
              {invite.isPending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HrEmployeesScreen() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const organisationId = getActiveOrganisation() ?? undefined;
  const employees = useEmployees();
  const members = useMembers(organisationId);
  const memberUserIds = useMemo(
    () => [...new Set((members.data ?? []).map((m) => m.userId))],
    [members.data],
  );
  const users = useUsers(memberUserIds);
  const [page, setPage] = useState(1);
  const [designationId, setDesignationId] = useState("");
  const [range, setRange] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [inviting, setInviting] = useState<Employee | null>(null);
  const [editingDraft, setEditingDraft] = useState<Draft | null>(null);
  const { can } = usePermissions();
  const updateEmployee = useUpdateEmployee();
  const terminateEmployee = useTerminateEmployee();
  const canEdit = can("hrms.employee.edit");
  const canDelete = can("hrms.employee.delete");

  const list = employees.data ?? [];
  const designationOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of list) {
      if (e.designationId) {
        map.set(e.designationId, e.designationName ?? e.designation?.title ?? e.designation?.name ?? "—");
      }
    }
    return [
      { value: "", label: "All designations" },
      ...[...map.entries()].map(([value, label]) => ({ value, label })),
    ];
  }, [list]);
  const filtered = list.filter((e) => {
    if (designationId && e.designationId !== designationId) return false;
    if (!withinDateRange(e.joiningDate ?? e.createdAt, range)) return false;
    return true;
  });

  // Internal org members without an employee record still belong in the grid —
  // without them HR can't see (or onboard) their own account.
  const employeeUserIds = useMemo(
    () => new Set(list.map((e) => e.userId).filter(Boolean) as string[]),
    [list],
  );
  const userMap = useMemo(
    () => new Map((users.data ?? []).map((u) => [u.id, u])),
    [users.data],
  );
  const drafts = useMemo<Draft[]>(
    () =>
      (members.data ?? [])
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
            roleName: m.role?.name ?? "member",
            createdAt: m.createdAt,
          };
        }),
    [members.data, employeeUserIds, userMap],
  );
  const draftRows = drafts.filter(
    (d) => !designationId && withinDateRange(d.createdAt, range),
  );

  const stats = useMemo(() => {
    const now = Date.now();
    const month = 30 * 24 * 60 * 60 * 1000;
    return {
      total: list.length + drafts.length,
      active: list.filter((e) => e.status === "active").length + drafts.length,
      inactive: list.filter((e) => e.status !== "active").length,
      joiners:
        list.filter((e) => e.joiningDate && now - new Date(e.joiningDate).getTime() < month).length +
        drafts.filter((d) => d.createdAt && now - new Date(d.createdAt).getTime() < month).length,
    };
  }, [list, drafts]);

  const rows: Array<Employee | Draft> = [...filtered, ...draftRows];
  const paged = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Employee">
        <PrimaryAction icon={PlusCircle} label="Add New Employee" onClick={() => setAddOpen(true)} />
      </PageHeader>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Briefcase} label="Total Employee" value={stats.total} iconClass="bg-primary text-white" />
        <StatCard icon={UserCheck} label="Active" value={stats.active} iconClass="bg-success text-white" />
        <StatCard icon={UserX} label="InActive" value={stats.inactive} iconClass="bg-error text-white" />
        <StatCard icon={UserPlus} label="New Joiners" value={stats.joiners} iconClass="bg-info text-white" />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">Employees Grid</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              value={designationId}
              onChange={(v) => { setDesignationId(v); setPage(1); }}
              options={designationOptions}
            >
              Designation
            </FilterDropdown>
            <FilterDropdown
              label="Sort By : "
              value={range}
              onChange={(v) => { setRange(v); setPage(1); }}
              options={DATE_RANGE_OPTIONS}
            />
          </div>
        </div>

        {employees.isLoading || members.isLoading ? (
          <div className="p-5">
            <SectionSkeleton rows={5} />
          </div>
        ) : employees.isError ? (
          <SectionError onRetry={() => employees.refetch()} />
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-muted">
            {list.length === 0 && drafts.length === 0 ? "No employees yet." : "No employees match the selected filters."}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 2xl:grid-cols-5">
              {paged.map((row) => {
                if ("isDraft" in row) {
                  const d = row;
                  return (
                    <div
                      key={d.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditingDraft(d)}
                      onKeyDown={(ev) => ev.key === "Enter" && setEditingDraft(d)}
                      className="relative cursor-pointer rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40"
                    >
                      <input
                        type="checkbox"
                        onClick={(ev) => ev.stopPropagation()}
                        className="absolute left-4 top-4 h-4 w-4 rounded border-border"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            onClick={(ev) => ev.stopPropagation()}
                            className="absolute right-4 top-4 text-text-muted hover:text-text"
                            aria-label="More options"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setEditingDraft(d)}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Complete profile
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <div className="flex flex-col items-center pt-1">
                        <div className="relative">
                          <div className="rounded-full border-2 border-border p-0.5">
                            <Avatar className="h-14 w-14">
                              <AvatarFallback>{initials(d)}</AvatarFallback>
                            </Avatar>
                          </div>
                          <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-offline" />
                        </div>
                        <div className="mt-2 text-sm font-bold text-text">
                          {d.firstName} {d.lastName}
                        </div>
                        <span className="mt-1 rounded bg-mention/10 px-2 py-0.5 text-xs font-medium text-mention">
                          {formatRoleLabel(d.roleName)}
                        </span>
                      </div>

                      <div className="mt-4 flex items-center justify-between text-xs">
                        <span className="text-text-secondary">Department</span>
                        <span className="font-medium text-text">—</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-text-secondary">Employee No</span>
                        <span className="font-medium text-text">—</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-text-secondary">Status</span>
                        <span className="inline-flex items-center gap-1.5 rounded bg-warning/10 px-2 py-0.5 font-medium text-warning">
                          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                          No profile
                        </span>
                      </div>
                    </div>
                  );
                }
                const e = row;
                const role = e.designationName ?? e.designation?.title ?? e.designation?.name ?? "—";
                return (
                  <div
                    key={e.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setActiveView("employee-detail", { employeeId: e.id })}
                    onKeyDown={(ev) => ev.key === "Enter" && setActiveView("employee-detail", { employeeId: e.id })}
                    className="relative cursor-pointer rounded-lg border border-border bg-surface p-4 transition-colors hover:border-primary/40"
                  >
                    <input
                      type="checkbox"
                      onClick={(ev) => ev.stopPropagation()}
                      className="absolute left-4 top-4 h-4 w-4 rounded border-border"
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          onClick={(ev) => ev.stopPropagation()}
                          className="absolute right-4 top-4 text-text-muted hover:text-text"
                          aria-label="More options"
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => setActiveView("employee-detail", { employeeId: e.id })}
                          className="flex items-center gap-2 text-xs"
                        >
                          <Eye className="h-3.5 w-3.5" /> View profile
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem
                            onClick={() => setEditing(e)}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </DropdownMenuItem>
                        )}
                        {canEdit && !e.userId && e.status !== "terminated" && (
                          <DropdownMenuItem
                            onClick={() => setInviting(e)}
                            className="flex items-center gap-2 text-xs"
                          >
                            <Mail className="h-3.5 w-3.5" /> Invite
                          </DropdownMenuItem>
                        )}
                        {canEdit && e.status !== "terminated" && (
                          <DropdownMenuItem
                            onClick={() =>
                              updateEmployee.mutate({
                                id: e.id,
                                body: { status: e.status === "active" ? "inactive" : "active" },
                              })
                            }
                            className="flex items-center gap-2 text-xs"
                          >
                            {e.status === "active" ? (
                              <>
                                <UserX className="h-3.5 w-3.5" /> Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3.5 w-3.5" /> Activate
                              </>
                            )}
                          </DropdownMenuItem>
                        )}
                        {canDelete && e.status !== "terminated" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                const name = `${e.firstName} ${e.lastName}`.trim();
                                if (window.confirm(`Terminate ${name}? This sets their status to terminated.`)) {
                                  terminateEmployee.mutate(e.id);
                                }
                              }}
                              className="flex items-center gap-2 text-xs text-error"
                            >
                              <UserX className="h-3.5 w-3.5" /> Terminate
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <div className="flex flex-col items-center pt-1">
                      <div className="relative">
                        <div className="rounded-full border-2 border-primary p-0.5">
                          <Avatar className="h-14 w-14">
                            <AvatarFallback>{initials(e)}</AvatarFallback>
                          </Avatar>
                        </div>
                        <span
                          className={cn(
                            "absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-surface",
                            e.status === "active" ? "bg-online" : "bg-offline",
                          )}
                        />
                      </div>
                      <div className="mt-2 text-sm font-bold text-text">
                        {e.firstName} {e.lastName}
                      </div>
                      <span className="mt-1 rounded bg-mention/10 px-2 py-0.5 text-xs font-medium text-mention">
                        {role}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs">
                      <span className="text-text-secondary">Department</span>
                      <span className="font-medium text-text">
                        {e.departmentName ?? e.department?.name ?? "—"}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-text-secondary">Employee No</span>
                      <span className="font-medium text-text">{e.employeeNumber ?? "—"}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-text-secondary">Status</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded px-2 py-0.5 font-medium",
                          e.status === "active" ? "bg-success/10 text-success" : "bg-error/10 text-error",
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", e.status === "active" ? "bg-success" : "bg-error")} />
                        {e.status === "active" ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination page={page} total={rows.length} perPage={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </div>

      <EmployeeFormDialog open={addOpen} onOpenChange={setAddOpen} availableDrafts={drafts} />
      <EmployeeFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        employee={editing}
        availableDrafts={drafts}
      />
      <EmployeeFormDialog
        open={Boolean(editingDraft)}
        onOpenChange={(open) => {
          if (!open) setEditingDraft(null);
        }}
        draft={editingDraft ?? undefined}
      />
      <InviteEmployeeDialog employee={inviting} onClose={() => setInviting(null)} />
    </div>
  );
}
