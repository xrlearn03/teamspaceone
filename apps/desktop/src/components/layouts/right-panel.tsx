import { useEffect, useMemo, useState } from "react";
import { X, Hash, Folder, Info, Calendar, Users, Mic } from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import { EmptyState } from "../ui/empty-state";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  useAddChannelModerator,
  useChannels,
  useMeeting,
  useMe,
  useMembers,
  usePinnedMessages,
  useProjects,
  useRemoveChannelModerator,
  useTasks,
  useUsers,
} from "../../hooks/api";
import { getUserDisplayName } from "../../lib/utils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b px-4 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="truncate text-text">{value ?? "—"}</span>
    </div>
  );
}

function MemberList({
  userIds,
  externalIds,
  renderMeta,
}: {
  userIds: string[];
  externalIds?: Set<string>;
  renderMeta?: (userId: string) => React.ReactNode;
}) {
  const { data: users } = useUsers(userIds);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);
  if (!userIds.length) return <p className="text-sm text-text-muted">No members.</p>;
  return (
    <div className="space-y-1.5">
      {userIds.map((id) => (
        <div key={id} className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[10px]">{getUserDisplayName(userMap.get(id)).slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate text-sm text-text">{getUserDisplayName(userMap.get(id))}</span>
          {externalIds?.has(id) ? <Badge variant="warning">External</Badge> : null}
          {renderMeta ? renderMeta(id) : null}
        </div>
      ))}
    </div>
  );
}

