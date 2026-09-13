import { useState } from "react";
import {
  CheckCircle,
  Clock,
  Download,
  FolderKanban,
  LayoutGrid,
  List,
  Paperclip,
  PlusCircle,
  Ticket,
  TrendingUp,
} from "lucide-react";
import {
  DATE_RANGE_OPTIONS,
  FilterDropdown,
  PageHeader,
  PrimaryAction,
  withinDateRange,
} from "./hr/common";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";
import { useTickets, useUpdateTicketStatus } from "@/hooks/api";
import { useMyContext } from "@/hooks/usePermissions";
import { downloadFile, type SupportTicket, type TicketAttachment, type TicketStatus } from "@/lib/api";

const SPARK = [38, 62, 45, 80, 55, 92, 40, 70, 58, 85, 48, 74];

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "solved", label: "Solved" },
];

function statusClass(status: string) {
  switch (status) {
    case "solved":
      return "bg-success/10 text-success";
    case "open":
      return "bg-mention/10 text-mention";
    case "pending":
      return "bg-warning/10 text-warning";
    default:
      return "bg-info/10 text-info";
  }
}

function priorityClass(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-error/10 text-error";
    case "high":
      return "bg-warning/10 text-warning";
    case "low":
      return "bg-surface-elevated text-text-muted";
    default:
      return "bg-info/10 text-info";
  }
}

function roleLabel(ticket: SupportTicket) {
  return ticket.assigneeRole?.description || ticket.assigneeRole?.name || "—";
}

function AttachmentChip({ attachment }: { attachment: TicketAttachment }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      title={attachment.name}
      onClick={async () => {
        setBusy(true);
        try {
          const blob = await downloadFile(attachment.fileId);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = attachment.name;
          a.click();
          URL.revokeObjectURL(url);
        } catch (err) {
          toastError(err, "Couldn't download attachment");
        } finally {
          setBusy(false);
        }
      }}
      className="flex max-w-40 items-center gap-1 rounded bg-surface-elevated px-1.5 py-0.5 font-medium text-text-secondary transition-colors hover:text-text disabled:opacity-50"
    >
      <Paperclip className="h-3 w-3 shrink-0" />
      <span className="truncate">{attachment.name}</span>
    </button>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
  softClass,
  barClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
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
          <div className="mt-0.5 text-lg font-semibold text-text">{value}</div>
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

function TicketStatusControl({
  ticket,
  canManage,
  organisationId,
}: {
  ticket: SupportTicket;
  canManage: boolean;
  organisationId: string;
}) {
  const updateStatus = useUpdateTicketStatus();
  if (!canManage) {
    return (
      <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", statusClass(ticket.status))}>
        {ticket.status}
      </span>
    );
  }
  return (
    <select
      value={ticket.status}
      disabled={updateStatus.isPending}
      onChange={(e) =>
        updateStatus.mutate(
          { organisationId, ticketId: ticket.id, status: e.target.value as TicketStatus },
          { onError: (err) => toastError(err, "Failed to update ticket") },
        )
      }
      className="h-7 rounded-md border border-border bg-surface px-2 text-xs capitalize text-text disabled:opacity-50"
      aria-label={`Update status for ${ticket.subject}`}
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s.value} value={s.value}>
          {s.label}
        </option>
      ))}
    </select>
  );
}

