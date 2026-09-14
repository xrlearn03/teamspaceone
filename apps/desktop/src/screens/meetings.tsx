import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  FileText,
  KeyRound,
  Link2,
  Loader2,
  MoreHorizontal,
  PhoneOff,
  Plus,
  Radio,
  Repeat2,
  Search,
  Sparkles,
  Users,
  Video,
  X,
} from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import { usePermission } from "@teamspace-one/authorization/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { UserAvatar } from "../components/user-avatar";
import {
  downloadFile,
  extractMeetingJoinToken,
  getGuestMeetingInfo,
  getMeeting,
  getMeetingByCode,
  getMeetingMessages,
  getMeetingShareLink,
  summarize,
  type FileRecord,
  type GuestMeetingInfo,
  type Meeting,
  type MeetingShareLink,
  type UserDto,
} from "../lib/api";
import {
  useCalendarEvents,
  useCreateMeeting,
  useDeleteEndedMeetings,
  useEndMeeting,
  useMe,
  useMeetingAvailability,
  useMeetingRecordings,
  useMeetings,
  useMembers,
  useUsers,
} from "../hooks/api";
import { useUIStore } from "../stores/ui";
import { cn } from "../lib/utils";
import { toast, toastError } from "../lib/toast";
import { MeetingScreen } from "./meeting";

/* =========================================================
   Types & helpers
========================================================= */

type MeetingTab = "upcoming" | "past" | "mine" | "links" | "recordings";

interface ScheduleInitial {
  title?: string;
  description?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  recurrence?: "daily" | "weekly" | "monthly";
  inviteeIds?: string[];
}

const TABS: { id: MeetingTab; label: string }[] = [
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past Meetings" },
  { id: "mine", label: "My Meetings" },
  { id: "links", label: "Meeting Links" },
  { id: "recordings", label: "Recordings" },
];

const ACCENTS = [
  "bg-violet-500",
  "bg-emerald-500",
  "bg-orange-500",
  "bg-pink-500",
  "bg-blue-500",
  "bg-cyan-500",
];

