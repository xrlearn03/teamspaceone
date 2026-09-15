import { useMemo, useState } from "react";
import {
  Archive,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  Clock,
  Download,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  Search,
  Star,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Candidate, CandidateApplication } from "@/lib/api";
import { useCandidates, useJobOpenings } from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { CreateCandidateDialog } from "./create-dialogs";
import { ResumeUploadButton } from "./resume-upload";
import { RunScreeningButton } from "./screening-dialog";
import { HiringDecisionButton } from "./hiring-decision-dialog";

const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screening: "Screening",
  shortlisted: "Shortlisted",
  interview: "Interview",
  evaluation: "Evaluation",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

const INTERVIEW_STAGES = new Set(["interview", "evaluation", "offer"]);
const NOT_LOOKING_STATUSES = new Set(["rejected", "archived", "hired", "withdrawn"]);
const PAGE_SIZES = [10, 25, 50];

type PoolTab = "all" | "shortlisted" | "interviewing" | "rejected";
type ViewMode = "table" | "grid";

interface PoolRow {
  candidate: Candidate;
  /** Most recent application, if any. */
  application: CandidateApplication | null;
  role: string | null;
  stageLabel: string | null;
  skills: string[];
  extraSkills: number;
  tenure: string;
  shortlisted: boolean;
  interviewing: boolean;
  rejected: boolean;
  availability: "Open" | "Not Looking";
  engagement: "High" | "Medium" | "Low";
}

function extractSkills(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => {
      if (typeof v === "string") return v;
      if (v && typeof v === "object") {
        const rec = v as Record<string, unknown>;
        return String(rec.name ?? rec.skill ?? rec.label ?? "");
      }
      return "";
    })
    .filter(Boolean);
}