function ChannelDetails() {
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const organisationId = useUIStore((s) => s.organisationId);
  const { data: channels } = useChannels();
  const { data: members } = useMembers(organisationId ?? undefined);
  const { data: me } = useMe();
  const addModerator = useAddChannelModerator();
  const removeModerator = useRemoveChannelModerator();
  const channel = channels?.find((c) => c.id === activeChannelId) ?? channels?.[0];
  const externalIds = new Set(
    (members ?? []).filter((m) => /client|external/i.test(m.role.name)).map((m) => m.userId),
  );
  if (!channel) return <EmptyState icon={Hash} title="No channel" description="Select a channel to see its details." />;
  const memberIds = channel.members.map((m) => m.userId);
  const isOwner = me ? channel.members.some((m) => m.userId === me.id && m.role === "owner") : false;
  const memberMap = useMemo(() => new Map(channel.members.map((m) => [m.userId, m])), [channel.members]);
  const renderMeta = (userId: string) => {
    const member = memberMap.get(userId);
    if (!member) return null;
    return (
      <div className="flex items-center gap-1.5">
        {member.role !== "member" ? <Badge variant={member.role === "owner" ? "default" : "secondary"}>{member.role}</Badge> : null}
        {isOwner && userId !== me?.id ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-5 px-1.5 text-[10px]"
            onClick={() =>
              member.role === "moderator"
                ? removeModerator.mutate({ channelId: channel.id, userId })
                : addModerator.mutate({ channelId: channel.id, userId })
            }
            disabled={addModerator.isPending || removeModerator.isPending}
          >
            {member.role === "moderator" ? "Demote" : "Moderator"}
          </Button>
        ) : null}
      </div>
    );
  };
  const { data: pinned } = usePinnedMessages(channel.id);
  const pinnedSenderIds = useMemo(
    () => [...new Set((pinned ?? []).map((m) => m.senderId))],
    [pinned],
  );
  const { data: pinnedUsers } = useUsers(pinnedSenderIds);
  const pinnedUserMap = useMemo(() => new Map((pinnedUsers ?? []).map((u) => [u.id, u])), [pinnedUsers]);
  return (
    <>
      <Section title="About">
        <Meta label="Name" value={`#${channel.name}`} />
        <Meta label="Type" value={<span className="capitalize">{channel.type}</span>} />
        <Meta label="Created" value={new Date(channel.createdAt).toLocaleDateString()} />
      </Section>
      <Section title={`Members (${memberIds.length})`}>
        <MemberList userIds={memberIds} externalIds={externalIds} renderMeta={renderMeta} />
      </Section>
      <Section title="Pinned & shared">
        {!pinned?.length ? (
          <p className="text-sm text-text-muted">No pinned messages yet.</p>
        ) : (
          <div className="space-y-2">
            {pinned.map((m) => {
              const sender = pinnedUserMap.get(m.senderId);
              const preview = m.content.length > 80 ? `${m.content.slice(0, 80)}…` : m.content;
              return (
                <div key={m.id} className="rounded border bg-surface-elevated p-2">
                  <p className="text-xs text-text-muted">{getUserDisplayName(sender)}</p>
                  <p className="mt-0.5 text-sm text-text">{preview}</p>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}

function DirectMessageDetails() {
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const { data: channels } = useChannels();
  const contact = channels?.find((c) => c.id === activeChannelId && c.type === "direct")
    ?? channels?.find((c) => c.type === "direct");
  if (!contact) return <EmptyState icon={Users} title="No conversation" description="Select a conversation to see details." />;
  const memberIds = contact.members.map((m) => m.userId);
  return (
    <>
      <Section title="Conversation">
        <Meta label="Name" value={contact.name} />
        <Meta label="Participants" value={memberIds.length} />
        <Meta label="Created" value={new Date(contact.createdAt).toLocaleDateString()} />
      </Section>
      <Section title="Participants">
        <MemberList userIds={memberIds} />
      </Section>
    </>
  );
}

function ProjectDetails() {
  const activeProjectId = useUIStore((s) => s.activeProjectId);
  const organisationId = useUIStore((s) => s.organisationId);
  const { data: projects } = useProjects();
  const { data: members } = useMembers(organisationId ?? undefined);
  const project = projects?.find((p) => p.id === activeProjectId) ?? projects?.[0];
  const { data: tasks } = useTasks(project?.id);
  const externalIds = new Set(
    (members ?? []).filter((m) => /client|external/i.test(m.role.name)).map((m) => m.userId),
  );
  if (!project) return <EmptyState icon={Folder} title="No project" description="Select a project to see its details." />;
  const done = (tasks ?? []).filter((t) => t.status === "done").length;
  const total = tasks?.length ?? 0;
  const memberIds = project.members.map((m) => m.userId);
  return (
    <>
      <Section title="About">
        <Meta label="Status" value={<span className="capitalize">{project.status.replace("_", " ")}</span>} />
        <Meta label="Progress" value={total ? `${done}/${total} tasks done` : "No tasks"} />
        <Meta label="Start" value={project.startDate ? new Date(project.startDate).toLocaleDateString() : null} />
        <Meta label="Target" value={project.targetDate ? new Date(project.targetDate).toLocaleDateString() : null} />
        {project.clientId ? <Meta label="Visibility" value={<Badge variant="warning">Shared with client</Badge>} /> : null}
      </Section>
      {project.description ? (
        <Section title="Description">
          <p className="text-sm text-text-secondary">{project.description}</p>
        </Section>
      ) : null}
      <Section title={`Members (${memberIds.length})`}>
        <MemberList userIds={memberIds} externalIds={externalIds} />
      </Section>
    </>
  );
}

function MeetingDetails() {
  const activeMeetingId = useUIStore((s) => s.activeMeetingId);
  const { data: meeting } = useMeeting(activeMeetingId ?? undefined);
  if (!meeting) return <EmptyState icon={Calendar} title="No meeting" description="Select a meeting to see its details." />;
  const active = (meeting.participants ?? []).filter((p) => !p.leftAt);
  return (
    <>
      <Section title="Meeting">
        <Meta label="Title" value={meeting.title} />
        <Meta label="Status" value={<span className="capitalize">{meeting.status.replace("_", " ")}</span>} />
        <Meta label="Scheduled" value={meeting.scheduledAt ? new Date(meeting.scheduledAt).toLocaleString() : null} />
        <Meta label="Recording" value={meeting.isRecording ? "Recording" : "Off"} />
      </Section>
      <Section title={`Participants (${active.length})`}>
        <MemberList userIds={active.map((p) => p.userId)} />
      </Section>
    </>
  );
}

function panelContent(view: string) {
  switch (view) {
    case "channel":
      return { icon: Hash, title: "Channel details", body: <ChannelDetails /> };
    case "dm":
      return { icon: Users, title: "Conversation details", body: <DirectMessageDetails /> };
    case "project":
      return { icon: Folder, title: "Project details", body: <ProjectDetails /> };
    case "meeting":
      return { icon: Calendar, title: "Meeting details", body: <MeetingDetails /> };
    case "voice":
      return { icon: Mic, title: "Voice room details", body: <MeetingDetails /> };
    default:
      return null;
  }
}

export function RightPanel() {
  const { activeView, rightPanelOpen, rightPanelWidth, toggleRightPanel, setRightPanelWidth } = useUIStore(
    useShallow((s) => ({
      activeView: s.activeView,
      rightPanelOpen: s.rightPanelOpen,
      rightPanelWidth: s.rightPanelWidth,
      toggleRightPanel: s.toggleRightPanel,
      setRightPanelWidth: s.setRightPanelWidth,
    })),
  );
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      setRightPanelWidth(window.innerWidth - e.clientX);
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
  }, [dragging, setRightPanelWidth]);

  if (!rightPanelOpen) return null;

  const content = panelContent(activeView);

  return (
    <aside
      className="relative flex shrink-0 flex-col border-l bg-surface"
      style={{ width: rightPanelWidth }}
    >
      <div className="flex h-12 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold text-text">{content?.title ?? "Details"}</span>
        <button
          type="button"
          onClick={toggleRightPanel}
          className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="Close details panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {content?.body ?? (
          <EmptyState
            icon={Info}
            title="No details"
            description="Open a channel, conversation, project, or meeting to see context here."
          />
        )}
      </div>
      <button
        type="button"
        className="absolute -left-1 top-0 h-full w-2 cursor-col-resize"
        aria-label="Resize details panel"
        onMouseDown={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
      />
    </aside>
  );
}
