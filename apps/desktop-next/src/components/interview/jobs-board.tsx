import { useMemo, useState } from "react";
import {
  Archive,
  Briefcase,
  ChevronDown,
  CircleDot,
  Globe,
  MapPin,
  MoreHorizontal,
  PauseCircle,
  Plus,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { JobOpening } from "@/lib/api";
import { useCandidates, useJobOpenings, useUpdateJobOpening } from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { CreateJobDialog } from "./create-dialogs";

const PAGE_SIZES = [10, 25, 50];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  on_hold: "On Hold",
  closed: "Closed",
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

function formatPosted(iso: string) {
  const date = new Date(iso);
  const posted = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const ago =
    days <= 0 ? "today" : days === 1 ? "1 day ago" : days < 30 ? `${days} days ago` : days < 365 ? `${Math.floor(days / 30)} mo ago` : `${Math.floor(days / 365)} yr ago`;
  return { posted, ago };
}

interface JobRow {
  job: JobOpening;
  applicants: string[];
  applicantCount: number;
}

export function JobsBoard() {
  const { data: jobs, isLoading, isError, refetch } = useJobOpenings();
  const { data: candidates } = useCandidates();
  const { can } = usePermissions();
  const canEdit = can("interview.job.edit");

  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [location, setLocation] = useState("all");
  const [jobType, setJobType] = useState("all");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = useMemo<JobRow[]>(() => {
    const byJob = new Map<string, string[]>();
    for (const c of candidates ?? []) {
      for (const a of c.applications ?? []) {
        const list = byJob.get(a.jobOpeningId) ?? [];
        list.push(c.name);
        byJob.set(a.jobOpeningId, list);
      }
    }
    return (jobs ?? []).map((job) => {
      const applicants = byJob.get(job.id) ?? [];
      return { job, applicants, applicantCount: applicants.length };
    });
  }, [jobs, candidates]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      open: rows.filter((r) => r.job.status === "open").length,
      onHold: rows.filter((r) => r.job.status === "on_hold").length,
      closed: rows.filter((r) => r.job.status === "closed").length,
      newThisWeek: rows.filter(
        (r) => Date.now() - new Date(r.job.createdAt).getTime() < 7 * 86_400_000,
      ).length,
    }),
    [rows],
  );

  const departmentOptions = useMemo(
    () => [...new Set(rows.map((r) => r.job.departmentName).filter((d): d is string => Boolean(d)))],
    [rows],
  );
  const locationOptions = useMemo(
    () => [...new Set(rows.map((r) => r.job.location).filter((l): l is string => Boolean(l)))],
    [rows],
  );
  const typeOptions = useMemo(
    () => [...new Set(rows.map((r) => r.job.employmentType).filter((t): t is string => Boolean(t)))],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(({ job }) => {
      if (department !== "all" && job.departmentName !== department) return false;
      if (location !== "all" && job.location !== location) return false;
      if (jobType !== "all" && job.employmentType !== jobType) return false;
      if (status !== "all" && job.status !== status) return false;
      if (!q) return true;
      return [job.title, job.id, job.departmentName ?? "", job.location ?? "", job.workplaceType ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, department, location, jobType, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageIds = pageRows.map((r) => r.job.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clearFilters() {
    setSearch("");
    setDepartment("all");
    setLocation("all");
    setJobType("all");
    setStatus("all");
    setPage(1);
  }

  const metrics = [
    {
      title: "Total Jobs",
      value: counts.total,
      change: counts.newThisWeek > 0 ? `+${counts.newThisWeek}` : undefined,
      footer: "new this week",
      icon: <Briefcase size={28} />,
      iconClass: "bg-info/10 text-info",
    },
    {
      title: "Open",
      value: counts.open,
      footer: "accepting applications",
      icon: <CircleDot size={28} />,
      iconClass: "bg-success/10 text-success",
      dot: "bg-success",
    },
    {
      title: "On Hold",
      value: counts.onHold,
      footer: "paused hiring",
      icon: <PauseCircle size={28} />,
      iconClass: "bg-warning/10 text-warning",
      dot: "bg-warning",
    },
    {
      title: "Closed",
      value: counts.closed,
      footer: "filled or cancelled",
      icon: <Archive size={28} />,
      iconClass: "bg-mention/10 text-mention",
      dot: "bg-mention",
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-text">Jobs</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Create, manage and track all your open positions.
          </p>
        </div>
        {can("interview.job.create") ? (
          <CreateJobDialog
            trigger={
              <button className="flex h-11 items-center gap-2.5 rounded-lg bg-gradient-to-r from-[#3048ff] to-[#4625f5] px-6 text-[13px] font-medium text-white shadow-[0_12px_35px_rgba(49,62,255,.25)] transition hover:brightness-110">
                <Plus size={16} />
                Create New Job
              </button>
            }
          />
        ) : null}
      </header>

      {/* Metrics */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.title} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
                  m.iconClass,
                )}
              >
                {m.icon}
              </div>
              <div>
                <div className="flex items-center gap-2 text-[13px] text-text-secondary">
                  {m.dot ? <span className={cn("h-2 w-2 rounded-full", m.dot)} /> : null}
                  {m.title}
                </div>
                <div className="mt-1 flex items-center gap-2.5">
                  <span className="text-2xl font-semibold tracking-tight text-text">{m.value}</span>
                  {m.change ? (
                    <span className="text-[12px] font-medium text-success">{m.change}</span>
                  ) : null}
                </div>
                <p className="text-[11px] text-text-muted">{m.footer}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Filters */}
      <section className="flex flex-col gap-3 xl:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by job title, department, location..."
            className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-4 text-[13px] text-text outline-none placeholder:text-text-muted focus:border-primary/50"
          />
        </div>
        <FilterSelect
          placeholder="Department"
          value={department}
          options={departmentOptions}
          onChange={(v) => {
            setDepartment(v);
            setPage(1);
          }}
        />
        <FilterSelect
          placeholder="Location"
          value={location}
          options={locationOptions}
          onChange={(v) => {
            setLocation(v);
            setPage(1);
          }}
        />
        <FilterSelect
          placeholder="Job Type"
          value={jobType}
          options={typeOptions}
          onChange={(v) => {
            setJobType(v);
            setPage(1);
          }}
        />
        <FilterSelect
          placeholder="Status"
          value={status}
          options={["open", "on_hold", "closed"]}
          optionLabel={statusLabel}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        />
        <button
          type="button"
          onClick={clearFilters}
          className="flex h-11 items-center justify-center px-3 text-[13px] text-primary transition hover:underline xl:min-w-[110px]"
        >
          Clear Filters
        </button>
      </section>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={Briefcase}
          title="Couldn't load job openings"
          action={
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-xs font-medium text-text hover:bg-surface-elevated"
            >
              Retry
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No jobs match"
          description="Try a different search or filter."
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/60 text-left text-[12px] text-text-muted">
                  <th className="w-[55px] px-4 py-3.5">
                    <BoardCheckbox checked={allPageSelected} onToggle={toggleSelectPage} />
                  </th>
                  <th className="px-3 py-3.5 font-medium">Job Title</th>
                  <th className="px-3 py-3.5 font-medium">Department</th>
                  <th className="px-3 py-3.5 font-medium">Location</th>
                  <th className="px-3 py-3.5 font-medium">Type</th>
                  <th className="px-3 py-3.5 font-medium">Candidates</th>
                  <th className="px-3 py-3.5 font-medium">Status</th>
                  <th className="px-3 py-3.5 font-medium">Posted On</th>
                  <th className="w-[80px] px-3 py-3.5 text-center font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <JobTableRow
                    key={row.job.id}
                    row={row}
                    selected={selected.has(row.job.id)}
                    onToggleSelect={() => toggleSelect(row.job.id)}
                    canEdit={canEdit}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Pagination */}
      {!isLoading && !isError && filtered.length > 0 && (
        <footer className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-text-muted">
            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of{" "}
            {filtered.length} jobs
            {selected.size > 0 ? ` · ${selected.size} selected` : ""}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-elevated disabled:opacity-40"
            >
              ‹
            </button>
            {paginationPages(currentPage, pageCount).map((p, i) =>
              p === "…" ? (
                <span key={`gap-${i}`} className="px-1 text-text-muted">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg text-[12px] transition",
                    p === currentPage
                      ? "border border-primary/50 bg-primary/10 text-primary"
                      : "text-text-muted hover:bg-surface-elevated",
                  )}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
              disabled={currentPage === pageCount}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-elevated disabled:opacity-40"
            >
              ›
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-2 flex h-10 items-center gap-3 rounded-lg border border-border bg-surface px-4 text-[12px] text-text"
                >
                  {pageSize} / page
                  <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {PAGE_SIZES.map((size) => (
                  <DropdownMenuItem
                    key={size}
                    onClick={() => {
                      setPageSize(size);
                      setPage(1);
                    }}
                  >
                    {size} / page
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </footer>
      )}
    </div>
  );
}

function paginationPages(current: number, total: number): Array<number | "…"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, 2, current - 1, current, current + 1, total - 1, total]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

function FilterSelect({
  placeholder,
  value,
  options,
  optionLabel,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: string[];
  optionLabel?: (option: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 min-w-[140px] appearance-none rounded-lg border border-border bg-surface px-4 pr-9 text-[12px] text-text outline-none transition focus:border-primary/50"
      >
        <option value="all">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {optionLabel?.(option) ?? option}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
    </div>
  );
}

function BoardCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        "flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border transition",
        checked ? "border-primary bg-primary text-white" : "border-border bg-surface hover:border-primary/50",
      )}
    >
      {checked && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <path d="m5 12 4 4L19 6" />
        </svg>
      )}
    </button>
  );
}

function JobStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    open: "bg-success/10 text-success",
    on_hold: "bg-warning/10 text-warning",
    closed: "bg-surface-elevated text-text-muted",
  };
  const dots: Record<string, string> = {
    open: "bg-success",
    on_hold: "bg-warning",
    closed: "bg-text-muted",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]",
        styles[status] ?? "bg-surface-elevated text-text-muted",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dots[status] ?? "bg-text-muted")} />
      {statusLabel(status)}
    </span>
  );
}

