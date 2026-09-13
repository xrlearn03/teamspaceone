import { useMemo, useState } from "react";
import { PlusCircle, Trash2 } from "lucide-react";
import {
  useDeleteDesignation,
  useDepartments,
  useDesignations,
  useEmployees,
} from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { DesignationDialog } from "@/screens/hrms/departments";
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

const PAGE_SIZE = 10;

export function HrDesignationsScreen() {
  const { can } = usePermissions();
  const designations = useDesignations();
  const departments = useDepartments();
  const employees = useEmployees();
  const deleteDesignation = useDeleteDesignation();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PAGE_SIZE);
  const [departmentId, setDepartmentId] = useState("");
  const [status, setStatus] = useState("");
  const [range, setRange] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const deptName = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of departments.data ?? []) map.set(d.id, d.name);
    return map;
  }, [departments.data]);

  const headcount = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of employees.data ?? []) {
      if (e.designationId) map.set(e.designationId, (map.get(e.designationId) ?? 0) + 1);
    }
    return map;
  }, [employees.data]);

  const all = designations.data ?? [];
  const filtered = all.filter((d) => {
    if (departmentId && d.departmentId !== departmentId) return false;
    if (status && (status === "active") !== (d.isActive !== false)) return false;
    if (!withinDateRange(d.createdAt, range)) return false;
    if (query) return (d.title ?? d.name ?? "").toLowerCase().includes(query.toLowerCase());
    return true;
  });
  const rows = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Designations" crumbs={["Employee", "Designations"]}>
        {can("hrms.designation.create") && (
          <PrimaryAction icon={PlusCircle} label="Add New Designation" onClick={() => setCreateOpen(true)} />
        )}
      </PageHeader>

      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">Designation List</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              value={departmentId}
              onChange={(v) => { setDepartmentId(v); setPage(1); }}
              options={[
                { value: "", label: "All departments" },
                ...(departments.data ?? []).map((d) => ({ value: d.id, label: d.name })),
              ]}
            >
              Department
            </FilterDropdown>
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

        {designations.isLoading ? (
          <div className="p-5">
            <SectionSkeleton rows={5} />
          </div>
        ) : designations.isError ? (
          <SectionError onRetry={() => designations.refetch()} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead>
                  <tr className="bg-surface-elevated">
                    <th className="w-10 px-4 py-2.5">
                      <input type="checkbox" className="h-4 w-4 rounded border-border" />
                    </th>
                    <th className="px-4 py-2.5 font-semibold text-text">Designation</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Department</th>
                    <th className="px-4 py-2.5 font-semibold text-text">No of Employees</th>
                    <th className="px-4 py-2.5 font-semibold text-text">Status</th>
                    <th className="w-20 px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => (
                    <tr key={d.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <input type="checkbox" className="h-4 w-4 rounded border-border" />
                      </td>
                      <td className="px-4 py-3 font-medium text-text">{d.title ?? d.name}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {(d.departmentId && deptName.get(d.departmentId)) || "—"}
                      </td>
                      <td className="px-4 py-3 text-text-secondary">{headcount.get(d.id) ?? 0}</td>
                      <td className="px-4 py-3">
                        <StatusPill active={d.isActive !== false} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center justify-end gap-3">
                          {can("hrms.designation.delete") && (
                            <button
                              type="button"
                              onClick={() => deleteDesignation.mutate(d.id)}
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
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-text-muted">
                        {query ? "No designations match your search." : "No designations yet."}
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

      {can("hrms.designation.create") && (
        <DesignationDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
    </div>
  );
}
