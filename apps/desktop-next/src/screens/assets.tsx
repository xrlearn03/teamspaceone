import { Calendar, Package, PlusCircle, Search } from "lucide-react";
import { FilterDropdown, PageHeader, PrimaryAction } from "./hr/common";

/**
 * Assets management — visual shell matches the Figma admin design.
 * No assets backend exists yet; the list renders a real empty state until
 * an assets API is available to wire into.
 */
export function AssetsScreen() {
  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Assets" crumbs={["Administration", "Assets"]}>
        <PrimaryAction icon={PlusCircle} label="Add New Asset" />
      </PageHeader>

      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">Assets List</h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs text-text"
            >
              <Calendar className="h-3.5 w-3.5 text-text-muted" />
              dd/mm/yyyy - dd/mm/yyyy
            </button>
            <FilterDropdown>Status</FilterDropdown>
            <FilterDropdown label="Sort By : ">Last 7 Days</FilterDropdown>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span>Row Per Page</span>
            <span className="flex h-7 items-center rounded-md border border-border bg-surface px-2.5 text-xs text-text">
              10
            </span>
            <span>Entries</span>
          </div>
          <div className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 sm:w-56">
            <Search className="h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              placeholder="Search"
              className="w-full bg-transparent text-xs text-text placeholder:text-text-muted focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-col items-center justify-center gap-3 border-t border-border px-5 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
            <Package className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-text">No assets yet</p>
          <p className="max-w-xs text-xs text-text-muted">
            Asset tracking isn&apos;t connected to a backend yet — this list will populate once the
            assets API is available.
          </p>
        </div>
      </div>
    </div>
  );
}