function JobTableRow({
  row,
  selected,
  onToggleSelect,
  canEdit,
}: {
  row: JobRow;
  selected: boolean;
  onToggleSelect: () => void;
  canEdit: boolean;
}) {
  const { job } = row;
  const { posted, ago } = formatPosted(job.createdAt);
  const update = useUpdateJobOpening();
  const remote = (job.workplaceType ?? "").toLowerCase() === "remote" || (job.location ?? "").toLowerCase() === "remote";

  const transitions: Array<{ status: string; label: string }> = [
    { status: "open", label: "Mark as Open" },
    { status: "on_hold", label: "Put On Hold" },
    { status: "closed", label: "Close Position" },
  ].filter((t) => t.status !== job.status);

  return (
    <tr className="border-b border-border/60 transition hover:bg-surface-elevated/40">
      <td className="px-4 py-3">
        <BoardCheckbox checked={selected} onToggle={onToggleSelect} />
      </td>
      <td className="px-3 py-3">
        <div>
          <div className="text-[13px] font-medium text-text">{job.title}</div>
          <div className="mt-0.5 text-[11px] text-text-muted">#{job.id.slice(0, 8)}</div>
        </div>
      </td>
      <td className="px-3 py-3 text-[12px] text-text-secondary">{job.departmentName ?? "—"}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          {remote ? (
            <Globe size={15} className="shrink-0 text-text-muted" />
          ) : (
            <MapPin size={15} className="shrink-0 text-text-muted" />
          )}
          <div>
            <div className="text-[12px] text-text">{job.location ?? "—"}</div>
            {job.workplaceType ? (
              <div className="mt-0.5 text-[10px] text-text-muted">{job.workplaceType}</div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        {job.employmentType ? (
          <span
            className={cn(
              "inline-flex rounded-full px-3 py-1.5 text-[11px]",
              job.employmentType === "Part-time"
                ? "bg-success/10 text-success"
                : job.employmentType === "Contract"
                  ? "bg-mention/10 text-mention"
                  : "bg-info/10 text-info",
            )}
          >
            {job.employmentType}
          </span>
        ) : (
          <span className="text-[12px] text-text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2.5">
          <span className="min-w-[22px] text-[14px] font-medium text-text">{row.applicantCount}</span>
          {row.applicants.length > 0 && (
            <div className="flex items-center -space-x-2">
              {row.applicants.slice(0, 3).map((name, i) => (
                <span
                  key={i}
                  title={name}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-primary/15 text-[9px] font-semibold text-primary"
                >
                  {initials(name)}
                </span>
              ))}
              {row.applicantCount > 3 && (
                <span className="z-10 flex h-7 min-w-7 items-center justify-center rounded-full border border-border bg-surface-elevated px-1.5 text-[10px] text-text-secondary">
                  +{row.applicantCount - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <JobStatusBadge status={job.status} />
      </td>
      <td className="px-3 py-3">
        <div className="text-[12px] text-text">{posted}</div>
        <div className="mt-0.5 text-[10px] text-text-muted">{ago}</div>
      </td>
      <td className="px-3 py-3 text-center">
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="rounded-md p-2 text-text-muted transition hover:bg-surface-elevated hover:text-text"
              >
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {transitions.map((t) => (
                <DropdownMenuItem
                  key={t.status}
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: job.id, body: { status: t.status } })}
                >
                  {t.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </td>
    </tr>
  );
}