const DEFAULT_DURATION_MINUTES = 30;
const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120];
const RECURRENCE_OPTIONS = [
  { value: "", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;


function accentFor(id: string) {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

function attendeeIds(m: Meeting): string[] {
  const ids = new Set<string>();
  ids.add(m.createdBy);
  for (const i of m.invitees ?? []) ids.add(i.userId);
  for (const p of m.participants ?? []) if (!p.guestName) ids.add(p.userId);
  ids.delete("");
  return [...ids];
}

function guestCount(m: Meeting): number {
  return (m.participants ?? []).filter((p) => p.guestName || p.userId.startsWith("guest.")).length;
}

function meetingWhen(m: Meeting): Date {
  return new Date(m.scheduledAt ?? m.startedAt ?? m.createdAt);
}

/** Planned/actual end of a meeting, when known. */
function meetingEnd(m: Meeting): Date | null {
  if (m.endedAt) return new Date(m.endedAt);
  if (m.status === "started" && m.startedAt) {
    return new Date(new Date(m.startedAt).getTime() + (m.durationMinutes ?? 60) * 60_000);
  }
  if (m.scheduledAt && m.durationMinutes) {
    return new Date(new Date(m.scheduledAt).getTime() + m.durationMinutes * 60_000);
  }
  return null;
}

function startOfDay(d: Date) {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function groupLabel(date: Date): { primary: string; secondary?: string } {
  const today = startOfDay(new Date());
  const diffDays = Math.round((startOfDay(date).getTime() - today.getTime()) / 86_400_000);
  const full = date.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const short = date.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (diffDays === 0) return { primary: "Today", secondary: full };
  if (diffDays === 1) return { primary: "Tomorrow", secondary: full };
  if (diffDays === -1) return { primary: "Yesterday", secondary: full };
  return { primary: short };
}

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function startsInLabel(m: Meeting): string | null {
  if (!m.scheduledAt || m.status !== "scheduled") return null;
  const diff = new Date(m.scheduledAt).getTime() - Date.now();
  if (diff <= 0 || diff > 24 * 60 * 60 * 1000) return null;
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `In ${mins} min`;
  const hours = Math.floor(mins / 60);
  return `In ${hours}h ${mins % 60 ? `${mins % 60}m` : ""}`.trim();
}

/** Build and download an .ics file so the meeting can be added to Google/Outlook. */
function downloadIcs(m: Meeting) {
  const start = new Date(m.scheduledAt ?? m.startedAt ?? m.createdAt);
  const end = new Date(start.getTime() + (m.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Teamspace One//Meetings//EN",
    "BEGIN:VEVENT",
    `UID:${m.id}@teamspace-one`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(m.title)}`,
    m.description ? `DESCRIPTION:${esc(m.description)}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => Boolean(l));
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${m.title.replace(/[^\w-]+/g, "_") || "meeting"}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveFileBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================================================
   Avatar stack
========================================================= */

function AvatarStack({ userIds, extra = 0, usersById }: { userIds: string[]; extra?: number; usersById: Map<string, UserDto> }) {
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {userIds.slice(0, 5).map((id) => (
          <UserAvatar
            key={id}
            user={usersById.get(id)}
            className="h-7 w-7 border-2 border-surface"
            fallbackClassName="text-[9px]"
          />
        ))}
        {extra > 0 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-surface bg-surface-elevated text-[10px] font-semibold text-text-secondary">
            +{extra}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Action card (quick actions)
========================================================= */

function MeetingAction({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
  iconClass,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
  disabled?: boolean;
  iconClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group flex w-full min-w-0 items-center gap-3 rounded-xl border bg-surface p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
    >
      <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", iconClass)}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-text">{title}</p>
        <p className="mt-0.5 truncate text-xs text-text-muted">{subtitle}</p>
      </div>
    </button>
  );
}

/* =========================================================
   Meeting row
========================================================= */

function MeetingRow({
  meeting,
  currentUserId,
  canConduct,
  link,
  copied,
  showLinkAction,
  onOpen,
  onCopyLink,
  onCopyCode,
  onEnd,
  onIcs,
  onSummarize,
  ending,
  usersById,
}: {
  meeting: Meeting;
  currentUserId?: string;
  canConduct: boolean;
  link?: MeetingShareLink;
  copied?: boolean;
  showLinkAction?: boolean;
  onOpen: (m: Meeting) => void;
  onCopyLink: (m: Meeting) => void;
  onCopyCode: (m: Meeting) => void;
  onEnd: (m: Meeting) => void;
  onIcs: (m: Meeting) => void;
  onSummarize: (m: Meeting) => void;
  ending: boolean;
  usersById: Map<string, UserDto>;
}) {
  const live = meeting.status === "started";
  const ended = meeting.status === "ended";
  const isCreator = meeting.createdBy === currentUserId;
  const when = meetingWhen(meeting);
  const end = meetingEnd(meeting);
  const soon = startsInLabel(meeting);
  const attendees = attendeeIds(meeting);
  const guests = guestCount(meeting);

  return (
    <div className="group relative flex items-center gap-4 overflow-hidden rounded-xl border bg-surface px-4 py-3 transition hover:border-primary/30">
      <div
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          live ? "bg-success" : ended ? "bg-offline" : accentFor(meeting.id),
        )}
      />

      <div className="w-24 shrink-0 pl-2 sm:w-32">
        <p className="text-sm font-medium text-text">{formatTime(when)}</p>
        <p className="mt-0.5 text-xs text-text-muted">
          {end ? `– ${formatTime(end)}` : meeting.type === "voice_room" ? "Voice room" : "Open ended"}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-text">{meeting.title}</h3>
          {live && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
              <Radio className="h-2.5 w-2.5" />
              Live
            </span>
          )}
          {soon && (
            <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-medium text-success">
              {soon}
            </span>
          )}
          {meeting.recurrence && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-elevated px-2 py-0.5 text-[10px] text-text-muted">
              <Repeat2 className="h-2.5 w-2.5" />
              {meeting.recurrence[0].toUpperCase() + meeting.recurrence.slice(1)}
            </span>
          )}
          {meeting.isRecording && (
            <span className="shrink-0 rounded-full bg-mention/15 px-2 py-0.5 text-[10px] font-medium text-mention">
              Recording
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          {meeting.description || (meeting.type === "voice_room" ? "Voice room" : "Meeting")}
          {meeting.joinCode ? ` · Code ${meeting.joinCode}` : ""}
        </p>
        {link && (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-text-muted">
            <Link2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{link.url}</span>
            <span className="shrink-0">
              · expires {new Date(link.expiresAt).toLocaleDateString([], { day: "numeric", month: "short" })}
            </span>
          </div>
        )}
      </div>

      <div className="hidden shrink-0 lg:block">
        <AvatarStack userIds={attendees} extra={guests} usersById={usersById} />
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {!ended && (
          <Button size="sm" className="px-4" onClick={() => onOpen(meeting)}>
            {live ? "Join" : isCreator ? "Start" : "Join"}
          </Button>
        )}
        {showLinkAction && (
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => onCopyLink(meeting)}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : link ? "Copy link" : "Create link"}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-elevated hover:text-text"
              aria-label="Meeting options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!ended && (
              <DropdownMenuItem onSelect={() => onCopyLink(meeting)}>
                <Link2 className="mr-2 h-4 w-4" />
                Copy guest link
              </DropdownMenuItem>
            )}
            {meeting.joinCode && (
              <DropdownMenuItem onSelect={() => onCopyCode(meeting)}>
                <KeyRound className="mr-2 h-4 w-4" />
                Copy join code
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onIcs(meeting)}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add to calendar (.ics)
            </DropdownMenuItem>
            {ended && (
              <DropdownMenuItem onSelect={() => onSummarize(meeting)}>
                <Sparkles className="mr-2 h-4 w-4" />
                AI summary
              </DropdownMenuItem>
            )}
            {live && (isCreator || canConduct) && (
              <DropdownMenuItem onSelect={() => onEnd(meeting)} disabled={ending}>
                <PhoneOff className="mr-2 h-4 w-4" />
                End meeting
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* =========================================================
   Day group
========================================================= */

function MeetingGroup({
  date,
  meetings,
  links,
  copiedId,
  showLinkAction,
  ...rowProps
}: {
  date: Date;
  meetings: Meeting[];
  links: Record<string, MeetingShareLink>;
  copiedId: string | null;
  showLinkAction?: boolean;
} & Omit<Parameters<typeof MeetingRow>[0], "meeting" | "link" | "copied" | "showLinkAction">) {
  const label = groupLabel(date);
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-text">{label.primary}</h2>
          {label.secondary && (
            <>
              <span className="text-text-muted">•</span>
              <span className="text-xs text-text-muted">{label.secondary}</span>
            </>
          )}
        </div>
        <span className="text-xs text-text-muted">
          {meetings.length} {meetings.length === 1 ? "meeting" : "meetings"}
        </span>
      </div>
      <div className="space-y-2">
        {meetings.map((m) => (
          <MeetingRow
            key={m.id}
            meeting={m}
            link={links[m.id]}
            copied={copiedId === m.id}
            showLinkAction={showLinkAction}
            {...rowProps}
          />
        ))}
      </div>
    </section>
  );
}

/* =========================================================
   Calendar widget
========================================================= */

function CalendarWidget({
  eventDays,
  selected,
  onSelect,
}: {
  eventDays: Set<string>;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const [cursor, setCursor] = useState(() => new Date());

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dateKey(new Date());

  const cells: { day: number; muted?: boolean; key: string }[] = [];
  for (let i = 0; i < first.getDay(); i += 1) {
    const d = new Date(year, month, -(first.getDay() - 1 - i));
    cells.push({ day: d.getDate(), muted: true, key: `m${i}` });
  }
  for (let d = 1; d <= daysInMonth; d += 1) {
    cells.push({ day: d, key: `d${d}` });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: cells.length % 7, muted: true, key: `n${cells.length}` });
  }

  return (
    <div className="rounded-xl border bg-surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text">
          {cursor.toLocaleDateString([], { month: "long", year: "numeric" })}
        </h3>
        <div className="flex items-center gap-1.5">
          <div className="flex overflow-hidden rounded-lg border bg-surface-elevated">
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center text-text-muted hover:bg-surface"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center text-text-muted hover:bg-surface"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            className="h-7 rounded-lg border bg-surface-elevated px-2.5 text-xs text-text-secondary hover:bg-surface"
            onClick={() => {
              setCursor(new Date());
              onSelect(null);
            }}
          >
            Today
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="py-1 text-center text-[10px] font-medium text-text-muted">
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const key = cell.muted ? null : dateKey(new Date(year, month, cell.day));
          const hasEvents = key !== null && eventDays.has(key);
          const isSelected = key !== null && key === selected;
          const isToday = key === todayKey;
          return (
            <div key={cell.key} className="relative flex h-8 items-center justify-center">
              <button
                type="button"
                disabled={cell.muted}
                onClick={() => key && onSelect(isSelected ? null : key)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-[11px] transition",
                  isSelected
                    ? "bg-primary font-semibold text-primary-foreground"
                    : cell.muted
                      ? "text-text-muted/40"
                      : "text-text-secondary hover:bg-surface-elevated hover:text-text",
                  isToday && !isSelected && "ring-1 ring-primary/60",
                )}
              >
                {cell.day}
              </button>
              {hasEvents && !isSelected && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================================================
   Upcoming sidebar item
========================================================= */

function UpcomingMeeting({ meeting, onOpen }: { meeting: Meeting; onOpen: (m: Meeting) => void }) {
  const when = meetingWhen(meeting);
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-elevated")}>
        <Video className="h-4 w-4 text-text-secondary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs font-medium text-text">{meeting.title}</p>
          <span className="flex shrink-0 items-center gap-1 text-[10px] text-text-muted">
            <Users className="h-2.5 w-2.5" />
            {attendeeIds(meeting).length}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-text-muted">
          {when.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} · {formatTime(when)}
        </p>
      </div>
      <Button size="sm" variant="secondary" className="h-7 px-3 text-[11px]" onClick={() => onOpen(meeting)}>
        Join
      </Button>
    </div>
  );
}

/* =========================================================
   Invitees picker
========================================================= */

function InviteePicker({
  users,
  selected,
  onToggle,
  busyIds,
}: {
  users: UserDto[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  busyIds?: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const filtered = users.filter((u) => {
    const name = `${u.firstName ?? ""} ${u.lastName ?? ""} ${u.email ?? ""}`.toLowerCase();
    return name.includes(query.toLowerCase());
  });
  return (
    <div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people…"
          className="h-9 pl-8"
        />
      </div>
      {selected.size > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[...selected].map((id) => {
            const u = users.find((x) => x.id === id);
            const name = u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "Member" : "Member";
            return (
              <button
                key={id}
                type="button"
                onClick={() => onToggle(id)}
                className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
              >
                {name}
                <X className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border">
        {filtered.slice(0, 30).map((u) => {
          const checked = selected.has(u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onToggle(u.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-surface-elevated"
            >
              <span
                className={cn(
                  "flex h-4 w-4 items-center justify-center rounded border",
                  checked ? "border-primary bg-primary text-primary-foreground" : "border-border",
                )}
              >
                {checked && <Check className="h-3 w-3" />}
              </span>
              <UserAvatar user={u} className="h-6 w-6" fallbackClassName="text-[9px]" />
              <span className="min-w-0 flex-1 truncate text-xs text-text">
                {`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || u.id}
              </span>
              {busyIds?.has(u.id) && (
                <span className="shrink-0 text-[10px] font-medium text-warning">Busy</span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-3 py-4 text-center text-xs text-text-muted">No people found</p>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Schedule meeting dialog
========================================================= */

function ScheduleMeetingDialog({
  open,
  onClose,
  users,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  users: UserDto[];
  initial?: ScheduleInitial;
}) {
  const createMeeting = useCreateMeeting();
  const { data: me } = useMe();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [when, setWhen] = useState(() => toLocalInputValue(initial?.scheduledAt));
  const [duration, setDuration] = useState(initial?.durationMinutes ?? DEFAULT_DURATION_MINUTES);
  const [recurrence, setRecurrence] = useState<string>(initial?.recurrence ?? "");
  const [invitees, setInvitees] = useState<Set<string>>(new Set(initial?.inviteeIds ?? []));

  // Busy-check the proposed slot against the selected invitees' calendars
  // (the backend always includes the caller, so their own conflicts show too).
  const availabilityArgs = useMemo(() => {
    const start = when ? new Date(when) : null;
    if (!start || Number.isNaN(start.getTime())) return undefined;
    return {
      userIds: [...invitees],
      from: start.toISOString(),
      to: new Date(start.getTime() + duration * 60_000).toISOString(),
    };
  }, [when, duration, invitees]);
  const { data: availability } = useMeetingAvailability(availabilityArgs);
  const busyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const interval of availability?.intervals ?? []) {
      for (const id of interval.userIds) ids.add(id);
    }
    return ids;
  }, [availability]);
  const busyNames = useMemo(
    () =>
      [...busyIds].map((id) => {
        if (id === me?.id) return "you";
        const u = users.find((x) => x.id === id);
        return u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || "a member" : "a member";
      }),
    [busyIds, me?.id, users],
  );

  function toLocalInputValue(iso?: string) {
    const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(Math.round(d.getMinutes() / 15) * 15, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toggle(id: string) {
    setInvitees((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!title.trim()) return;
    try {
      await createMeeting.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: when ? new Date(when).toISOString() : undefined,
        durationMinutes: duration,
        recurrence: (recurrence || undefined) as ScheduleInitial["recurrence"],
        inviteeIds: [...invitees],
      });
      toast.success("Meeting scheduled");
      onClose();
    } catch (err) {
      toastError(err, "Could not schedule meeting");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule meeting</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-4 pt-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Product standup" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this meeting about?"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Date & time</label>
              <Input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                className="min-w-0"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Duration</label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="h-9 w-full rounded-md border bg-surface px-2 text-sm text-text"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} min
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-text-secondary">Repeats</label>
              <select
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="h-9 w-full rounded-md border bg-surface px-2 text-sm text-text"
              >
                {RECURRENCE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {busyNames.length > 0 && (
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <Clock3 className="h-3.5 w-3.5 shrink-0" />
              <span>Busy at this time: {busyNames.join(", ")}</span>
            </p>
          )}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-text-secondary">
              Invite people {invitees.size > 0 && `(${invitees.size})`}
            </label>
            <InviteePicker users={users} selected={invitees} onToggle={toggle} busyIds={busyIds} />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={!title.trim() || createMeeting.isPending}>
                {createMeeting.isPending ? "Scheduling…" : "Schedule"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================
   Join with a code / link dialog
========================================================= */

function JoinWithCodeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  const setGuestMeetingToken = useUIStore((s) => s.setGuestMeetingToken);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guestToken, setGuestToken] = useState<string | null>(null);

  function openMeeting(m: Meeting) {
    setActiveView(m.type === "voice_room" ? "voice" : "meeting", { meetingId: m.id });
    onClose();
  }

  async function handleResolve() {
    const raw = input.trim();
    if (!raw) return;
    setBusy(true);
    setError(null);
    setGuestToken(null);
    try {
      // Guest invite link or raw guest token.
      const token = extractMeetingJoinToken(raw);
      if (token) {
        let info: GuestMeetingInfo;
        try {
          info = await getGuestMeetingInfo(token);
        } catch {
          setError("That meeting link is invalid or has expired.");
          return;
        }
        try {
          const m = await getMeeting(info.meetingId);
          openMeeting(m);
          return;
        } catch {
          setGuestToken(token);
          setError("You don't have member access to this meeting.");
          return;
        }
      }

      // Short join code (e.g. K7M2P4NQ) or raw meeting id.
      const cleaned = raw.toUpperCase().replace(/[\s-]/g, "");
      if (/^[A-Z2-9]{6,10}$/.test(cleaned)) {
        try {
          const m = await getMeetingByCode(cleaned);
          openMeeting(m);
          return;
        } catch {
          // Fall through to treating it as a meeting id.
        }
      }
      try {
        const m = await getMeeting(raw);
        openMeeting(m);
        return;
      } catch {
        setError("Couldn't find a meeting for that code or link.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Join a meeting</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-4 pt-2">
          <p className="text-xs text-text-muted">
            Paste an invite link, enter a join code (e.g. <span className="font-mono">K7M2P4NQ</span>), or a
            meeting ID.
          </p>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Link, code, or meeting ID"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleResolve();
            }}
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            {guestToken ? (
              <Button className="gap-2" onClick={() => setGuestMeetingToken(guestToken)}>
                Continue as guest
              </Button>
            ) : (
              <Button onClick={() => void handleResolve()} disabled={!input.trim() || busy}>
                {busy ? "Checking…" : "Join"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================
   AI summary dialog
========================================================= */

function SummaryDialog({
  meeting,
  text,
  loading,
  onClose,
}: {
  meeting: Meeting | null;
  text: string;
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={Boolean(meeting)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {meeting?.title ?? "Meeting"} — summary
          </DialogTitle>
        </DialogHeader>
        <div className="p-4 pt-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating summary…
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-6 text-text-secondary">
              {text || "No summary available."}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================
   Recordings tab
========================================================= */

function RecordingsList({ meetings }: { meetings: Meeting[] }) {
  const { data: files, isLoading } = useMeetingRecordings();
  const [downloading, setDownloading] = useState<string | null>(null);

  const meetingsById = useMemo(() => new Map(meetings.map((m) => [m.id, m])), [meetings]);

  const groups = useMemo(() => {
    const map = new Map<string, FileRecord[]>();
    for (const f of files ?? []) {
      const key = f.resourceId ?? "unknown";
      const list = map.get(key) ?? [];
      list.push(f);
      map.set(key, list);
    }
    return [...map.entries()].sort((a, b) => {
      const at = Math.max(...a[1].map((f) => new Date(f.createdAt).getTime()));
      const bt = Math.max(...b[1].map((f) => new Date(f.createdAt).getTime()));
      return bt - at;
    });
  }, [files]);

  async function handleDownload(f: FileRecord) {
    setDownloading(f.id);
    try {
      const blob = await downloadFile(f.id);
      await saveFileBlob(blob, f.originalName);
    } catch (err) {
      toastError(err, "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Video}
        title="No recordings yet"
        description="Meeting recordings appear here after a recorded meeting ends."
      />
    );
  }

  return (
    <div className="space-y-5">
      {groups.map(([meetingId, recs]) => {
        const m = meetingsById.get(meetingId);
        return (
          <section key={meetingId}>
            <div className="mb-2 flex items-center justify-between px-1">
              <h3 className="text-sm font-semibold text-text">{m?.title ?? "Meeting recording"}</h3>
              <span className="text-xs text-text-muted">
                {recs.length} file{recs.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="space-y-1.5">
              {recs.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-xl border bg-surface px-4 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-text">{f.originalName}</p>
                    <p className="text-[11px] text-text-muted">
                      {formatSize(f.size)} · {new Date(f.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    disabled={downloading === f.id}
                    onClick={() => void handleDownload(f)}
                  >
                    {downloading === f.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* =========================================================
   Main screen
========================================================= */

export function MeetingsScreen() {
  const { data: me } = useMe();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const organisationId = useUIStore((s) => s.organisationId);
  const canCreate = usePermission("collaboration.meeting.create");
  const canConduct = usePermission("collaboration.meeting.conduct");
  const canDelete = usePermission("collaboration.meeting.delete");

  const { data: meetings, isLoading } = useMeetings();
  const { data: members } = useMembers(organisationId ?? undefined);
  const memberUserIds = useMemo(() => (members ?? []).map((m) => m.userId), [members]);
  const { data: users } = useUsers(memberUserIds.length ? memberUserIds : undefined);
  const { data: calEvents } = useCalendarEvents();
  const createMeeting = useCreateMeeting();
  const endMeeting = useEndMeeting();
  const deleteEnded = useDeleteEndedMeetings();

  const [tab, setTab] = useState<MeetingTab>("upcoming");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleInitial, setScheduleInitial] = useState<ScheduleInitial | undefined>();
  const [joinOpen, setJoinOpen] = useState(false);
  const [links, setLinks] = useState<Record<string, MeetingShareLink>>({});
  const [linkLoading, setLinkLoading] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ meeting: Meeting; text: string; loading: boolean } | null>(null);

  const usersById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const filteredMeetings = useMemo(
    () => (meetings ?? []).filter((m) => m.type !== "interview"),
    [meetings],
  );

  const eventDays = useMemo(() => {
    const days = new Set<string>();
    for (const ev of calEvents ?? []) {
      if (ev.startsAt) days.add(dateKey(new Date(ev.startsAt)));
    }
    for (const m of filteredMeetings) {
      if (m.scheduledAt) days.add(dateKey(new Date(m.scheduledAt)));
    }
    return days;
  }, [calEvents, filteredMeetings]);

  const liveMeetings = filteredMeetings.filter((m) => m.status === "started");

  const upcoming = filteredMeetings
    .filter((m) => m.status === "scheduled")
    .sort((a, b) => meetingWhen(a).getTime() - meetingWhen(b).getTime());

  const next7Days = useMemo(() => {
    const horizon = Date.now() + 7 * 86_400_000;
    return upcoming.filter((m) => meetingWhen(m).getTime() <= horizon).slice(0, 6);
  }, [upcoming]);

  const groups = useMemo(() => {
    let source: Meeting[] = [];
    if (tab === "upcoming") source = upcoming;
    else if (tab === "past") {
      source = filteredMeetings
        .filter((m) => m.status === "ended")
        .sort((a, b) => (b.endedAt ?? b.createdAt).localeCompare(a.endedAt ?? a.createdAt));
    } else if (tab === "mine") {
      source = filteredMeetings
        .filter((m) => m.createdBy === me?.id && m.status !== "ended")
        .sort((a, b) => meetingWhen(a).getTime() - meetingWhen(b).getTime());
    } else if (tab === "links") {
      source = filteredMeetings
        .filter((m) => m.status !== "ended")
        .sort((a, b) => meetingWhen(a).getTime() - meetingWhen(b).getTime());
    }

    if (tab === "upcoming" && selectedDay) {
      source = source.filter((m) => dateKey(meetingWhen(m)) === selectedDay);
    }

    const byDay = new Map<string, Meeting[]>();
    for (const m of source) {
      const key = dateKey(meetingWhen(m));
      const list = byDay.get(key) ?? [];
      list.push(m);
      byDay.set(key, list);
    }
    return [...byDay.entries()]
      .map(([key, list]) => ({ key, date: list[0] ? meetingWhen(list[0]) : new Date(), meetings: list }))
      .sort((a, b) =>
        tab === "past" ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime(),
      );
  }, [tab, upcoming, filteredMeetings, me?.id, selectedDay]);

  function openMeeting(m: Meeting) {
    setActiveView(m.type === "voice_room" ? "voice" : "meeting", { meetingId: m.id });
  }

  async function copyLink(m: Meeting) {
    try {
      let link = links[m.id];
      if (!link) {
        if (linkLoading[m.id]) return;
        setLinkLoading((p) => ({ ...p, [m.id]: true }));
        link = await getMeetingShareLink(m.id);
        setLinks((p) => ({ ...p, [m.id]: link }));
        setLinkLoading((p) => ({ ...p, [m.id]: false }));
      }
      await navigator.clipboard.writeText(link.url);
      setCopiedId(m.id);
      toast.success("Guest link copied");
      window.setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 2000);
    } catch (err) {
      setLinkLoading((p) => ({ ...p, [m.id]: false }));
      toastError(err, "Couldn't get the meeting link");
    }
  }

  async function copyCode(m: Meeting) {
    if (!m.joinCode) return;
    try {
      await navigator.clipboard.writeText(m.joinCode);
      toast.success("Join code copied");
    } catch {
      toast.error("Couldn't copy the join code");
    }
  }

  async function handleSummarize(m: Meeting) {
    setSummary({ meeting: m, text: "", loading: true });
    try {
      const { items } = await getMeetingMessages(m.id);
      const transcript = items
        .map((msg) => {
          const u = usersById.get(msg.userId);
          const name = u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email : msg.userId;
          return `${name}: ${msg.content}`;
        })
        .join("\n");
      if (!transcript.trim()) {
        setSummary({ meeting: m, text: "This meeting has no chat transcript to summarize.", loading: false });
        return;
      }
      const res = await summarize(
        "Summarize this meeting chat transcript. Structure your answer as: 1) Summary (2-3 sentences), 2) Key decisions, 3) Action items with owners.",
        `Meeting: ${m.title}\n\nTranscript:\n${transcript}`,
      );
      setSummary({ meeting: m, text: res.result, loading: false });
    } catch (err) {
      setSummary(null);
      toastError(err, "Couldn't generate a summary");
    }
  }

  function openSchedule(initial?: ScheduleInitial) {
    setScheduleInitial(initial);
    setScheduleOpen(true);
  }

  const groupProps = {
    links,
    copiedId,
    showLinkAction: tab === "links",
    currentUserId: me?.id,
    canConduct,
    onOpen: openMeeting,
    onCopyLink: copyLink,
    onCopyCode: copyCode,
    onEnd: (m: Meeting) => endMeeting.mutate(m.id),
    onIcs: downloadIcs,
    onSummarize: (m: Meeting) => void handleSummarize(m),
    ending: endMeeting.isPending,
    usersById,
  };

  return (
    <div className="flex h-full flex-col bg-background text-text">
      {/* Header */}
      <header className="shrink-0 px-4 pb-3 pt-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Meetings</h1>
            <p className="mt-1 text-sm text-text-muted">Connect. Collaborate. Move forward.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" className="gap-2" onClick={() => setJoinOpen(true)}>
              <Link2 className="h-4 w-4" />
              Join with a code
            </Button>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <MeetingAction
            icon={<Video className="h-5 w-5" />}
            title="Start Instant Meeting"
            subtitle="Start a meeting now"
            iconClass="bg-primary text-primary-foreground"
            disabled={!canCreate || createMeeting.isPending}
            onClick={() => {
              const title = `${me ? `${me.firstName ?? "My"}'s` : "Instant"} meeting`;
              createMeeting.mutate(
                { title },
                {
                  onSuccess: (m) => openMeeting(m),
                  onError: (err) => toastError(err, "Couldn't start the meeting"),
                },
              );
            }}
          />
          <MeetingAction
            icon={<Plus className="h-5 w-5" />}
            title="Schedule Meeting"
            subtitle="Plan for later"
            iconClass="bg-blue-500 text-white"
            disabled={!canCreate}
            onClick={() => openSchedule()}
          />
          <MeetingAction
            icon={<CalendarDays className="h-5 w-5" />}
            title="Join Meeting"
            subtitle="Link, code, or meeting ID"
            iconClass="bg-emerald-500 text-white"
            onClick={() => setJoinOpen(true)}
          />
          <MeetingAction
            icon={<Clock3 className="h-5 w-5" />}
            title="View Recordings"
            subtitle="Access past recordings"
            iconClass="bg-surface-elevated text-text-secondary"
            onClick={() => setTab("recordings")}
          />
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-4 sm:px-6">
        {/* Main column */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative h-full shrink-0 whitespace-nowrap px-4 text-xs font-medium transition",
                  tab === t.id ? "text-text" : "text-text-muted hover:text-text-secondary",
                )}
              >
                {t.label}
                {tab === t.id && (
                  <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
            {selectedDay && tab === "upcoming" && (
              <button
                type="button"
                className="ml-auto flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary"
                onClick={() => setSelectedDay(null)}
              >
                Filtered by day
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-5 pr-1">
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
                ))}
              </div>
            ) : tab === "recordings" ? (
              <RecordingsList meetings={filteredMeetings} />
            ) : (
              <>
                {tab === "upcoming" && liveMeetings.length > 0 && (
                  <MeetingGroup
                    date={new Date()}
                    meetings={liveMeetings}
                    {...groupProps}
                  />
                )}
                {groups.length === 0 && liveMeetings.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title={
                      tab === "past"
                        ? "No past meetings"
                        : tab === "mine"
                          ? "No meetings created by you"
                          : tab === "links"
                            ? "No active meetings"
                            : "No upcoming meetings"
                    }
                    description={
                      tab === "links"
                        ? "Create or schedule a meeting to get a shareable guest link."
                        : "Schedule a meeting or start one instantly to see it here."
                    }
                  />
                ) : (
                  groups.map((g) => (
                    <MeetingGroup key={g.key} date={g.date} meetings={g.meetings} {...groupProps} />
                  ))
                )}

                {tab === "past" && canDelete && groups.length > 0 && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={deleteEnded.isPending}
                      onClick={() => deleteEnded.mutate()}
                    >
                      {deleteEnded.isPending ? "Clearing…" : "Clear ended meetings"}
                    </Button>
                  </div>
                )}

              </>
            )}
          </div>
        </main>

        {/* Right sidebar */}
        <aside className="hidden w-[320px] shrink-0 space-y-3 overflow-y-auto pb-2 xl:block 2xl:w-[380px]">
          <CalendarWidget eventDays={eventDays} selected={selectedDay} onSelect={setSelectedDay} />

          <section className="rounded-xl border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-text">Upcoming in next 7 days</h3>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setTab("upcoming")}
              >
                View all
              </button>
            </div>
            <div className="divide-y divide-border/50">
              {next7Days.length === 0 ? (
                <p className="py-4 text-center text-xs text-text-muted">Nothing scheduled</p>
              ) : (
                next7Days.map((m) => (
                  <UpcomingMeeting key={m.id} meeting={m} onOpen={openMeeting} />
                ))
              )}
            </div>
          </section>

        </aside>
      </div>

      {/* Dialogs */}
      {scheduleOpen && (
        <ScheduleMeetingDialog
          open
          onClose={() => setScheduleOpen(false)}
          users={users ?? []}
          initial={scheduleInitial}
        />
      )}
      <JoinWithCodeDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
      <SummaryDialog
        meeting={summary?.meeting ?? null}
        text={summary?.text ?? ""}
        loading={summary?.loading ?? false}
        onClose={() => setSummary(null)}
      />
    </div>
  );
}

/** Route component for the "meeting" view: hub when no meeting is active,
 *  conference screen once one is selected. */
export function MeetingView() {
  const activeMeetingId = useUIStore((s) => s.activeMeetingId);
  return activeMeetingId ? <MeetingScreen /> : <MeetingsScreen />;
}
