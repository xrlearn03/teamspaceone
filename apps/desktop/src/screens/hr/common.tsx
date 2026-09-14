import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { cn } from "../../lib/utils";

export function PageHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <h1 className="text-2xl font-bold text-text">{title}</h1>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function PrimaryAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-hover"
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

/** Presets shared by the "Sort By" period dropdowns on HR list screens. */
export const DATE_RANGE_OPTIONS: FilterOption[] = [
  { value: "all", label: "All time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

/** True when an ISO timestamp falls inside a DATE_RANGE_OPTIONS value. */
export function withinDateRange(iso: string | null | undefined, range: string) {
  if (!range || range === "all") return true;
  if (!iso) return false;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 0;
  if (!days) return true;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  return ts >= Date.now() - days * 86400000;
}

export function FilterDropdown({
  label,
  value,
  onChange,
  options,
  children,
}: {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  options?: FilterOption[];
  children?: React.ReactNode;
}) {
  const selected = options?.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs text-text"
        >
          {label}
          {selected?.label ?? children}
          <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {(options ?? []).map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => onChange?.(option.value)}
            className="flex items-center justify-between gap-3 text-xs"
          >
            {option.label}
            {option.value === value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const PAGE_SIZE_OPTIONS: FilterOption[] = [
  { value: "10", label: "10" },
  { value: "25", label: "25" },
  { value: "50", label: "50" },
];

export function TableToolbar({
  query,
  onQuery,
  perPage,
  onPerPage,
}: {
  query: string;
  onQuery: (q: string) => void;
  perPage?: number;
  onPerPage?: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <span>Row Per Page</span>
        {onPerPage ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs text-text"
              >
                {perPage ?? 10}
                <ChevronDown className="h-3 w-3 text-text-muted" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {PAGE_SIZE_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => onPerPage(Number(option.value))}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  {option.label}
                  {Number(option.value) === perPage ? (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <span className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs text-text">
            {perPage ?? 10}
          </span>
        )}
        <span>Entries</span>
      </div>
      <div className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 sm:w-56">
        <Search className="h-3.5 w-3.5 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search"
          className="w-full bg-transparent text-xs text-text placeholder:text-text-muted focus:outline-none"
        />
      </div>
    </div>
  );
}

export function Pagination({
  page,
  total,
  perPage,
  onPage,
}: {
  page: number;
  total: number;
  perPage: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const nums: number[] = [];
  for (let n = 1; n <= pages && nums.length < 4; n++) nums.push(n);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
      <span className="text-sm text-text-secondary">
        Showing {from} to {to} of {total} entries
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="flex h-7 w-7 items-center justify-center text-text-muted disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {nums.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onPage(n)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs",
              page === n ? "bg-primary text-white" : "text-text hover:bg-surface-elevated",
            )}
          >
            {n}
          </button>
        ))}
        {pages > 4 && <span className="px-1 text-xs text-text-muted">…</span>}
        {pages > 4 && (
          <button
            type="button"
            onClick={() => onPage(pages)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs text-text hover:bg-surface-elevated"
          >
            {pages}
          </button>
        )}
        <button
          type="button"
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page === pages}
          className="flex h-7 w-7 items-center justify-center text-text-muted disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium text-white",
        active ? "bg-success" : "bg-error",
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
      {active ? "Active" : "Inactive"}
    </span>
  );
}
