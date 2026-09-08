import { useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
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
  Star,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasAnyPermission } from "@teamspace-one/authorization";
import { useUIStore, type View } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import {
  useChannels,
  useCreateChannel,
  useCreateDirectChannel,
  useCreateMeeting,
  useCreateProject,
  useDeleteEndedMeetings,
  useMeetings,
  useMembers,
  useOrganisations,
  useAcceptInvitation,
  useCreateOrganisation,
  useProjects,
  useMe,
  useUnreadCount,
  useUsers,
  useWorkspaces,
} from "../../hooks/api";
import { type Channel, type Meeting, type UserDto } from "../../lib/api";
import { useSwitchOrganisation } from "../../hooks/useOrganisationSwitch";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { cn, getUserDisplayName } from "../../lib/utils";

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
const CollapsibleContent = CollapsiblePrimitive.Content;

function getDirectMessageLabel(dm: Channel, meId: string | undefined, userMap: Map<string, UserDto>) {
  const others = dm.members.filter((m) => m.userId !== meId);
  const names = others.map((m) => getUserDisplayName(userMap.get(m.userId)));
  if (names.length === 0) return dm.name || "Direct message";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

interface SidebarItemData {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  badge?: number;
  mention?: boolean;
  active?: boolean;
  onClick?: () => void;
  subtext?: string;
  isPrivate?: boolean;
  external?: boolean;
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
  external,
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
      {external ? <Badge variant="warning">Client</Badge> : null}
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

function formatMeetingSubtext(m: Meeting) {
  if (m.status === "started") return "Live";
  if (m.status === "ended") return "Ended";
  if (m.scheduledAt) {
    return new Date(m.scheduledAt).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return "Upcoming";
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

export function WorkspaceSidebar() {
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [createMode, setCreateMode] = useState<"channel" | "direct" | "project" | "meeting" | null>(null);
  const [channelName, setChannelName] = useState("");
  const [privateChannel, setPrivateChannel] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [meetingTitle, setMeetingTitle] = useState("");
  const [meetingDescription, setMeetingDescription] = useState("");
  const [meetingScheduledAt, setMeetingScheduledAt] = useState("");
  const [orgDialog, setOrgDialog] = useState<"create" | "join" | null>(null);
  const [orgName, setOrgName] = useState("");
  const [inviteToken, setInviteToken] = useState("");
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

  const activeOrgId = useUIStore((s) => s.organisationId);
  const activeWorkspaceId = useUIStore((s) => s.activeWorkspaceId);
  const setActiveWorkspace = useUIStore((s) => s.setActiveWorkspace);
  const switchOrganisation = useSwitchOrganisation();
  const { data: organisations } = useOrganisations();
  const { data: workspaces } = useWorkspaces(activeOrgId ?? undefined);
  const { data: members } = useMembers(activeOrgId ?? undefined);
  const { data: channels } = useChannels();
  const memberUserIds = useMemo(() => {
    const ids = new Set((members ?? []).map((m) => m.userId));
    for (const channel of channels ?? []) {
      for (const member of channel.members ?? []) {
        ids.add(member.userId);
      }
    }
    return [...ids];
  }, [members, channels]);
  const { data: users } = useUsers(memberUserIds);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  const { data: me } = useMe();
  const { user: authzUser } = usePermissionContext();
  const canAny = (permissions: string[]) =>
    authzUser ? hasAnyPermission(authzUser, permissions) : false;
  const canCollaborate = canAny(["collaboration.access"]);
  const canHrms =
    canAny(["hrms.access"]) ||
    Boolean(authzUser?.permissions.some((p) => p.startsWith("hrms.")));
  const createChannel = useCreateChannel();
  const createDirectChannel = useCreateDirectChannel();
  const createProject = useCreateProject();
  const createMeeting = useCreateMeeting();
  const deleteEndedMeetings = useDeleteEndedMeetings();
  const { data: projects } = useProjects();
  const { data: meetings } = useMeetings();
  const { data: unread } = useUnreadCount();
  const createOrganisation = useCreateOrganisation();
  const acceptInvitation = useAcceptInvitation();

  const currentOrganisation = organisations?.find((o) => o.id === activeOrgId);
  const currentWorkspace =
    workspaces?.find((w) => w.id === activeWorkspaceId) ?? workspaces?.[0];

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

  function toggleMember(userId: string) {
    setSelectedMembers((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  function closeCreate() {
    setCreateMode(null);
    setChannelName("");
    setPrivateChannel(false);
    setSelectedMembers([]);
    setMeetingTitle("");
    setMeetingDescription("");
    setMeetingScheduledAt("");
  }

  function handleDeleteEndedMeetings() {
    const count = visibleMeetings.filter((m) => m.status === "ended").length;
    if (count === 0) return;
    if (!window.confirm(`Delete ${count} ended meeting${count === 1 ? "" : "s"}? This cannot be undone.`)) return;
    deleteEndedMeetings.mutate(currentWorkspace?.id);
  }

  function submitCreateMeeting(instant = false) {
    if (!meetingTitle.trim()) return;
    createMeeting.mutate(
      {
        title: meetingTitle.trim(),
        description: meetingDescription || undefined,
        workspaceId: currentWorkspace?.id,
        scheduledAt: instant ? undefined : meetingScheduledAt || undefined,
      },
      {
        onSuccess: (meeting) => {
          closeCreate();
          navigate(meeting.type === "voice_room" ? "voice" : "meeting", { meetingId: meeting.id });
        },
      },
    );
  }

  function submitCreate() {
    if (createMode === "channel") {
      if (!channelName.trim()) return;
      createChannel.mutate(
        { name: channelName.trim(), workspaceId: currentWorkspace?.id, type: privateChannel ? "private" : "public", memberIds: selectedMembers },
        { onSuccess: (channel) => { closeCreate(); navigate("channel", { channelId: channel.id }); } },
      );
    } else if (createMode === "direct" && selectedMembers.length > 0) {
      createDirectChannel.mutate(selectedMembers, {
        onSuccess: (channel) => { closeCreate(); navigate("dm", { channelId: channel.id }); },
      });
    } else if (createMode === "project" && channelName.trim()) {
      createProject.mutate(
        { name: channelName.trim(), workspaceId: currentWorkspace?.id, memberIds: selectedMembers },
        { onSuccess: (project) => { closeCreate(); navigate("project", { projectId: project.id }); } },
      );
    }
  }

  const workspaceName = currentWorkspace?.name ?? currentOrganisation?.name ?? "Workspace";

  const inWorkspace = (workspaceId?: string | null) =>
    !activeWorkspaceId || !workspaceId || workspaceId === activeWorkspaceId;
  const publicChannels = channels?.filter((c) => c.type !== "direct" && inWorkspace(c.workspaceId)) ?? [];
  const directMessages = useMemo(() => {
    const dms = channels?.filter((c) => c.type === "direct") ?? [];
    return dms
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 10);
  }, [channels]);
  const visibleProjects = projects?.filter((p) => inWorkspace(p.workspaceId)) ?? [];
  const visibleMeetings = meetings?.filter((m) => inWorkspace((m as { workspaceId?: string }).workspaceId)) ?? [];

  // Early return must come after every hook call above (e.g. the
  // directMessages useMemo) or React throws a hook-order error on collapse.
  if (sidebarCollapsed) {
    return null;
  }

  return (
    <>
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
                  {workspaceName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text">
                  {workspaceName}
                </div>
                <div className="text-xs text-text-muted capitalize">
                  {currentOrganisation?.slug ?? "workspace"}
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {organisations?.map((org) => (
              <DropdownMenuItem
                key={org.id}
                onClick={() => switchOrganisation(org.id)}
              >
                <span className="flex flex-1 items-center justify-between">
                  {org.name}
                  {org.id === activeOrgId && (
                    <span className="text-xs text-text-muted">current</span>
                  )}
                </span>
              </DropdownMenuItem>
            ))}
            {(!organisations || organisations.length === 0) && (
              <>
                <DropdownMenuItem disabled>No organisations</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setOrgDialog("create")}>
                  Create organisation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setOrgDialog("join")}>
                  Join organisation
                </DropdownMenuItem>
              </>
            )}
            {workspaces && workspaces.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled className="text-xs uppercase tracking-wide text-text-muted">
                  Workspaces
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setActiveWorkspace(null)}>
                  <span className="flex flex-1 items-center justify-between">
                    All workspaces
                    {!activeWorkspaceId && <span className="text-xs text-text-muted">current</span>}
                  </span>
                </DropdownMenuItem>
                {workspaces.map((workspace) => (
                  <DropdownMenuItem key={workspace.id} onClick={() => setActiveWorkspace(workspace.id)}>
                    <span className="flex flex-1 items-center justify-between">
                      {workspace.name}
                      {workspace.id === currentWorkspace?.id && activeWorkspaceId ? (
                        <span className="text-xs text-text-muted">current</span>
                      ) : null}
                    </span>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        {canAny([
          "collaboration.message.send",
          "collaboration.channel.create",
          "collaboration.project.create",
          "collaboration.meeting.create",
        ]) ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label="Quick action">
              <Plus className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canAny(["collaboration.message.send"]) ? (
              <DropdownMenuItem onClick={() => setCreateMode("direct")}>
                New message
              </DropdownMenuItem>
            ) : null}
            {canAny(["collaboration.channel.create"]) ? (
              <DropdownMenuItem onClick={() => setCreateMode("channel")}>
                Create channel
              </DropdownMenuItem>
            ) : null}
            {canAny(["collaboration.project.create"]) ? (
              <DropdownMenuItem onClick={() => setCreateMode("project")}>
                Create project
              </DropdownMenuItem>
            ) : null}
            {canAny(["collaboration.meeting.create"]) ? (
              <DropdownMenuItem onClick={() => setCreateMode("meeting")}>
                Schedule meeting
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        ) : null}
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
          {canAny(["dashboard.view"]) ? (
            <SidebarItem
              icon={Home}
              label="Home"
              active={activeView === "home"}
              onClick={() => navigate("home")}
            />
          ) : null}
          <SidebarItem
            icon={Inbox}
            label="Inbox"
            badge={unread?.count ?? 0}
            active={activeView === "inbox"}
            onClick={() => navigate("inbox")}
          />
          {canCollaborate ? (
            <SidebarItem
              icon={Users}
              label="Members"
              active={activeView === "members"}
              onClick={() => navigate("members")}
            />
          ) : null}
          <SidebarItem
            icon={Menu}
            label="Drafts"
            active={activeView === "drafts"}
            onClick={() => navigate("drafts")}
          />
          <SidebarItem
            icon={Star}
            label="Saved items"
            active={activeView === "saved"}
            onClick={() => navigate("saved")}
          />
          {canHrms ? (
            <SidebarItem
              icon={BriefcaseBusiness}
              label="HRMS"
              active={activeView === "hrms"}
              onClick={() => navigate("hrms")}
            />
          ) : null}
        </SidebarSection>

        {canCollaborate ? (
        <SidebarSection title="Channels">
          {publicChannels.length > 0 ? (
            publicChannels.map((ch) => (
              <SidebarItem
                key={ch.id}
                icon={ch.type === "private" ? Lock : Hash}
                label={ch.name}
                active={activeView === "channel" && activeChannelId === ch.id}
                onClick={() => navigate("channel", { channelId: ch.id })}
                isPrivate={ch.type === "private"}
              />
            ))
          ) : (
            <div className="px-2 py-1 text-xs text-text-muted">No channels yet</div>
          )}
        </SidebarSection>
        ) : null}

        {canCollaborate ? (
        <SidebarSection title="Direct messages">
          {directMessages.length > 0 ? (
            directMessages.map((dm) => {
              const Icon = ({ className }: { className?: string }) => (
                <span
                  className={cn(
                    "h-2 w-2 rounded-full bg-online",
                    className,
                  )}
                />
              );
              return (
                <SidebarItem
                  key={dm.id}
                  icon={Icon}
                  label={getDirectMessageLabel(dm, me?.id, userMap)}
                  active={activeView === "dm" && activeChannelId === dm.id}
                  onClick={() => navigate("dm", { channelId: dm.id })}
                />
              );
            })
          ) : (
            <div className="px-2 py-1 text-xs text-text-muted">No direct messages yet</div>
          )}
        </SidebarSection>
        ) : null}

        {canAny(["collaboration.project.view"]) ? (
        <SidebarSection title="Projects">
          {visibleProjects.length > 0 ? (
            visibleProjects.map((p) => (
              <SidebarItem
                key={p.id}
                icon={Folder}
                label={p.name}
                active={activeView === "project" && activeProjectId === p.id}
                onClick={() => navigate("project", { projectId: p.id })}
                subtext={p.status}
                external={Boolean(p.clientId)}
              />
            ))
          ) : (
            <div className="px-2 py-1 text-xs text-text-muted">No projects yet</div>
          )}
        </SidebarSection>
        ) : null}

        {canAny(["collaboration.meeting.view"]) ? (
        <SidebarSection title="Meetings">
          {visibleMeetings.length > 0 ? (
            visibleMeetings.map((m) => (
              <SidebarItem
                key={m.id}
                icon={m.type === "voice_room" ? Mic : m.status === "started" ? Video : CalendarIcon}
                label={m.title}
                onClick={() => navigate(m.type === "voice_room" ? "voice" : "meeting", { meetingId: m.id })}
                subtext={
                  m.type === "voice_room" && m.status === "started"
                    ? `${m.participants?.filter((p) => !p.leftAt)?.length ?? 0} in room`
                    : formatMeetingSubtext(m)
                }
              />
            ))
          ) : (
            <div className="px-2 py-1 text-xs text-text-muted">No meetings yet</div>
          )}
          {visibleMeetings.some((m) => m.status === "ended") && (
            <button
              type="button"
              disabled={deleteEndedMeetings.isPending}
              onClick={handleDeleteEndedMeetings}
              className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-error hover:bg-surface-elevated"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete ended meetings
            </button>
          )}
        </SidebarSection>
        ) : null}

        {canAny(["collaboration.file.view"]) ? (
          <SidebarSection title="Files & apps">
            <SidebarItem
              icon={FileText}
              label="Files"
              active={activeView === "files"}
              onClick={() => navigate("files")}
            />
          </SidebarSection>
        ) : null}
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
    <Dialog open={createMode !== null} onOpenChange={(open) => { if (!open) closeCreate(); }}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>{createMode === "channel" ? "Create channel" : createMode === "project" ? "Create project" : createMode === "meeting" ? "Schedule meeting" : "New direct message"}</DialogTitle>
          <DialogDescription>
            {createMode === "channel" ? "Create a public or private space for your team." : createMode === "project" ? "Create a project and choose its initial members." : createMode === "meeting" ? "Start an instant meeting or schedule one for later." : "Choose one or more organisation members."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 px-4 pb-4">
          {(createMode === "channel" || createMode === "project") ? (
            <>
              <Input value={channelName} onChange={(e) => setChannelName(e.target.value)} placeholder={createMode === "project" ? "Project name" : "Channel name"} autoFocus />
              {createMode === "channel" ? <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={privateChannel} onChange={(e) => setPrivateChannel(e.target.checked)} />
                Private channel
              </label> : null}
            </>
          ) : null}
          {createMode === "meeting" ? (
            <>
              <Input value={meetingTitle} onChange={(e) => setMeetingTitle(e.target.value)} placeholder="Meeting title" autoFocus />
              <Input value={meetingDescription} onChange={(e) => setMeetingDescription(e.target.value)} placeholder="Description (optional)" />
              <Input type="datetime-local" value={meetingScheduledAt} onChange={(e) => setMeetingScheduledAt(e.target.value)} />
            </>
          ) : null}
          {(createMode === "direct" || createMode === "project" || privateChannel) ? (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
              {members?.map((member) => (
                <label key={member.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surface-elevated">
                  <input type="checkbox" checked={selectedMembers.includes(member.userId)} onChange={() => toggleMember(member.userId)} />
                  <span className="flex-1 truncate">{getUserDisplayName(userMap.get(member.userId))}</span>
                  <span className="text-xs text-text-muted">{member.role.name}</span>
                </label>
              ))}
              {!members?.length ? <p className="p-2 text-sm text-text-muted">No organisation members available.</p> : null}
            </div>
          ) : null}
          {(createChannel.error || createDirectChannel.error || createProject.error || createMeeting.error) ? (
            <p className="text-sm text-error">{(createChannel.error ?? createDirectChannel.error ?? createProject.error ?? createMeeting.error)?.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeCreate}>Cancel</Button>
            {createMode === "meeting" ? (
              <>
                <Button variant="secondary" onClick={() => submitCreateMeeting(true)} disabled={!meetingTitle.trim() || createMeeting.isPending}>
                  Start now
                </Button>
                <Button onClick={() => submitCreateMeeting(false)} disabled={!meetingTitle.trim() || !meetingScheduledAt || createMeeting.isPending}>
                  Schedule
                </Button>
              </>
            ) : (
              <Button onClick={submitCreate} disabled={createChannel.isPending || createDirectChannel.isPending || createProject.isPending || (createMode === "direct" ? selectedMembers.length === 0 : !channelName.trim())}>
                Create
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={orgDialog !== null} onOpenChange={(open) => { if (!open) { setOrgDialog(null); setOrgName(""); setInviteToken(""); } }}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>{orgDialog === "create" ? "Create organisation" : "Join organisation"}</DialogTitle>
          <DialogDescription>
            {orgDialog === "create" ? "Create a new organisation and switch to it." : "Paste an invitation token to join an organisation."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          {orgDialog === "create" ? (
            <Input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Organisation name" autoFocus />
          ) : (
            <Input value={inviteToken} onChange={(e) => setInviteToken(e.target.value)} placeholder="Invitation token" autoFocus />
          )}
          {(createOrganisation.error || acceptInvitation.error) ? (
            <p className="text-sm text-error">{(createOrganisation.error ?? acceptInvitation.error)?.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOrgDialog(null)}>Cancel</Button>
            <Button
              disabled={
                orgDialog === "create"
                  ? !orgName.trim() || createOrganisation.isPending
                  : !inviteToken.trim() || acceptInvitation.isPending
              }
              onClick={() => {
                if (orgDialog === "create") {
                  createOrganisation.mutate(orgName.trim(), {
                    onSuccess: (org) => {
                      setOrgDialog(null);
                      setOrgName("");
                      switchOrganisation(org.id);
                    },
                  });
                } else {
                  acceptInvitation.mutate(inviteToken.trim(), {
                    onSuccess: (member) => {
                      setOrgDialog(null);
                      setInviteToken("");
                      switchOrganisation(member.organisationId);
                    },
                  });
                }
              }}
            >
              {orgDialog === "create" ? "Create" : "Join"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
