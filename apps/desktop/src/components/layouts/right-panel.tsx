import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  FileArchive,
  File as FileIcon,
  FileText,
  Folder,
  Hash,
  Info,
  Link2,
  Mic,
  Phone,
  Pin,
  Users,
  Video,
  X,
} from "lucide-react";
import { useUIStore } from "../../stores/ui";
import { useShallow } from "zustand/shallow";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Badge } from "@teamspace-one/ui/badge";
import { Button } from "@teamspace-one/ui/button";
import {
  useAddChannelModerator,
  useChannels,
  useCreateMeeting,
  useCreateVoiceRoom,
  useFiles,
  useMeeting,
  useMe,
  useMembers,
  useMessages,
  usePinnedMessages,
  useProjects,
  useRemoveChannelModerator,
  useTasks,
  useUsers,
} from "../../hooks/api";
import { useRealtime } from "../../hooks/useRealtime";
import { cn, getUserDisplayName } from "../../lib/utils";
import { UserAvatar } from "../user-avatar";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold text-text">{title}</p>
        {action}
      </div>
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

function AboutRow({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-text-muted">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fileIcon(mime: string) {
  if (/zip|tar|gzip|archive/.test(mime)) return FileArchive;
  if (/pdf|word|text|markdown|presentation|sheet|document/.test(mime)) return FileText;
  return FileIcon;
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
          <UserAvatar user={userMap.get(id)} className="h-7 w-7" />
          <span className="flex-1 truncate text-sm text-text">{getUserDisplayName(userMap.get(id))}</span>
          {externalIds?.has(id) ? <Badge variant="warning">Client</Badge> : null}
          {renderMeta ? renderMeta(id) : null}
        </div>
      ))}
    </div>
  );
}

type ChannelPanelTab = "about" | "members" | "files" | "links";

