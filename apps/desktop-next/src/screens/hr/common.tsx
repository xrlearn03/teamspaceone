import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Home,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  crumbs,
  children,
}: {
  title: string;
  crumbs: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-text">{title}</h1>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
          <Home className="h-3.5 w-3.5" />
          {crumbs.map((c, i) => (
            <span key={c} className="flex items-center gap-1.5">
              <span>/</span>
              <span className={i === crumbs.length - 1 ? "text-text" : undefined}>{c}</span>
            </span>
          ))}
        </div>
      </div>
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

export function FilterDropdown({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs text-text"
    >
      {label}
      {children}
      <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
    </button>
  );
}

export function TableToolbar({
  query,
  onQuery,
}: {
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <span>Row Per Page</span>
        <span className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs text-text">
          10
        </span>
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
