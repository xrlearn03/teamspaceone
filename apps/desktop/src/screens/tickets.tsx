import { useState } from "react";
import {
  CheckCircle,
  ChevronDown,
  Clock,
  Download,
  FolderKanban,
  Home,
  LayoutGrid,
  List,
  MessageSquare,
  MoreVertical,
  Phone,
  PlusCircle,
  Ticket,
  TrendingUp,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { cn } from "../lib/utils";

interface TicketCard {
  title: string;
  code: string;
  category: string;
  status: "Open" | "Solved" | "Pending" | "Closed";
  priority: "Low" | "Medium" | "High";
  assignee: string;
}

const TICKETS: TicketCard[] = [
  { title: "Laptop Issue", code: "Tic - 001", category: "Hardware Issues", status: "Open", priority: "Low", assignee: "Edgar Hansel" },
  { title: "Payment Issue", code: "Tic - 002", category: "Software Issues", status: "Open", priority: "High", assignee: "Edgar Hansel" },
  { title: "Bug Report", code: "Tic - 003", category: "IT Support", status: "Open", priority: "High", assignee: "Edgar Hansel" },
  { title: "Access Denied", code: "Tic - 004", category: "IT Support", status: "Open", priority: "High", assignee: "Edgar Hansel" },
  { title: "Access Denied", code: "Tic - 004", category: "IT Support", status: "Open", priority: "High", assignee: "Edgar Hansel" },
  { title: "Laptop Issue", code: "Tic - 001", category: "Hardware Issues", status: "Open", priority: "Low", assignee: "Edgar Hansel" },
  { title: "Payment Issue", code: "Tic - 002", category: "Software Issues", status: "Open", priority: "High", assignee: "Edgar Hansel" },
  { title: "Bug Report", code: "Tic - 003", category: "IT Support", status: "Open", priority: "High", assignee: "Edgar Hansel" },
  { title: "Access Denied", code: "Tic - 004", category: "IT Support", status: "Open", priority: "High", assignee: "Edgar Hansel" },
  { title: "Access Denied", code: "Tic - 004", category: "IT Support", status: "Open", priority: "High", assignee: "Edgar Hansel" },
];

const SPARK = [38, 62, 45, 80, 55, 92, 40, 70, 58, 85, 48, 74];

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  soft,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accent: string;
  soft: string;
  badge: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[5px] border border-[#e5e7eb] bg-white p-5">
      <div className="flex flex-col gap-3">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed"
          style={{ borderColor: accent }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full"
            style={{ backgroundColor: soft }}
          >
            <Icon className="h-4 w-4" style={{ color: accent }} />
          </div>
        </div>
        <div>
          <div className="text-xs font-medium text-[#6b7280]">{label}</div>
          <div className="mt-0.5 text-lg font-semibold text-[#111827]">{value}</div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-3 self-start">
        <span
          className="flex items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-xs"
          style={{ backgroundColor: soft, color: badge }}
        >
          <TrendingUp className="h-3 w-3" />
          +19.01%
        </span>
        <div className="flex h-14 items-end gap-1">
          {SPARK.map((h, i) => (
            <span
              key={i}
              className="w-1.5 rounded-t-sm"
              style={{ height: `${h}%`, backgroundColor: i % 2 === 0 ? accent : "#f8f9fa" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FilterDropdown({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-8 items-center gap-2 rounded-[5px] border border-[#e5e7eb] bg-white px-3 text-xs text-[#111827]"
    >
      {label}
      {children}
      <ChevronDown className="h-3.5 w-3.5 text-[#111827]" />
    </button>
  );
}

export function TicketsScreen() {
  const [mode, setMode] = useState<"list" | "grid">("grid");

  return (
    <div className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#111827]">Tickets</h1>
          <div className="mt-1 flex items-center gap-1.5 text-xs text-[#6b7280]">
            <Home className="h-3.5 w-3.5" />
            <span>/</span>
            <span>Employee</span>
            <span>/</span>
            <span className="text-[#111827]">Tickets</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 overflow-hidden rounded-[5px] border border-[#e5e7eb] bg-white">
            <button
              type="button"
              onClick={() => setMode("list")}
              className={cn("flex w-9 items-center justify-center", mode === "list" && "bg-[#f3f4f6]")}
              aria-label="List view"
            >
              <List className="h-4 w-4 text-[#111827]" />
            </button>
            <button
              type="button"
              onClick={() => setMode("grid")}
              className={cn("flex w-9 items-center justify-center border-l border-[#e5e7eb]", mode === "grid" && "bg-[#f3f4f6]")}
              aria-label="Grid view"
            >
              <LayoutGrid className="h-4 w-4 text-[#111827]" />
            </button>
          </div>
          <FilterDropdown>
            <Download className="h-3.5 w-3.5" />
            Export
          </FilterDropdown>
          <button
            type="button"
            className="flex items-center gap-2 rounded-[5px] bg-gradient-to-r from-[#ff6f28] to-[#ff5325] px-4 py-[7px] text-sm font-medium text-white"
          >
            <PlusCircle className="h-4 w-4" />
            Add New Ticket
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-4">
        <StatCard icon={Ticket} label="New Tickets" value={120} accent="#f26522" soft="#fef1eb" badge="#f26522" />
        <StatCard icon={FolderKanban} label="Open Tickets" value={60} accent="#ab47bc" soft="#f7eef9" badge="#ab47bc" />
        <StatCard icon={CheckCircle} label="Solved Tickets" value={50} accent="#03c95a" soft="#eaf8f0" badge="#03c95a" />
        <StatCard icon={Clock} label="Pending Tickets" value={10} accent="#0dcaf0" soft="#e9fafe" badge="#0c4b5e" />
      </div>

      <div className="mt-6 rounded-[5px] border border-[#e5e7eb] bg-white">
        <div className="flex items-center justify-between border-b border-[#e5e7eb] px-5 py-4">
          <h2 className="text-base font-semibold text-[#111827]">Ticket Grid</h2>
          <div className="flex items-center gap-2">
            <FilterDropdown>Priority</FilterDropdown>
            <FilterDropdown>Select Status</FilterDropdown>
            <FilterDropdown label="Sort By : ">Last 7 Days</FilterDropdown>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
          {TICKETS.map((ticket, i) => (
            <div key={i} className="relative rounded-[5px] border border-[#e5e7eb] bg-white p-4">
              <input type="checkbox" className="absolute left-4 top-4 h-4 w-4 rounded-[5px] border-[#e5e7eb]" />
              <button type="button" className="absolute right-4 top-4 text-[#111827]" aria-label="More options">
                <MoreVertical className="h-4 w-4" />
              </button>

              <div className="flex flex-col items-center pt-1">
                <div className="relative">
                  <div className="rounded-full border-2 border-brand p-0.5">
                    <Avatar className="h-14 w-14">
                      <AvatarFallback>
                        {ticket.assignee.split(" ").map((p) => p[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-admin-success" />
                </div>
                <div className="mt-2 text-sm font-bold text-[#111827]">{ticket.title}</div>
                <span className="mt-1 rounded-[5px] bg-admin-info-soft px-2 py-0.5 text-xs font-medium text-admin-info">
                  {ticket.code}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#6b7280]">Category</span>
                  <span className="font-medium text-[#111827]">{ticket.category}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#6b7280]">Status</span>
                  <span className="inline-flex items-center gap-1.5 rounded-[5px] bg-admin-pink-soft px-2 py-0.5 font-medium text-admin-pink">
                    <span className="h-1.5 w-1.5 rounded-full bg-admin-pink" />
                    {ticket.status}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#6b7280]">Priority</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-[5px] border px-2 py-0.5 font-medium",
                      ticket.priority === "High"
                        ? "border-admin-danger text-admin-danger"
                        : "border-admin-navy text-admin-navy",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        ticket.priority === "High" ? "bg-admin-danger" : "bg-admin-navy",
                      )}
                    />
                    {ticket.priority}
                  </span>
                </div>
              </div>

              <div className="mt-3 border-t border-[#e5e7eb] pt-3">
                <div className="text-xs text-[#6b7280]">Assigned To</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-[8px]">
                        {ticket.assignee.split(" ").map((p) => p[0]).join("")}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium text-[#111827]">{ticket.assignee}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-brand"
                      aria-label="Chat"
                    >
                      <MessageSquare className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-soft text-brand"
                      aria-label="Call"
                    >
                      <Phone className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