const URL_RE = /https?:\/\/[^\s<>"']+/g;

function ChannelDetails() {
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const organisationId = useUIStore((s) => s.organisationId);
  const { data: channels } = useChannels();
  const { data: members } = useMembers(organisationId ?? undefined);
  const { data: me } = useMe();
  const addModerator = useAddChannelModerator();
  const removeModerator = useRemoveChannelModerator();
  const channel = channels?.find((c) => c.id === activeChannelId) ?? channels?.[0];
  const [tab, setTab] = useState<ChannelPanelTab>("about");
  const { data: pinned } = usePinnedMessages(channel?.id);
  const { data: messages } = useMessages(channel?.id);
  const { data: allFiles } = useFiles();
  const externalIds = new Set(
    (members ?? []).filter((m) => /client|external/i.test(m.role.name)).map((m) => m.userId),
  );
  const memberIds = useMemo(() => (channel?.members ?? []).map((m) => m.userId), [channel]);
  const { data: memberUsers } = useUsers(memberIds);
  const memberUserMap = useMemo(() => new Map((memberUsers ?? []).map((u) => [u.id, u])), [memberUsers]);
  const pinnedSenderIds = useMemo(
    () => [...new Set((pinned ?? []).map((m) => m.senderId))],
    [pinned],
  );
  const { data: pinnedUsers } = useUsers(pinnedSenderIds);
  const pinnedUserMap = useMemo(() => new Map((pinnedUsers ?? []).map((u) => [u.id, u])), [pinnedUsers]);

  const channelFiles = useMemo(
    () => (allFiles ?? []).filter((f) => f.resourceType === "channel" && f.resourceId === channel?.id),
    [allFiles, channel?.id],
  );

  const channelLinks = useMemo(() => {
    const out: { url: string; senderId: string; createdAt: string }[] = [];
    for (const m of messages ?? []) {
      if (m.deletedAt) continue;
      for (const url of m.content.match(URL_RE) ?? []) {
        out.push({ url, senderId: m.senderId, createdAt: m.createdAt });
      }
    }
    return out;
  }, [messages]);

  if (!channel) return <EmptyState icon={Hash} title="No channel" description="Select a channel to see its details." />;

  const isOwner = me ? channel.members.some((m) => m.userId === me.id && m.role === "owner") : false;
  const memberMap = new Map(channel.members.map((m) => [m.userId, m]));
  const creatorUser = memberUserMap.get(channel.createdBy);
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

  return (
    <>
      {/* Panel header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <Hash className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-text">{channel.name}</h2>
            <p className="truncate text-xs capitalize text-text-muted">
              {channel.type} channel · {memberIds.length} members
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => useUIStore.getState().toggleRightPanel()}
          className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="Close details panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex h-11 shrink-0 items-center border-b border-border px-2">
        {([
          ["about", "About"],
          ["members", `Members (${memberIds.length})`],
          ["files", "Files"],
          ["links", "Links"],
        ] as [ChannelPanelTab, string][]).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "relative flex h-full items-center px-3 text-xs font-medium",
              tab === id ? "text-text" : "text-text-muted hover:text-text-secondary",
            )}
          >
            {label}
            {tab === id && <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "about" ? (
          <>
            <div className="border-b border-border p-4">
              <div className="flex flex-col gap-4">
                <AboutRow icon={Users} label="Created by">
                  <div className="flex items-center gap-2">
                    <UserAvatar user={creatorUser} className="h-6 w-6" />
                    <span className="text-xs text-text">{getUserDisplayName(creatorUser)}</span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-text-muted">
                    on {new Date(channel.createdAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </AboutRow>
                <AboutRow icon={Link2} label="Type">
                  <p className="text-xs capitalize text-text">{channel.type}</p>
                </AboutRow>
                <AboutRow icon={Pin} label="Pinned messages">
                  <p className="text-xs text-text">{(pinned ?? []).length} pinned</p>
                </AboutRow>
              </div>
            </div>

            <Section title="Pinned Messages">
              {(pinned ?? []).length === 0 ? (
                <p className="text-xs text-text-muted">No pinned messages yet.</p>
              ) : (
                <div className="space-y-2">
                  {(pinned ?? []).map((m) => {
                    const preview = m.content.length > 80 ? `${m.content.slice(0, 80)}…` : m.content;
                    return (
                      <div
                        key={m.id}
                        className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface-elevated/50 p-2.5"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                          <Pin className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-text">{preview || "Attachment"}</p>
                          <p className="mt-0.5 truncate text-[10px] text-text-muted">
                            {getUserDisplayName(pinnedUserMap.get(m.senderId))} ·{" "}
                            {new Date(m.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            <Section
              title="Recent Files"
              action={channelFiles.length > 0 ? <span className="text-xs font-medium text-primary">View all</span> : undefined}
            >
              {channelFiles.length === 0 ? (
                <p className="text-xs text-text-muted">No files shared in this channel.</p>
              ) : (
                <div className="space-y-1">
                  {channelFiles.slice(0, 5).map((f) => {
                    const FIcon = fileIcon(f.mimeType);
                    return (
                      <a
                        key={f.id}
                        href={f.downloadUrl ?? f.url ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-elevated"
                      >
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
                          <FIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 text-left">
                          <p className="truncate text-xs font-medium text-text">{f.originalName}</p>
                          <p className="mt-0.5 text-[10px] text-text-muted">
                            {new Date(f.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })} · {formatBytes(f.size)}
                          </p>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </Section>
          </>
        ) : tab === "members" ? (
          <div className="p-4">
            <MemberList userIds={memberIds} externalIds={externalIds} renderMeta={renderMeta} />
          </div>
        ) : tab === "files" ? (
          <div className="p-4">
            {channelFiles.length === 0 ? (
              <p className="text-xs text-text-muted">No files shared in this channel.</p>
            ) : (
              <div className="space-y-1">
                {channelFiles.map((f) => {
                  const FIcon = fileIcon(f.mimeType);
                  return (
                    <a
                      key={f.id}
                      href={f.downloadUrl ?? f.url ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-elevated"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
                        <FIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 text-left">
                        <p className="truncate text-xs font-medium text-text">{f.originalName}</p>
                        <p className="mt-0.5 text-[10px] text-text-muted">
                          {new Date(f.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })} · {formatBytes(f.size)}
                        </p>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4">
            {channelLinks.length === 0 ? (
              <p className="text-xs text-text-muted">No links shared in this channel.</p>
            ) : (
              <div className="space-y-1">
                {channelLinks.map((l, i) => (
                  <a
                    key={i}
                    href={l.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-elevated"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
                      <Link2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate text-xs font-medium text-primary">{l.url}</p>
                      <p className="mt-0.5 text-[10px] text-text-muted">
                        {new Date(l.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function DirectMessageDetails() {
  const activeChannelId = useUIStore((s) => s.activeChannelId);
  const organisationId = useUIStore((s) => s.organisationId);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: channels } = useChannels();
  const { data: members } = useMembers(organisationId ?? undefined);
  const { data: me } = useMe();
  const createMeeting = useCreateMeeting();
  const createVoiceRoom = useCreateVoiceRoom();
  const { sendCallRing } = useRealtime();
  const { data: allFiles } = useFiles();

  const contact = channels?.find((c) => c.id === activeChannelId && c.type === "direct")
    ?? channels?.find((c) => c.type === "direct");
  const memberIds = useMemo(() => contact?.members.map((m) => m.userId) ?? [], [contact]);
  const { data: memberUsers } = useUsers(memberIds);
  const memberUserMap = useMemo(() => new Map((memberUsers ?? []).map((u) => [u.id, u])), [memberUsers]);
  const { data: messages } = useMessages(contact?.id);

  const dmFiles = useMemo(
    () => (allFiles ?? []).filter((f) => f.resourceType === "channel" && f.resourceId === contact?.id),
    [allFiles, contact?.id],
  );

  const dmLinks = useMemo(() => {
    const out: { url: string; senderId: string; createdAt: string }[] = [];
    for (const m of messages ?? []) {
      if (m.deletedAt) continue;
      for (const url of m.content.match(URL_RE) ?? []) {
        out.push({ url, senderId: m.senderId, createdAt: m.createdAt });
      }
    }
    return out;
  }, [messages]);

  if (!contact) return <EmptyState icon={Users} title="No conversation" description="Select a conversation to see details." />;

  const others = contact.members.filter((m) => m.userId !== me?.id);
  const primaryUser = others[0] ? memberUserMap.get(others[0].userId) : undefined;
  const names = others.map((m) => getUserDisplayName(memberUserMap.get(m.userId)));
  const contactName =
    names.length === 0
      ? contact.name || "Direct message"
      : names.length <= 2
        ? names.join(", ")
        : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  const roleName = others[0]
    ? members?.find((m) => m.userId === others[0].userId)?.role.name
    : undefined;

  function startCall(video: boolean) {
    if (!contact) return;
    const title = `${contactName} ${video ? "video call" : "voice call"}`;
    const inviteeIds = contact.members.map((m) => m.userId).filter((id) => id !== me?.id);
    const ring = (meetingId: string) => {
      if (inviteeIds.length === 0) return;
      const callerName = me ? getUserDisplayName(me) : undefined;
      sendCallRing({ meetingId, kind: video ? "video" : "audio", title, channelId: contact.id, callerName, userIds: inviteeIds });
    };
    if (video) createMeeting.mutate({ title, inviteeIds }, { onSuccess: (meeting) => { ring(meeting.id); setActiveView("meeting", { meetingId: meeting.id }); } });
    else createVoiceRoom.mutate({ title, inviteeIds }, { onSuccess: (meeting) => { ring(meeting.id); setActiveView("voice", { meetingId: meeting.id }); } });
  }

  return (
    <>
      {/* Panel header */}
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar user={primaryUser} className="h-11 w-11" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-text">{contactName}</h2>
            <p className="truncate text-xs text-text-muted">
              {others.length > 1 ? `${memberIds.length} participants` : (roleName ?? "Direct message")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => useUIStore.getState().toggleRightPanel()}
          className="rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text"
          aria-label="Close details panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Profile card + quick actions */}
        <div className="border-b border-border p-4">
          <div className="flex flex-col items-center text-center">
            <UserAvatar user={primaryUser} className="h-20 w-20" />
            <h3 className="mt-3 text-base font-semibold text-text">{contactName}</h3>
            <p className="mt-0.5 truncate text-xs text-text-muted">
              {others.length > 1 ? "Group conversation" : (primaryUser?.email ?? "Direct message")}
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" disabled={createVoiceRoom.isPending} onClick={() => startCall(false)}>
              <Phone className="mr-1.5 h-3.5 w-3.5" />
              Call
            </Button>
            <Button variant="secondary" size="sm" disabled={createMeeting.isPending} onClick={() => startCall(true)}>
              <Video className="mr-1.5 h-3.5 w-3.5" />
              Video
            </Button>
          </div>
        </div>

        <Section title="Details">
          {others.length <= 1 ? <Meta label="Email" value={primaryUser?.email} /> : null}
          {roleName ? <Meta label="Role" value={<span className="capitalize">{roleName}</span>} /> : null}
          <Meta label="Participants" value={memberIds.length} />
          <Meta label="Created" value={new Date(contact.createdAt).toLocaleDateString()} />
        </Section>

        <Section title={`Shared files (${dmFiles.length})`}>
          {dmFiles.length === 0 ? (
            <p className="text-xs text-text-muted">No files shared in this conversation.</p>
          ) : (
            <div className="space-y-1">
              {dmFiles.map((f) => {
                const FIcon = fileIcon(f.mimeType);
                return (
                  <a
                    key={f.id}
                    href={f.downloadUrl ?? f.url ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-elevated"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
                      <FIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 text-left">
                      <p className="truncate text-xs font-medium text-text">{f.originalName}</p>
                      <p className="mt-0.5 text-[10px] text-text-muted">
                        {new Date(f.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })} · {formatBytes(f.size)}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </Section>

        <Section title={`Shared links (${dmLinks.length})`}>
          {dmLinks.length === 0 ? (
            <p className="text-xs text-text-muted">No links shared in this conversation.</p>
          ) : (
            <div className="space-y-1">
              {dmLinks.map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-surface-elevated"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
                    <Link2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="truncate text-xs font-medium text-primary">{l.url}</p>
                    <p className="mt-0.5 text-[10px] text-text-muted">
                      {getUserDisplayName(memberUserMap.get(l.senderId))} ·{" "}
                      {new Date(l.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}
        </Section>

        {memberIds.length > 2 ? (
          <Section title={`Participants (${memberIds.length})`}>
            <MemberList userIds={memberIds} />
          </Section>
        ) : null}
      </div>
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
      return { icon: Hash, title: null, body: <ChannelDetails />, bare: true };
    case "dm":
      return { icon: Users, title: null, body: <DirectMessageDetails />, bare: true };
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
      {content?.bare ? (
        content.body
      ) : (
        <>
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
        </>
      )}
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
