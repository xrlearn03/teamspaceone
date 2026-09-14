import { useState } from "react";
import { Pencil, PlusCircle, Trash2 } from "lucide-react";
import { useDeleteDepartment, useDepartments } from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { DepartmentDialog } from "@/screens/hrms/departments";
import {
  DATE_RANGE_OPTIONS,
  FilterDropdown,
  PageHeader,
  Pagination,
  PrimaryAction,
  StatusPill,
  TableToolbar,
  withinDateRange,
} from "./common";
import { SectionError, SectionSkeleton } from "@/screens/hrms/common";
import type { Department } from "@/lib/api";

const PAGE_SIZE = 10;

export function HrDepartmentsScreen() {
  const { can } = usePermissions();
  const departments = useDepartments();
  const deleteDepartment = useDeleteDepartment();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);
  const [status, setStatus] = useState("");
  const [range, setRange] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);

  const all = departments.data ?? [];
  const filtered = all.filter((d) => {
    if (status && (status === "active") !== (d.isActive !== false)) return false;
    if (!withinDateRange(d.createdAt, range)) return false;
    if (query) return d.name.toLowerCase().includes(query.toLowerCase());
    return true;
  });
  const rows = filtered.slice((page - 1) * perPage, page * perPage);
  const canManage = can("hrms.department.create") || can("hrms.department.edit");

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Departments">
        {can("hrms.department.create") && (
          <PrimaryAction icon={PlusCircle} label="Add New Department" onClick={() => setCreateOpen(true)} />
        )}
      </PageHeader>

      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">Department List</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              value={status}
              onChange={(v) => { setStatus(v); setPage(1); }}
              options={[
                { value: "", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            >
              Select Status
            </FilterDropdown>
            <FilterDropdown
              label="Sort By : "
              value={range}
              onChange={(v) => { setRange(v); setPage(1); }}
              options={DATE_RANGE_OPTIONS}
            />
          </div>
        </div>

        <TableToolbar
          query={query}
          onQuery={(q) => { setQuery(q); setPage(1); }}
          perPage={perPage}
          onPerPage={(n) => { setPerPage(n); setPage(1); }}
        />

        {departments.isLoading ? (
          <div className="p-5">
            <SectionSkeleton rows={5} />
          </div>
        ) : departments.isError ? (
          <SectionError onRetry={() => departments.refetch()} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="bg-surface-elevated">
                    <th className="w-10 px-4 py-2.5">
                      <input type="checkbox" className="h-4 w-4 rounded border-border" />
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-text">Department</th>
                    <th className="px-4 py-2.5 font-semibold text-text">No of Employees</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Status</th>
                    <th className="w-24 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <input type="checkbox" className="h-4 w-4 rounded border-border" />
                      </td>
                      <td className="px-4 py-3 font-medium text-text">{d.name}</td>
                      <td className="px-4 py-3 text-text-secondary">{d.memberCount ?? 0}</td>
                      <td className="px-4 py-3">
                        <StatusPill active={d.isActive !== false} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center justify-end gap-3">
                          {can("hrms.department.edit") && (
                            <button
                              type="button"
                              onClick={() => setEditing(d)}
                              className="text-text-muted hover:text-text"
                              aria-label="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {can("hrms.department.delete") && (
                            <button
                              type="button"
                              onClick={() => deleteDepartment.mutate(d.id)}
                              className="text-text-muted hover:text-error"
                              aria-label="Delete"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-text-muted">
                        {query ? "No departments match your search." : "No departments yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} perPage={perPage} onPage={setPage} />
          </>
        )}
      </div>

      {canManage && (
        <>
          <DepartmentDialog open={createOpen} onOpenChange={setCreateOpen} />
          <DepartmentDialog
            open={Boolean(editing)}
            onOpenChange={(o) => !o && setEditing(null)}
            department={editing}
          />
        </>
      )}
    </div>
  );
}
