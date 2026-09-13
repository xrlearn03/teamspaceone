import { useState } from "react";
import {
  CheckCircle,
  Clock,
  Download,
  FolderKanban,
  LayoutGrid,
  List,
  PlusCircle,
  Ticket,
  TrendingUp,
} from "lucide-react";
import { FilterDropdown, PageHeader, PrimaryAction } from "./hr/common";
import { cn } from "@/lib/utils";

const SPARK = [38, 62, 45, 80, 55, 92, 40, 70, 58, 85, 48, 74];

function StatCard({
  icon: Icon,
  label,
  iconClass,
  softClass,
  barClass,
}: {
  icon: React.ElementType;
  label: string;
  iconClass: string;
  softClass: string;
  barClass: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-col gap-3">
        <div className={cn("flex h-12 w-12 items-center justify-center rounded-full border border-dashed", iconClass)}>
          <div className={cn("flex h-9 w-9 items-center justify-center rounded-full", softClass)}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-text-secondary">{label}</div>
          <div className="mt-0.5 text-lg font-semibold text-text">0</div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-3 self-start">
        <span className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 text-xs", softClass)}>
          <TrendingUp className="h-3 w-3" />
          —
        </span>
        <div className="flex h-14 items-end gap-1">
          {SPARK.map((h, i) => (
            <span
              key={i}
              className={cn("w-1.5 rounded-t-sm", i % 2 === 0 ? barClass : "bg-surface-elevated")}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Tickets — visual shell matches the Figma design. There is no tickets
 * backend yet, so the grid renders a real empty state instead of mock cards.
 */
export function TicketsScreen() {
  const [mode, setMode] = useState<"list" | "grid">("grid");

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Tickets" crumbs={["Employee", "Tickets"]}>
        <div className="flex h-8 overflow-hidden rounded-md border border-border bg-surface">
          <button
            type="button"
            onClick={() => setMode("list")}
            className={cn("flex w-9 items-center justify-center", mode === "list" && "bg-surface-elevated")}
            aria-label="List view"
          >
            <List className="h-4 w-4 text-text" />
          </button>
          <button
            type="button"
            onClick={() => setMode("grid")}
            className={cn("flex w-9 items-center justify-center border-l border-border", mode === "grid" && "bg-surface-elevated")}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4 text-text" />
          </button>
        </div>
        <FilterDropdown>
          <Download className="h-3.5 w-3.5" />
          Export
        </FilterDropdown>
        <PrimaryAction icon={PlusCircle} label="Add New Ticket" />
      </PageHeader>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Ticket} label="New Tickets" iconClass="border-primary text-primary" softClass="bg-primary-subtle text-primary" barClass="bg-primary" />
        <StatCard icon={FolderKanban} label="Open Tickets" iconClass="border-mention text-mention" softClass="bg-mention/10 text-mention" barClass="bg-mention" />
        <StatCard icon={CheckCircle} label="Solved Tickets" iconClass="border-success text-success" softClass="bg-success/10 text-success" barClass="bg-success" />
        <StatCard icon={Clock} label="Pending Tickets" iconClass="border-info text-info" softClass="bg-info/10 text-info" barClass="bg-info" />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">Ticket Grid</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown>Priority</FilterDropdown>
            <FilterDropdown>Select Status</FilterDropdown>
            <FilterDropdown label="Sort By : ">Last 7 Days</FilterDropdown>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
            <Ticket className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium text-text">No tickets yet</p>
          <p className="max-w-xs text-xs text-text-muted">
            Ticketing isn&apos;t connected to a backend yet — tickets will appear here once the API
            is available.
          </p>
        </div>
      </div>
    </div>
  );
}
