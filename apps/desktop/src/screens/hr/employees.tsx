import { useMemo, useState } from "react";
import {
  Briefcase,
  MoreVertical,
  PlusCircle,
  TrendingUp,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import { useEmployees } from "../../hooks/api";
import { useUIStore } from "../../stores/ui";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { EmployeeFormDialog } from "../hrms/employees";
import { FilterDropdown, PageHeader, Pagination, PrimaryAction } from "./common";
import { SectionError, SectionSkeleton } from "../hrms/common";
import { cn } from "../../lib/utils";
import type { Employee } from "../../lib/api";

function initials(e: Employee) {
  return `${e.firstName} ${e.lastName}`.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
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

export function HrEmployeesScreen() {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const employees = useEmployees();
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  const list = employees.data ?? [];
  const stats = useMemo(() => {
    const now = Date.now();
    const month = 30 * 24 * 60 * 60 * 1000;
    return {
      total: list.length,
      active: list.filter((e) => e.status === "active").length,
      inactive: list.filter((e) => e.status !== "active").length,
      joiners: list.filter(
        (e) => e.joiningDate && now - new Date(e.joiningDate).getTime() < month,
      ).length,
    };
  }, [list]);

  const paged = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Employee" crumbs={["Employee", "Employee Grid"]}>
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
            <FilterDropdown>Designation</FilterDropdown>
            <FilterDropdown label="Sort By : ">Last 7 Days</FilterDropdown>
          </div>
        </div>

        {employees.isLoading ? (
          <div className="p-5">
            <SectionSkeleton rows={5} />
          </div>
        ) : employees.isError ? (
          <SectionError onRetry={() => employees.refetch()} />
        ) : list.length === 0 ? (
          <p className="p-8 text-center text-sm text-text-muted">No employees yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3 2xl:grid-cols-5">
              {paged.map((e) => {
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
                    <button
                      type="button"
                      onClick={(ev) => ev.stopPropagation()}
                      className="absolute right-4 top-4 text-text-muted hover:text-text"
                      aria-label="More options"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

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
            <Pagination page={page} total={list.length} perPage={PAGE_SIZE} onPage={setPage} />
          </>
        )}
      </div>

      <EmployeeFormDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
