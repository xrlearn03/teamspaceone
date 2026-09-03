import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Hash,
  Home,
  Inbox,
  Lock,
  Menu,
  Mic,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Video,
} from "lucide-react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { useUIStore, type View } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import {
  channels,
  currentWorkspace,
  directMessages,
  meetings,
  organisations,
  projects,
  voiceRooms,
} from "../../lib/data";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { cn } from "../../lib/utils";

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
const CollapsibleContent = CollapsiblePrimitive.Content;

interface SidebarItemData {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number;
  mention?: boolean;
  active?: boolean;
  onClick?: () => void;
  subtext?: string;
  isPrivate?: boolean;
}

function SidebarItem({
  icon: Icon,
  label,
  badge,
  mention,
  active,
  onClick,
  subtext,
  isPrivate,
}: SidebarItemData) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary-subtle text-primary"
          : "text-text-secondary hover:bg-surface-elevated hover:text-text",
      )}
    >
      {Icon ? (
        <Icon className="h-4 w-4 shrink-0" />
      ) : (
        <span className="h-4 w-4 shrink-0 rounded-full bg-surface-elevated" />
      )}
      <span className="flex-1 truncate text-left">{label}</span>
      {subtext ? (
        <span className="text-xs text-text-muted">{subtext}</span>
      ) : null}
      {badge ? (
        <Badge variant={mention ? "mention" : "default"}>{badge}</Badge>
      ) : null}
      {isPrivate ? <Lock className="h-3 w-3 text-text-muted" /> : null}
    </button>
  );
}

function SidebarSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted hover:text-text"
        >
          {title}
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              open && "rotate-90",
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-0.5 px-2 pb-2">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

export function WorkspaceSidebar() {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const {
    sidebarCollapsed,
    sidebarWidth,
    activeView,
    activeChannelId,
    activeProjectId,
    toggleSidebar,
    setSidebarWidth,
    setActiveView,
    setSearchOpen,
  } = useUIStore(
    useShallow((s) => ({
      sidebarCollapsed: s.sidebarCollapsed,
      sidebarWidth: s.sidebarWidth,
      activeView: s.activeView,
      activeChannelId: s.activeChannelId,
      activeProjectId: s.activeProjectId,
      toggleSidebar: s.toggleSidebar,
      setSidebarWidth: s.setSidebarWidth,
      setActiveView: s.setActiveView,
      setSearchOpen: s.setSearchOpen,
    })),
  );

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      if (!sidebarRef.current) return;
      const rect = sidebarRef.current.getBoundingClientRect();
      setSidebarWidth(e.clientX - rect.left);
    }
    function onUp() {
      setDragging(false);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, setSidebarWidth]);

  function navigate(view: View, params?: { channelId?: string; projectId?: string; meetingId?: string }) {
    setActiveView(view, params);
  }

  if (sidebarCollapsed) {
    return null;
  }

  return (
    <aside
      ref={sidebarRef}
      className="relative flex shrink-0 flex-col border-r bg-surface"
      style={{ width: sidebarWidth }}
    >
      <div className="flex h-14 items-center gap-2 border-b px-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex flex-1 items-center gap-2 overflow-hidden rounded-md px-1 py-1 text-left hover:bg-surface-elevated"
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px]">
                  {currentWorkspace.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text">
                  {currentWorkspace.name}
                </div>
                <div className="text-xs text-text-muted capitalize">
                  {currentWorkspace.role}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {organisations.map((org) => (
              <DropdownMenuItem key={org.id}>
                <span className="flex flex-1 items-center justify-between">
                  {org.name}
                  {org.name === currentWorkspace.name && (
                    <span className="text-xs text-text-muted">current</span>
                  )}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label="Quick action">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate("dm")}>
              New message
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("project")}>
              Create project
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("meeting")}>
              Start meeting
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border-b px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            placeholder="Search workspace"
            className="h-8 pl-8 text-sm"
            onFocus={() => setSearchOpen(true)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <SidebarSection title="Overview" defaultOpen>
          <SidebarItem
            icon={Home}
            label="Home"
            active={activeView === "home"}
            onClick={() => navigate("home")}
          />
          <SidebarItem
            icon={Inbox}
            label="Inbox"
            badge={3}
            active={activeView === "inbox"}
            onClick={() => navigate("inbox")}
          />
          <SidebarItem icon={Menu} label="Drafts" />
          <SidebarItem icon={Star} label="Saved items" />
        </SidebarSection>

        <SidebarSection title="Channels">
          {channels.map((ch) => (
            <SidebarItem
              key={ch.id}
              icon={ch.type === "private" ? Lock : Hash}
              label={ch.name}
              badge={ch.mentions || ch.unread || undefined}
              mention={ch.mentions > 0}
              active={activeView === "channel" && activeChannelId === ch.id}
              onClick={() => navigate("channel", { channelId: ch.id })}
              isPrivate={ch.type === "private"}
            />
          ))}
        </SidebarSection>

        <SidebarSection title="Direct messages">
          {directMessages.map((dm) => {
            const Icon = ({ className }: { className?: string }) => (
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  className,
                  dm.status === "online" && "bg-online",
                  dm.status === "away" && "bg-away",
                  dm.status === "offline" && "bg-offline",
                )}
              />
            );
            return (
              <SidebarItem
                key={dm.id}
                icon={Icon}
                label={dm.name}
                badge={dm.unread || undefined}
                active={activeView === "dm" && activeChannelId === dm.id}
                onClick={() => navigate("dm", { channelId: dm.id })}
                subtext={dm.status}
              />
            );
          })}
        </SidebarSection>

        <SidebarSection title="Projects">
          {projects.map((p) => (
            <SidebarItem
              key={p.id}
              icon={Folder}
              label={p.name}
              badge={p.unread || undefined}
              active={activeView === "project" && activeProjectId === p.id}
              onClick={() => navigate("project", { projectId: p.id })}
              subtext={p.status}
            />
          ))}
        </SidebarSection>

        <SidebarSection title="Meetings & voice">
          {meetings.map((m) => (
            <SidebarItem
              key={m.id}
              icon={m.status === "live" ? Video : CalendarIcon}
              label={m.title}
              onClick={() => navigate("meeting", { meetingId: m.id })}
              subtext={m.time}
            />
          ))}
          {voiceRooms.map((v) => (
            <SidebarItem
              key={v.id}
              icon={Mic}
              label={v.name}
              onClick={() => navigate("voice", { meetingId: v.id })}
              badge={v.participants || undefined}
            />
          ))}
        </SidebarSection>

        <SidebarSection title="Files & apps">
          <SidebarItem
            icon={FileText}
            label="Files"
            active={activeView === "files"}
            onClick={() => navigate("files")}
          />
          <SidebarItem icon={Sparkles} label="Integrations" />
          <SidebarItem
            icon={Settings}
            label="Settings"
            active={activeView === "settings"}
            onClick={() => navigate("settings")}
          />
        </SidebarSection>
      </div>

      <button
        type="button"
        onClick={toggleSidebar}
        className="absolute -right-3 top-1/2 z-10 flex h-6 w-3 -translate-y-1/2 cursor-col-resize items-center justify-center rounded bg-border opacity-0 transition-opacity hover:opacity-100"
        aria-label="Resize sidebar"
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
      >
        <span className="h-4 w-px bg-text-muted" />
      </button>
    </aside>
  );
}

function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </svg>
  );
}