function tenureLabel(iso: string) {
  const days = Math.max(0, (Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 30) return "<1 mo";
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo`;
  const years = months / 12;
  return `${years % 1 === 0 ? years : years.toFixed(1)} yrs`;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase() || "?";
}

function toRow(candidate: Candidate): PoolRow {
  const applications = [...(candidate.applications ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const application = applications[0] ?? null;
  const stages = new Set(applications.map((a) => a.stage));
  const skills = [
    ...new Set(applications.flatMap((a) => extractSkills(a.screeningResult?.skillsFound))),
  ];
  const shortlisted = stages.has("shortlisted") || candidate.status === "shortlisted";
  const interviewing = applications.some((a) => INTERVIEW_STAGES.has(a.stage));
  const rejected =
    NOT_LOOKING_STATUSES.has(candidate.status) ||
    stages.has("rejected") ||
    (applications.length > 0 && applications.every((a) => a.stage === "rejected"));
  const notLooking =
    NOT_LOOKING_STATUSES.has(candidate.status) ||
    (applications.length > 0 && applications.every((a) => a.stage === "rejected"));
  return {
    candidate,
    application,
    role: application?.jobOpening?.title ?? null,
    stageLabel: application ? (STAGE_LABELS[application.stage] ?? application.stage) : null,
    skills: skills.slice(0, 3),
    extraSkills: Math.max(0, skills.length - 3),
    tenure: tenureLabel(candidate.createdAt),
    shortlisted,
    interviewing,
    rejected,
    availability: notLooking ? "Not Looking" : "Open",
    engagement: interviewing ? "High" : shortlisted || stages.has("screening") ? "Medium" : "Low",
  };
}

function csvCell(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function exportCsv(rows: PoolRow[]) {
  const header = ["Name", "Email", "Phone", "Location", "Status", "Role", "Stage", "Availability", "Engagement"];
  const lines = rows.map((r) =>
    [
      r.candidate.name,
      r.candidate.email,
      r.candidate.phone ?? "",
      r.candidate.location ?? "",
      r.candidate.status,
      r.role ?? "",
      r.stageLabel ?? "",
      r.availability,
      r.engagement,
    ]
      .map(csvCell)
      .join(","),
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "talent-pool.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function TalentPool() {
  const { data: candidates, isLoading, isError, refetch } = useCandidates();
  const { data: jobs } = useJobOpenings();
  const { can } = usePermissions();
  const canRunScreening = can("interview.screening.run");
  const canMakeDecision = can("interview.decision.make");

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<PoolTab>("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [view, setView] = useState<ViewMode>("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const rows = useMemo(() => (candidates ?? []).map(toRow), [candidates]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      shortlisted: rows.filter((r) => r.shortlisted).length,
      interviewing: rows.filter((r) => r.interviewing).length,
      rejected: rows.filter((r) => r.rejected).length,
      newThisWeek: rows.filter(
        (r) => Date.now() - new Date(r.candidate.createdAt).getTime() < 7 * 86_400_000,
      ).length,
    }),
    [rows],
  );

  const stageOptions = useMemo(
    () => [...new Set(rows.flatMap((r) => [...(r.candidate.applications ?? [])].map((a) => a.stage)))],
    [rows],
  );
  const locationOptions = useMemo(
    () => [...new Set(rows.map((r) => r.candidate.location).filter((l): l is string => Boolean(l)))],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "shortlisted" && !r.shortlisted) return false;
      if (tab === "interviewing" && !r.interviewing) return false;
      if (tab === "rejected" && !r.rejected) return false;
      if (stageFilter !== "all" && !(r.candidate.applications ?? []).some((a) => a.stage === stageFilter)) return false;
      if (locationFilter !== "all" && r.candidate.location !== locationFilter) return false;
      if (availabilityFilter !== "all" && r.availability !== availabilityFilter) return false;
      if (!q) return true;
      const haystack = [
        r.candidate.name,
        r.candidate.email,
        r.candidate.location ?? "",
        r.role ?? "",
        r.candidate.source ?? "",
        ...r.skills,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rows, tab, stageFilter, locationFilter, availabilityFilter, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const pageIds = pageRows.map((r) => r.candidate.id);
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

  const kpis = [
    {
      icon: <Users size={26} />,
      iconClass: "bg-info/10 text-info",
      title: "Total Talent",
      value: String(counts.all),
      change: counts.newThisWeek > 0 ? `+${counts.newThisWeek}` : undefined,
      subtitle: "new this week",
    },
    {
      icon: <Star size={26} />,
      iconClass: "bg-warning/10 text-warning",
      title: "Shortlisted",
      value: String(counts.shortlisted),
      subtitle: "across all jobs",
    },
    {
      icon: <CalendarClock size={26} />,
      iconClass: "bg-mention/10 text-mention",
      title: "In Interview",
      value: String(counts.interviewing),
      subtitle: "interview · evaluation · offer",
    },
    {
      icon: <Archive size={26} />,
      iconClass: "bg-error/10 text-error",
      title: "Rejected / Archived",
      value: String(counts.rejected),
      subtitle: "out of the running",
    },
  ];

  const tabs: Array<{ id: PoolTab; label: string; icon?: React.ReactNode }> = [
    { id: "all", label: `All Talent (${counts.all})` },
    { id: "shortlisted", label: `Shortlisted (${counts.shortlisted})`, icon: <Star size={15} /> },
    { id: "interviewing", label: `Interviewing (${counts.interviewing})`, icon: <ClipboardList size={15} /> },
    { id: "rejected", label: `Rejected (${counts.rejected})`, icon: <Archive size={15} /> },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-text">Talent Pool</h2>
          <p className="mt-1 text-sm text-text-secondary">
            Discover, organize and engage top talent for future opportunities.
          </p>
        </div>
        {can("interview.candidate.create") ? (
          <CreateCandidateDialog
            jobs={jobs ?? []}
            trigger={
              <button className="flex h-11 items-center gap-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-blue-600 px-5 text-[13px] font-medium text-white shadow-[0_10px_35px_rgba(67,56,202,.3)] transition hover:brightness-110">
                <Plus size={16} />
                Add Candidate
              </button>
            }
          />
        ) : null}
      </header>

      {/* KPI cards */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.title} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "flex h-14 w-14 shrink-0 items-center justify-center rounded-xl",
                  kpi.iconClass,
                )}
              >
                {kpi.icon}
              </div>
              <div>
                <p className="text-[13px] text-text-secondary">{kpi.title}</p>
                <div className="mt-1 flex items-center gap-2.5">
                  <span className="text-2xl font-semibold tracking-tight text-text">{kpi.value}</span>
                  {kpi.change ? (
                    <span className="text-[12px] font-medium text-success">{kpi.change}</span>
                  ) : null}
                </div>
                <p className="text-[11px] text-text-muted">{kpi.subtitle}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Search / filters */}
      <section className="flex flex-col gap-3 xl:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            className="h-11 w-full rounded-lg border border-border bg-surface pl-10 pr-4 text-[13px] text-text outline-none placeholder:text-text-muted focus:border-primary/50"
            placeholder="Search by name, skills, role, location..."
          />
        </div>
        <PoolFilter
          label="Stage"
          value={stageFilter}
          options={stageOptions}
          optionLabel={(o) => STAGE_LABELS[o] ?? o}
          onChange={(v) => {
            setStageFilter(v);
            setPage(1);
          }}
        />
        <PoolFilter
          label="Location"
          value={locationFilter}
          options={locationOptions}
          onChange={(v) => {
            setLocationFilter(v);
            setPage(1);
          }}
        />
        <PoolFilter
          label="Availability"
          value={availabilityFilter}
          options={["Open", "Not Looking"]}
          onChange={(v) => {
            setAvailabilityFilter(v);
            setPage(1);
          }}
        />
      </section>

      {/* Tabs / actions */}
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex gap-8 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={cn(
                "relative flex h-11 shrink-0 items-center gap-2 text-[13px]",
                tab === t.id ? "font-medium text-primary" : "text-text-muted hover:text-text",
              )}
            >
              {t.icon}
              {t.label}
              {tab === t.id && (
                <span className="absolute bottom-[-1px] left-0 right-0 h-[3px] rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => exportCsv(selected.size > 0 ? filtered.filter((r) => selected.has(r.candidate.id)) : filtered)}
            className="flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-[13px] text-text transition hover:bg-surface-elevated"
          >
            <Download size={15} />
            Export
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            aria-label="Table view"
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg border transition",
              view === "table"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-text-muted hover:text-text",
            )}
          >
            <List size={16} />
          </button>
          <button
            type="button"
            onClick={() => setView("grid")}
            aria-label="Grid view"
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg border transition",
              view === "grid"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-text-muted hover:text-text",
            )}
          >
            <LayoutGrid size={16} />
          </button>
        </div>
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
          icon={Users}
          title="Couldn't load candidates"
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
        <EmptyState icon={Users} title="No candidates match" description="Try a different search or filter." />
      ) : view === "grid" ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {pageRows.map((row) => (
            <PoolCard key={row.candidate.id} row={row} canRunScreening={canRunScreening} canMakeDecision={canMakeDecision} />
          ))}
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1150px] border-collapse">
              <thead>
                <tr className="border-b border-border bg-surface-elevated/60 text-left text-[12px] text-text-muted">
                  <th className="w-[55px] px-4 py-3.5">
                    <PoolCheckbox checked={allPageSelected} onToggle={toggleSelectPage} />
                  </th>
                  <th className="px-3 py-3.5 font-medium">Candidate</th>
                  <th className="px-3 py-3.5 font-medium">Current Role</th>
                  <th className="px-3 py-3.5 font-medium">Skills</th>
                  <th className="px-3 py-3.5 font-medium">In Pool</th>
                  <th className="px-3 py-3.5 font-medium">Location</th>
                  <th className="px-3 py-3.5 font-medium">Availability</th>
                  <th className="px-3 py-3.5 font-medium">Engagement</th>
                  <th className="px-3 py-3.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <PoolTableRow
                    key={row.candidate.id}
                    row={row}
                    selected={selected.has(row.candidate.id)}
                    onToggleSelect={() => toggleSelect(row.candidate.id)}
                    canRunScreening={canRunScreening}
                    canMakeDecision={canMakeDecision}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Footer / pagination */}
      {!isLoading && !isError && filtered.length > 0 && (
        <footer className="flex flex-col gap-4 pb-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] text-text-muted">
            Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} of{" "}
            {filtered.length} candidates
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

function PoolFilter({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  optionLabel?: (option: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-11 min-w-[110px] items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 text-[12px] text-text transition hover:border-primary/40"
        >
          <span className="truncate">
            {value === "all" ? label : `${label}: ${optionLabel?.(value) ?? value}`}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => onChange("all")}>All {label}</DropdownMenuItem>
        {options.map((option) => (
          <DropdownMenuItem key={option} onClick={() => onChange(option)}>
            {optionLabel?.(option) ?? option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PoolCheckbox({ checked, onToggle }: { checked: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className={cn(
        "block h-[18px] w-[18px] rounded-[4px] border transition",
        checked ? "border-primary bg-primary" : "border-border bg-surface hover:border-primary/50",
      )}
    />
  );
}

function PoolTableRow({
  row,
  selected,
  onToggleSelect,
  canRunScreening,
  canMakeDecision,
}: {
  row: PoolRow;
  selected: boolean;
  onToggleSelect: () => void;
  canRunScreening: boolean;
  canMakeDecision: boolean;
}) {
  const { candidate } = row;
  return (
    <tr className="border-b border-border/60 transition hover:bg-surface-elevated/40">
      <td className="px-4 py-3">
        <PoolCheckbox checked={selected} onToggle={onToggleSelect} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-[13px] font-semibold text-primary">
            {initials(candidate.name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13px] font-medium text-text">{candidate.name}</span>
              {row.shortlisted && <Star size={13} className="shrink-0 fill-warning text-warning" />}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-text-muted">{candidate.email}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <p className="text-[12px] text-text">{row.role ?? "—"}</p>
        <p className="mt-0.5 text-[11px] text-text-muted">{row.stageLabel ?? candidate.status}</p>
      </td>
      <td className="px-3 py-3">
        {row.skills.length > 0 ? (
          <div className="flex items-center gap-1.5">
            {row.skills.map((skill) => (
              <span
                key={skill}
                className="whitespace-nowrap rounded-full bg-primary/10 px-3 py-1.5 text-[10px] text-primary"
              >
                {skill}
              </span>
            ))}
            {row.extraSkills > 0 && (
              <span className="rounded-full bg-primary/10 px-2.5 py-1.5 text-[10px] text-primary">
                +{row.extraSkills}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-3 text-[12px] text-text-secondary">{row.tenure}</td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5 text-[12px] text-text-secondary">
          <MapPin size={13} className="shrink-0 text-text-muted" />
          <span className="truncate">{candidate.location ?? "—"}</span>
        </div>
      </td>
      <td className="px-3 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px]",
            row.availability === "Open"
              ? "bg-success/10 text-success"
              : "bg-surface-elevated text-text-muted",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              row.availability === "Open" ? "bg-success" : "bg-text-muted",
            )}
          />
          {row.availability}
        </span>
      </td>
      <td className="px-3 py-3">
        <span className="flex items-center gap-2 text-[12px] text-text-secondary">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              row.engagement === "High"
                ? "bg-success"
                : row.engagement === "Medium"
                  ? "bg-info"
                  : "bg-error",
            )}
          />
          {row.engagement}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          <ResumeUploadButton candidateId={candidate.id} hasResume={Boolean(candidate.resumeFileId)} />
          {row.application && canRunScreening && (
            <RunScreeningButton applicationId={row.application.id} hasResume={Boolean(candidate.resumeFileId)} />
          )}
          {row.application && canMakeDecision && (
            <HiringDecisionButton applicationId={row.application.id} candidateName={candidate.name} />
          )}
        </div>
      </td>
    </tr>
  );
}

function PoolCard({
  row,
  canRunScreening,
  canMakeDecision,
}: {
  row: PoolRow;
  canRunScreening: boolean;
  canMakeDecision: boolean;
}) {
  const { candidate } = row;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary/15 bg-primary/10 text-[13px] font-semibold text-primary">
          {initials(candidate.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium text-text">{candidate.name}</span>
            {row.shortlisted && <Star size={13} className="shrink-0 fill-warning text-warning" />}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-text-muted">{candidate.email}</p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px]",
            row.availability === "Open"
              ? "bg-success/10 text-success"
              : "bg-surface-elevated text-text-muted",
          )}
        >
          {row.availability}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px]">
        <span className="truncate text-text">{row.role ?? "—"}</span>
        <span className="ml-2 shrink-0 text-text-muted">{row.stageLabel ?? candidate.status}</span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-text-muted">
        <span className="flex items-center gap-1">
          <MapPin size={11} />
          {candidate.location ?? "—"}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} />
          {row.tenure}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              row.engagement === "High"
                ? "bg-success"
                : row.engagement === "Medium"
                  ? "bg-info"
                  : "bg-error",
            )}
          />
          {row.engagement}
        </span>
      </div>
      {row.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {row.skills.map((skill) => (
            <span key={skill} className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] text-primary">
              {skill}
            </span>
          ))}
          {row.extraSkills > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">
              +{row.extraSkills}
            </span>
          )}
        </div>
      )}
      <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
        <ResumeUploadButton candidateId={candidate.id} hasResume={Boolean(candidate.resumeFileId)} />
        {row.application && canRunScreening && (
          <RunScreeningButton applicationId={row.application.id} hasResume={Boolean(candidate.resumeFileId)} />
        )}
        {row.application && canMakeDecision && (
          <HiringDecisionButton applicationId={row.application.id} candidateName={candidate.name} />
        )}
      </div>
    </div>
  );
}