function TicketCard({
  ticket,
  canManage,
  organisationId,
}: {
  ticket: SupportTicket;
  canManage: boolean;
  organisationId: string;
}) {

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{ticket.subject}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{ticket.description}</p>
        </div>
        <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", priorityClass(ticket.priority))}>
          {ticket.priority}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-medium text-text-secondary">
          {ticket.category}
        </span>
        <span className="rounded bg-surface-elevated px-1.5 py-0.5 font-medium text-text-secondary">
          {roleLabel(ticket)}
        </span>
        {ticket.attachments.map((a) => (
          <AttachmentChip key={a.fileId} attachment={a} />
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-3">
        <span className="text-[11px] text-text-muted">
          {new Date(ticket.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}
        </span>
        <TicketStatusControl ticket={ticket} canManage={canManage} organisationId={organisationId} />
      </div>
    </div>
  );
}

export function TicketsScreen() {
  const organisationId = useUIStore((s) => s.organisationId) ?? undefined;
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: myContext } = useMyContext();
  const { data: tickets, isLoading, error } = useTickets(organisationId);
  const [mode, setMode] = useState<"list" | "grid">("grid");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const [range, setRange] = useState("all");

  const all = tickets ?? [];
  const counts = {
    new: all.filter((t) => t.status === "new").length,
    open: all.filter((t) => t.status === "open").length,
    solved: all.filter((t) => t.status === "solved").length,
    pending: all.filter((t) => t.status === "pending").length,
  };

  const filtered = all.filter(
    (t) =>
      (!priority || t.priority === priority) &&
      (!status || t.status === status) &&
      withinDateRange(t.createdAt, range),
  );

  function canManage(ticket: SupportTicket) {
    if (myContext?.isSuperAdmin) return true;
    return (myContext?.roleIds ?? []).includes(ticket.assigneeRoleId);
  }

  function exportCsv() {
    if (!filtered.length) {
      toast.info("No tickets to export yet.");
      return;
    }
    const rows = [
      ["Subject", "Category", "Priority", "Status", "Assigned to", "Created"],
      ...filtered.map((t) => [
        t.subject,
        t.category,
        t.priority,
        t.status,
        roleLabel(t),
        t.createdAt,
      ]),
    ];
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "tickets.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

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
        <button
          type="button"
          onClick={exportCsv}
          className="flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-3 text-xs text-text"
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>
        <PrimaryAction
          icon={PlusCircle}
          label="Add New Ticket"
          onClick={() => setActiveView("help", { helpTab: "tickets" })}
        />
      </PageHeader>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Ticket} label="New Tickets" value={counts.new} iconClass="border-primary text-primary" softClass="bg-primary-subtle text-primary" barClass="bg-primary" />
        <StatCard icon={FolderKanban} label="Open Tickets" value={counts.open} iconClass="border-mention text-mention" softClass="bg-mention/10 text-mention" barClass="bg-mention" />
        <StatCard icon={CheckCircle} label="Solved Tickets" value={counts.solved} iconClass="border-success text-success" softClass="bg-success/10 text-success" barClass="bg-success" />
        <StatCard icon={Clock} label="Pending Tickets" value={counts.pending} iconClass="border-info text-info" softClass="bg-info/10 text-info" barClass="bg-info" />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-text">Ticket Grid</h2>
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              value={priority}
              onChange={setPriority}
              options={[
                { value: "", label: "All priorities" },
                { value: "urgent", label: "Urgent" },
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
            >
              Priority
            </FilterDropdown>
            <FilterDropdown
              value={status}
              onChange={setStatus}
              options={[
                { value: "", label: "All statuses" },
                { value: "new", label: "New" },
                { value: "open", label: "Open" },
                { value: "pending", label: "Pending" },
                { value: "solved", label: "Solved" },
              ]}
            >
              Select Status
            </FilterDropdown>
            <FilterDropdown
              label="Sort By : "
              value={range}
              onChange={setRange}
              options={DATE_RANGE_OPTIONS}
            />
          </div>
        </div>
        {isLoading ? (
          <div className="px-5 py-16 text-center text-sm text-text-muted">Loading tickets…</div>
        ) : error ? (
          <div className="px-5 py-16 text-center text-sm text-error">
            Failed to load tickets: {error.message}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
              <Ticket className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-text">No tickets yet</p>
            <p className="max-w-xs text-xs text-text-muted">
              Tickets you raise — or tickets assigned to a role you hold — will appear here.
            </p>
          </div>
        ) : mode === "grid" ? (
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                canManage={canManage(ticket)}
                organisationId={organisationId as string}
              />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((ticket) => (
              <li key={ticket.id} className="flex items-center gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{ticket.subject}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {ticket.category} · {roleLabel(ticket)} ·{" "}
                    {new Date(ticket.createdAt).toLocaleDateString([], {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", priorityClass(ticket.priority))}>
                  {ticket.priority}
                </span>
                <TicketStatusControl
                  ticket={ticket}
                  canManage={canManage(ticket)}
                  organisationId={organisationId as string}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
