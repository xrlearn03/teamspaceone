import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Copy,
  Link2,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  MoreHorizontal,
  Phone,
  PhoneOff,
  Search,
  Send,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { cn, getUserDisplayName } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useRealtime } from "@/hooks/useRealtime";
import { useLiveTranscription } from "@/hooks/useLiveTranscription";
import { useMembers, useUsers } from "@/hooks/api";
import { useUIStore } from "@/stores/ui";
import { UserAvatar } from "@/components/user-avatar";
import {
  createMeetingMessage,
  getMeetingMessages,
  getMeetingShareLink,
  type Meeting,
  type MeetingMessage,
  type UserDto,
} from "@/lib/api";

interface QualityStats {
  audio: { packetsLost: number; jitter?: number; bitrate?: number };
  video: { packetsLost: number; jitter?: number; bitrate?: number };
  rtt?: number;
  timestamp?: number;
}

interface NativeConferenceProps {
  user?: UserDto | null;
  title?: string;
  connected?: boolean;
  meetingId: string;
  meeting?: Meeting;
  kind?: "audio" | "video";
  localStream?: MediaStream | null;
  localVideoEnabled?: boolean;
  localAudioEnabled?: boolean;
  remoteStreams?: { participantId: string; stream: MediaStream }[];
  participants?: { id: string; displayName: string; userId?: string }[];
  activeSpeakerId?: string | null;
  qualityStats?: QualityStats | null;
  screenShareEnabled?: boolean;
  isRecording?: boolean;
  isHost?: boolean;
  audioOutputId?: string;
  onLeave: () => void;
  onEnd?: () => void;
  onToggleAudio?: () => void;
  onToggleVideo?: () => void;
  onToggleScreenShare?: () => void;
}

/**
 * Presentational conference UI — the owning screen holds the single `useSfu`
 * instance and feeds all call state in as props. Do not call `useSfu` here:
 * a second hook instance means a second peer connection (double join).
 */
export function NativeConference({
  user,
  title = "Meeting",
  connected = false,
  meetingId,
  meeting,
  kind = "video",
  localStream,
  localVideoEnabled = false,
  localAudioEnabled = false,
  remoteStreams = [],
  participants = [],
  activeSpeakerId = null,
  qualityStats = null,
  screenShareEnabled = false,
  isHost = false,
  onLeave,
  onEnd,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
}: NativeConferenceProps) {
  const [copiedLink, setCopiedLink] = useState(false);

  const displayName = getUserDisplayName(user, "Guest");

  // Streams the local mic to ElevenLabs Scribe; committed lines are stored on
  // the meeting and merged into the MOM transcript on end. No-ops when the
  // transcription provider isn't configured (or for guests without JWT).
  useLiveTranscription({
    meetingId,
    stream: localStream ?? null,
    speaker: displayName,
    enabled: connected,
  });

  async function copyInviteLink() {
    try {
      const { url } = await getMeetingShareLink(meetingId);
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy invite link", err);
    }
  }

  const aloneInCall = remoteStreams.length === 0;

  const roomProps = {
    user,
    displayName,
    title,
    kind,
    meeting,
    meetingId,
    connected,
    localStream,
    micOn: localAudioEnabled,
    videoOn: localVideoEnabled,
    screenSharing: screenShareEnabled,
    isHost,
    qualityStats,
    participants,
    remoteStreams,
    copiedLink,
    onCopyInviteLink: copyInviteLink,
    onLeave,
    onEnd,
    onToggleAudio,
    onToggleVideo,
    onToggleScreenShare,
  };

  if (aloneInCall) {
    return <CallWaitingRoom {...roomProps} />;
  }

  return <ActiveCallRoom {...roomProps} activeSpeakerId={activeSpeakerId} />;
}

/* =========================================================
   Waiting room — shown while the local user is alone in call
========================================================= */

function WaitingControl({
  icon,
  label,
  active = true,
  danger = false,
  badge,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  danger?: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="group relative flex min-w-[72px] flex-col items-center gap-2">
      <span
        className={`relative flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.04] transition ${
          danger
            ? "bg-red-500 text-white shadow-xl shadow-red-950/40 hover:bg-red-400"
            : active
              ? "bg-[#132237] text-white hover:bg-[#1b2f48]"
              : "bg-red-500/15 text-red-400"
        }`}
      >
        {icon}
        {badge !== undefined && (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-violet-500 px-1.5 text-[11px] font-bold text-white shadow-lg">
            {badge}
          </span>
        )}
      </span>
      <span className="text-[12px] font-medium text-slate-300">{label}</span>
    </button>
  );
}

function CallWaitingRoom({
  user,
  displayName,
  title,
  kind,
  meeting,
  meetingId,
  connected,
  localStream,
  micOn,
  videoOn,
  screenSharing,
  isHost,
  qualityStats,
  participants,
  remoteStreams,
  copiedLink,
  onCopyInviteLink,
  onLeave,
  onEnd,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
}: {
  user?: UserDto | null;
  displayName: string;
  title: string;
  kind: "audio" | "video";
  meeting?: Meeting;
  meetingId: string;
  connected: boolean;
  localStream?: MediaStream | null;
  micOn: boolean;
  videoOn: boolean;
  screenSharing: boolean;
  isHost: boolean;
  qualityStats: { audio: { packetsLost: number }; video: { packetsLost: number } } | null;
  participants: { id: string; displayName: string; userId?: string }[];
  remoteStreams: { participantId: string; stream: MediaStream }[];
  copiedLink: boolean;
  onCopyInviteLink: () => void;
  onLeave: () => void;
  onEnd?: () => void;
  onToggleAudio?: () => void;
  onToggleVideo?: () => void;
  onToggleScreenShare?: () => void;
}) {
  const realtime = useRealtime();
  const realtimeRef = useRef(realtime);
  realtimeRef.current = realtime;
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState<"participants" | "chat">("participants");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const isAudio = kind === "audio";

  useEffect(() => {
    const interval = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream, videoOn]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  // Meeting chat: load history and subscribe to live messages.
  useEffect(() => {
    let cancelled = false;
    realtimeRef.current.joinRealtimeMeeting(meetingId);
    getMeetingMessages(meetingId)
      .then((res) => {
        if (!cancelled) setMessages(res.items);
      })
      .catch(() => {});
    const unsub = realtimeRef.current.onRealtimeEvent("meeting.chat.created", (msg) => {
      if (msg.meetingId !== meetingId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id)
          ? prev
          : [...prev, { ...msg, updatedAt: msg.createdAt }],
      );
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // realtime returns a fresh context value per provider render — depending on
    // it would refetch chat and rejoin the socket room on every realtime change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  function sendChatMessage() {
    const content = chatInput.trim();
    if (!content) return;
    setChatInput("");
    createMeetingMessage(meetingId, content)
      .then((msg) =>
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])),
      )
      .catch(() => {});
  }

  // All expected attendees: creator + invitees + recorded participants.
  const attendeeIds = useMemo(
    () =>
      [
        ...new Set(
          [
            meeting?.createdBy,
            ...(meeting?.invitees ?? []).map((i) => i.userId),
            ...(meeting?.participants ?? []).map((p) => p.userId),
          ].filter((id): id is string => Boolean(id) && !id!.startsWith("guest:")),
        ),
      ],
    [meeting],
  );
  const { data: attendeeUsers } = useUsers(attendeeIds);
  const attendeeMap = useMemo(
    () => new Map((attendeeUsers ?? []).map((u) => [u.id, u])),
    [attendeeUsers],
  );

  const joinedUserIds = useMemo(
    () =>
      new Set(
        [user?.id, ...participants.map((p) => p.userId)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    [user?.id, participants],
  );

  const remoteJoined = participants.filter((p) => p.userId !== user?.id);
  const waitingIds = attendeeIds.filter((id) => !joinedUserIds.has(id));
  const guestJoined = (meeting?.participants ?? []).filter(
    (p) => p.userId.startsWith("guest:") && p.guestName,
  );

  const joinedCount = joinedUserIds.size;
  const totalCount = Math.max(joinedCount, attendeeIds.length);
  const kindLabel = isAudio ? "Voice Call" : totalCount > 2 ? "Group Call" : "1:1 Call";

  const elapsedLabel =
    elapsed >= 3600
      ? `${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
      : `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;

  const loss =
    (qualityStats?.audio.packetsLost ?? 0) + (qualityStats?.video.packetsLost ?? 0);
  const signalLevel = !qualityStats ? 4 : loss > 50 ? 1 : loss > 10 ? 3 : 4;
  const signalColor =
    signalLevel <= 1 ? "bg-red-400" : signalLevel === 3 ? "bg-amber-400" : "bg-emerald-400";

  const streamFor = (pid: string) =>
    remoteStreams.find((s) => s.participantId === pid)?.stream ?? null;
  const mediaOn = (stream: MediaStream | null, kindOf: "audio" | "video") => {
    const tracks = kindOf === "audio" ? stream?.getAudioTracks() : stream?.getVideoTracks();
    return tracks?.some((t) => t.enabled && t.readyState !== "ended") ?? false;
  };

  const organisationId = useUIStore((s) => s.organisationId);
  const { data: members } = useMembers(organisationId ?? undefined);
  const memberUserIds = useMemo(() => (members ?? []).map((m) => m.userId), [members]);
  const { data: memberUsers } = useUsers(memberUserIds);
  const memberMap = useMemo(
    () => new Map((memberUsers ?? []).map((u) => [u.id, u])),
    [memberUsers],
  );
  const [ringed, setRinged] = useState<Set<string>>(new Set());
  const invitedIds = useMemo(
    () => new Set([...joinedUserIds, ...waitingIds, ...ringed]),
    [joinedUserIds, waitingIds, ringed],
  );
  const invitable = (members ?? []).filter((m) => !invitedIds.has(m.userId));

  function inviteMember(userId: string) {
    realtime.sendCallRing({ meetingId, kind, callerName: displayName, userIds: [userId] });
    setRinged((prev) => new Set([...prev, userId]));
    const u = memberMap.get(userId);
    toast.success(`Invited ${u ? getUserDisplayName(u) : "member"} to join the call`);
  }

  const q = query.trim().toLowerCase();
  const nameFor = (id: string, fallback?: string) => {
    const u = attendeeMap.get(id);
    return u ? getUserDisplayName(u) : (fallback ?? "Participant");
  };

  const visibleJoined = remoteJoined.filter(
    (p) => !q || (p.displayName ?? "").toLowerCase().includes(q),
  );
  const visibleWaiting = waitingIds.filter((id) => !q || nameFor(id).toLowerCase().includes(q));
  const showSelf = !q || displayName.toLowerCase().includes(q);

  const endLabel = onEnd ? "End Call" : "Leave";
  const endHandler = onEnd ?? onLeave;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#040b15] text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-52 bottom-[-150px] h-[600px] w-[700px] rounded-full bg-indigo-700/10 blur-[130px]" />
        <div className="absolute right-[-180px] bottom-[-120px] h-[500px] w-[600px] rounded-full bg-indigo-600/10 blur-[130px]" />
        <div className="absolute right-[25%] top-[-250px] h-[450px] w-[450px] rounded-full bg-blue-700/10 blur-[130px]" />
      </div>

      {/* Header */}
      <header className="relative flex h-[90px] shrink-0 items-center justify-between px-6">
        <div className="w-48" />
        <div className="text-center">
          <h1 className="text-[21px] font-semibold text-white">{title}</h1>
          <div className="mt-2 flex items-center justify-center gap-3 text-sm text-slate-400">
            <span>{kindLabel}</span>
            <span>•</span>
            <span>
              {joinedCount} of {totalCount} joined
            </span>
            {meeting?.durationMinutes ? (
              <>
                <span>•</span>
                <span>{meeting.durationMinutes} min</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="mr-2 flex items-end gap-1" title={connected ? "Connected" : "Connecting"}>
            {[8, 12, 17, 22].map((height, index) => (
              <span
                key={index}
                className={cn("w-1 rounded-full", index < signalLevel ? signalColor : "bg-white/15")}
                style={{ height }}
              />
            ))}
          </div>
          <span className="mr-3 text-sm font-medium tabular-nums text-white">{elapsedLabel}</span>
          <button
            onClick={endHandler}
            className="flex h-11 items-center gap-3 rounded-lg bg-red-500 px-5 text-sm font-semibold text-white shadow-lg shadow-red-950/30 transition hover:bg-red-400"
          >
            <PhoneOff size={16} />
            {endLabel}
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="relative min-h-0 flex-1 px-3 pb-3">
        <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_430px]">
          {/* Self media */}
          <section className="min-h-0 rounded-xl border border-white/[0.06] bg-[#071321]/80 p-4">
            <div className="relative h-full w-full overflow-hidden rounded-xl">
              {!isAudio && videoOn && localStream?.getVideoTracks().some((t) => t.enabled) ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 bg-[#111c2b]">
                  <UserAvatar
                    user={user}
                    className="h-24 w-24"
                    fallbackClassName="bg-[#334675] text-xl text-white"
                  />
                  <span className="text-sm text-slate-300">{displayName}</span>
                  {isAudio && !micOn ? (
                    <span className="text-xs text-red-400">Microphone off</span>
                  ) : null}
                </div>
              )}

              {/* Waiting banner */}
              <div className="absolute left-4 top-4 flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-[#07382f]/90 px-4 py-3 backdrop-blur-xl">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
                  <Volume2 size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">You're the only one here</p>
                  <p className="mt-0.5 text-xs text-slate-300">
                    {waitingIds.length > 0
                      ? "Others will join soon..."
                      : "Share the meeting link to invite participants."}
                  </p>
                </div>
              </div>

              {/* Name chip */}
              <div className="absolute bottom-4 left-4 rounded-lg bg-black/50 px-3 py-2 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">{displayName} (You)</span>
                  {isHost ? (
                    <span className="rounded-md bg-indigo-500/70 px-2 py-1 text-[10px] font-semibold">
                      Host
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* Sidebar */}
          <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#091827]/95">
            {/* Tabs */}
            <div className="flex h-[55px] shrink-0 border-b border-white/[0.06]">
              <button
                onClick={() => setTab("participants")}
                className={`relative flex w-[160px] items-center justify-center text-sm font-medium ${
                  tab === "participants" ? "text-white" : "text-slate-500"
                }`}
              >
                Participants ({joinedCount})
                {tab === "participants" && (
                  <span className="absolute bottom-0 left-5 right-5 h-0.5 bg-indigo-500" />
                )}
              </button>
              <button
                onClick={() => setTab("chat")}
                className={`relative flex w-[90px] items-center justify-center text-sm font-medium ${
                  tab === "chat" ? "text-white" : "text-slate-500"
                }`}
              >
                Chat
                {tab === "chat" && (
                  <span className="absolute bottom-0 left-5 right-5 h-0.5 bg-indigo-500" />
                )}
              </button>
            </div>

            {tab === "participants" ? (
              <>
                {/* Search */}
                <div className="shrink-0 px-4 py-4">
                  <div className="flex h-11 items-center gap-3 rounded-lg bg-[#102136] px-3">
                    <Search size={18} className="text-slate-400" />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search participants..."
                      className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
                    />
                  </div>
                </div>

                {/* Lists */}
                <div className="min-h-0 flex-1 overflow-y-auto px-5">
                  <section>
                    <h3 className="mb-2 text-sm font-semibold text-slate-200">
                      In call ({1 + remoteJoined.length + guestJoined.length})
                    </h3>
                    {showSelf ? (
                      <div className="flex items-center gap-4 rounded-xl px-1 py-3">
                        <div className="relative shrink-0">
                          <UserAvatar user={user} className="h-12 w-12" />
                          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#101b2a] bg-emerald-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-200">
                            {displayName} <span className="font-normal text-slate-400">(You)</span>
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {isHost ? "Host" : "Participant"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-full",
                              micOn
                                ? "bg-[#112136] text-slate-300"
                                : "bg-red-500/15 text-red-400",
                            )}
                          >
                            {micOn ? <Mic size={16} /> : <MicOff size={16} />}
                          </span>
                          {!isAudio ? (
                            <span
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-full",
                                videoOn
                                  ? "bg-[#112136] text-slate-300"
                                  : "bg-red-500/15 text-red-400",
                              )}
                            >
                              {videoOn ? <Video size={16} /> : <VideoOff size={16} />}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {visibleJoined.map((p) => {
                      const stream = streamFor(p.id);
                      const audio = mediaOn(stream, "audio");
                      const video = mediaOn(stream, "video");
                      const pUser = p.userId ? attendeeMap.get(p.userId) : undefined;
                      return (
                        <div key={p.id} className="flex items-center gap-4 rounded-xl px-1 py-3">
                          <div className="relative shrink-0">
                            <UserAvatar
                              user={pUser ?? { firstName: p.displayName, email: "" }}
                              className="h-12 w-12"
                            />
                            <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#101b2a] bg-emerald-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-200">
                              {p.displayName}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {p.userId === meeting?.createdBy ? "Host" : "Participant"}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "flex h-9 w-9 items-center justify-center rounded-full",
                                audio ? "bg-[#112136] text-slate-300" : "bg-red-500/15 text-red-400",
                              )}
                            >
                              {audio ? <Mic size={16} /> : <MicOff size={16} />}
                            </span>
                            {!isAudio ? (
                              <span
                                className={cn(
                                  "flex h-9 w-9 items-center justify-center rounded-full",
                                  video
                                    ? "bg-[#112136] text-slate-300"
                                    : "bg-red-500/15 text-red-400",
                                )}
                              >
                                {video ? <Video size={16} /> : <VideoOff size={16} />}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {guestJoined.map((p) => (
                      <div key={p.id} className="flex items-center gap-4 rounded-xl px-1 py-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#334675] text-sm font-medium text-white">
                          {(p.guestName ?? "G").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-200">{p.guestName}</p>
                          <p className="mt-1 text-xs text-slate-500">Guest</p>
                        </div>
                      </div>
                    ))}
                  </section>

                  {waitingIds.length > 0 ? (
                    <section className="mt-6 pb-4">
                      <h3 className="mb-2 text-sm font-semibold text-slate-200">
                        Not yet joined ({waitingIds.length})
                      </h3>
                      {visibleWaiting.map((id) => {
                        const u = attendeeMap.get(id);
                        return (
                          <div key={id} className="flex items-center gap-4 rounded-xl px-1 py-3">
                            <UserAvatar
                              user={u ?? { firstName: "Participant", email: "" }}
                              className="h-12 w-12"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-200">
                                {nameFor(id)}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">Invited</p>
                            </div>
                            <span className="text-xs text-slate-400">Waiting...</span>
                          </div>
                        );
                      })}
                    </section>
                  ) : null}
                </div>

                {/* Invite */}
                <div className="shrink-0 p-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex h-14 w-full items-center justify-center gap-3 rounded-lg border border-indigo-500 bg-indigo-500/[0.05] text-sm font-medium text-white transition hover:bg-indigo-500/10">
                        <UserPlus size={19} />
                        Invite People
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" side="top" className="w-[340px]">
                      <div className="px-2 py-1.5 text-xs font-medium text-slate-400">
                        Add organisation member
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {invitable.length === 0 ? (
                          <p className="px-2 py-3 text-xs text-slate-500">
                            Everyone in the organisation is already invited.
                          </p>
                        ) : (
                          invitable.map((m) => {
                            const u = memberMap.get(m.userId);
                            const name = u ? getUserDisplayName(u) : "Member";
                            return (
                              <DropdownMenuItem
                                key={m.userId}
                                onClick={() => inviteMember(m.userId)}
                              >
                                <UserAvatar
                                  user={u ?? { firstName: name, email: "" }}
                                  className="mr-2 h-6 w-6"
                                />
                                <span className="min-w-0 flex-1 truncate">{name}</span>
                                <Phone className="ml-2 h-3.5 w-3.5 shrink-0 text-indigo-300" />
                              </DropdownMenuItem>
                            );
                          })
                        )}
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onCopyInviteLink}>
                        {copiedLink ? (
                          <Check className="mr-2 h-4 w-4" />
                        ) : (
                          <Link2 className="mr-2 h-4 w-4" />
                        )}
                        {copiedLink ? "Link copied" : "Copy invite link"}
                      </DropdownMenuItem>
                      {meeting?.joinCode ? (
                        <DropdownMenuItem
                          onClick={() => void navigator.clipboard.writeText(meeting.joinCode!)}
                        >
                          <Copy className="mr-2 h-4 w-4" /> Copy meeting code
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </>
            ) : (
              /* Chat tab */
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <div className="rounded-lg bg-[#102136] p-3">
                      <p className="text-xs text-slate-300">
                        Meeting chat is available to everyone in the call.
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium text-slate-300">
                          {nameFor(m.userId, "Participant")}
                        </span>
                        <span className="rounded-lg bg-[#102136] px-3 py-2 text-sm text-slate-200">
                          {m.content}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={chatBottomRef} />
                </div>
                <div className="p-4">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendChatMessage();
                    }}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#0d1d2e] px-3 py-2"
                  >
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Send a message..."
                      className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="text-slate-500 transition hover:text-white disabled:opacity-40"
                      aria-label="Send message"
                    >
                      <Send size={17} />
                    </button>
                  </form>
                </div>
              </div>
            )}
          </aside>
        </div>
      </main>

      {/* Bottom controls */}
      <footer className="relative flex h-[145px] shrink-0 items-center justify-center">
        <div className="flex items-start gap-8">
          <WaitingControl
            icon={micOn ? <Mic size={23} /> : <MicOff size={23} />}
            label={micOn ? "Mute" : "Unmute"}
            active={micOn}
            onClick={onToggleAudio}
          />
          {!isAudio ? (
            <WaitingControl
              icon={videoOn ? <Video size={23} /> : <VideoOff size={23} />}
              label={videoOn ? "Stop Video" : "Start Video"}
              active={videoOn}
              onClick={onToggleVideo}
            />
          ) : null}
          <WaitingControl
            icon={screenSharing ? <Monitor size={22} /> : <MonitorOff size={22} />}
            label="Share"
            active={screenSharing}
            onClick={onToggleScreenShare}
          />
          <WaitingControl
            icon={<Users size={22} />}
            label="Participants"
            badge={joinedCount}
            active={tab === "participants"}
            onClick={() => setTab("participants")}
          />
          <WaitingControl
            icon={<MessageSquare size={22} />}
            label="Chat"
            active={tab === "chat"}
            onClick={() => setTab("chat")}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group flex min-w-[72px] flex-col items-center gap-2">
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.04] bg-[#132237] text-white transition hover:bg-[#1b2f48]">
                  <MoreHorizontal size={23} />
                </span>
                <span className="text-[12px] font-medium text-slate-300">More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top">
              <DropdownMenuItem onClick={onCopyInviteLink}>
                <Link2 className="mr-2 h-4 w-4" /> Copy invite link
              </DropdownMenuItem>
              {meeting?.joinCode ? (
                <DropdownMenuItem
                  onClick={() => void navigator.clipboard.writeText(meeting.joinCode!)}
                >
                  <Copy className="mr-2 h-4 w-4" /> Copy meeting code
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </footer>
    </div>
  );
}

/* =========================================================
   Active call — joined conference with remote participants
========================================================= */

interface CallRow {
  key: string;
  userId?: string;
  name: string;
  user?: Pick<UserDto, "firstName" | "lastName" | "email" | "avatarFileId"> | null;
  subtitle: string;
  isYou?: boolean;
  isGuest?: boolean;
  audioOn?: boolean;
  videoOn?: boolean;
}

function formatElapsed(seconds: number) {
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
    : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function useCallRoster({
  meeting,
  participants,
  user,
}: {
  meeting?: Meeting;
  participants: { id: string; displayName: string; userId?: string }[];
  user?: UserDto | null;
}) {
  const attendeeIds = useMemo(
    () =>
      [
        ...new Set(
          [
            meeting?.createdBy,
            ...(meeting?.invitees ?? []).map((i) => i.userId),
            ...(meeting?.participants ?? []).map((p) => p.userId),
          ].filter((id): id is string => Boolean(id) && !id!.startsWith("guest:")),
        ),
      ],
    [meeting],
  );
  const { data: attendeeUsers } = useUsers(attendeeIds);
  const attendeeMap = useMemo(
    () => new Map((attendeeUsers ?? []).map((u) => [u.id, u])),
    [attendeeUsers],
  );

  const joinedUserIds = useMemo(
    () =>
      new Set(
        [user?.id, ...participants.map((p) => p.userId)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    [user?.id, participants],
  );

  const remoteJoined = participants.filter((p) => p.userId !== user?.id);
  const waitingIds = attendeeIds.filter((id) => !joinedUserIds.has(id));
  const guestJoined = (meeting?.participants ?? []).filter(
    (p) => p.userId.startsWith("guest:") && p.guestName,
  );

  const joinedCount = joinedUserIds.size + guestJoined.length;
  const totalCount = Math.max(joinedCount, attendeeIds.length + guestJoined.length);

  const nameFor = (id: string, fallback?: string) => {
    const u = attendeeMap.get(id);
    return u ? getUserDisplayName(u) : (fallback ?? "Participant");
  };

  return { attendeeMap, remoteJoined, waitingIds, guestJoined, joinedCount, totalCount, nameFor };
}

function CallRoomHeader({
  title,
  kindLabel,
  joinedCount,
  totalCount,
  durationMinutes,
  signalLevel,
  signalColor,
  connected,
  elapsedLabel,
  endLabel,
  onEnd,
}: {
  title: string;
  kindLabel: string;
  joinedCount: number;
  totalCount: number;
  durationMinutes?: number | null;
  signalLevel: number;
  signalColor: string;
  connected: boolean;
  elapsedLabel: string;
  endLabel: string;
  onEnd: () => void;
}) {
  return (
    <header className="relative flex h-[90px] shrink-0 items-center justify-between border-b border-white/[0.05] px-6">
      <div className="w-48" />
      <div className="absolute left-1/2 top-5 -translate-x-1/2 text-center">
        <h1 className="text-[21px] font-semibold text-white">{title}</h1>
        <div className="mt-2 flex items-center justify-center gap-3 text-sm text-slate-400">
          <span>{kindLabel}</span>
          <span>•</span>
          <span>{elapsedLabel}</span>
          <span>•</span>
          <span>
            {joinedCount} of {totalCount} joined
          </span>
          {durationMinutes ? (
            <>
              <span>•</span>
              <span>{durationMinutes} min</span>
            </>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="mr-2 flex items-end gap-1" title={connected ? "Connected" : "Connecting"}>
          {[8, 12, 17, 22].map((height, index) => (
            <span
              key={index}
              className={cn("w-1 rounded-full", index < signalLevel ? signalColor : "bg-white/15")}
              style={{ height }}
            />
          ))}
        </div>
        <span className="mr-2 text-sm font-medium tabular-nums text-white">{elapsedLabel}</span>
        <button
          onClick={onEnd}
          className="flex h-11 items-center gap-3 rounded-lg bg-red-500 px-5 text-sm font-semibold text-white shadow-lg shadow-red-950/30 transition hover:bg-red-400"
        >
          <PhoneOff size={16} />
          {endLabel}
        </button>
      </div>
    </header>
  );
}

function CallSidePanel({
  joinedRows,
  waitingRows,
  isAudio,
  meetingId,
  kind,
  callerName,
  copiedLink,
  onCopyInviteLink,
  joinCode,
  onToggleAudio,
  onToggleVideo,
  tab: controlledTab,
  setTab: controlledSetTab,
}: {
  joinedRows: CallRow[];
  waitingRows: CallRow[];
  isAudio: boolean;
  meetingId: string;
  kind: "audio" | "video";
  callerName: string;
  copiedLink: boolean;
  onCopyInviteLink: () => void;
  joinCode?: string | null;
  onToggleAudio?: () => void;
  onToggleVideo?: () => void;
  tab?: "participants" | "chat";
  setTab?: (tab: "participants" | "chat") => void;
}) {
  const realtime = useRealtime();
  const realtimeRef = useRef(realtime);
  realtimeRef.current = realtime;
  const [internalTab, setInternalTab] = useState<"participants" | "chat">("participants");
  const tab = controlledTab ?? internalTab;
  const setTab = controlledSetTab ?? setInternalTab;
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const organisationId = useUIStore((s) => s.organisationId);
  const { data: members } = useMembers(organisationId ?? undefined);
  const memberUserIds = useMemo(() => (members ?? []).map((m) => m.userId), [members]);
  const { data: memberUsers } = useUsers(memberUserIds);
  const memberMap = useMemo(() => new Map((memberUsers ?? []).map((u) => [u.id, u])), [memberUsers]);
  const [ringed, setRinged] = useState<Set<string>>(new Set());

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  useEffect(() => {
    let cancelled = false;
    realtimeRef.current.joinRealtimeMeeting(meetingId);
    getMeetingMessages(meetingId)
      .then((res) => {
        if (!cancelled) setMessages(res.items);
      })
      .catch(() => {});
    const unsub = realtimeRef.current.onRealtimeEvent("meeting.chat.created", (msg) => {
      if (msg.meetingId !== meetingId) return;
      setMessages((prev) =>
        prev.some((m) => m.id === msg.id) ? prev : [...prev, { ...msg, updatedAt: msg.createdAt }],
      );
    });
    return () => {
      cancelled = true;
      unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  function sendChatMessage() {
    const content = chatInput.trim();
    if (!content) return;
    setChatInput("");
    createMeetingMessage(meetingId, content)
      .then((msg) =>
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg])),
      )
      .catch(() => {});
  }

  const q = query.trim().toLowerCase();
  const existingIds = useMemo(
    () => new Set([...joinedRows.map((r) => r.userId), ...waitingRows.map((r) => r.userId), ...ringed]),
    [joinedRows, waitingRows, ringed],
  );
  const visibleJoined = joinedRows.filter((r) => !q || r.name.toLowerCase().includes(q));
  const visibleWaiting = waitingRows.filter((r) => !q || r.name.toLowerCase().includes(q));
  const ringable = (members ?? []).filter((m) => q && !existingIds.has(m.userId));
  const invitable = (members ?? []).filter((m) => !existingIds.has(m.userId));

  function ringMember(userId: string) {
    realtime.sendCallRing({ meetingId, kind, callerName, userIds: [userId] });
    setRinged((prev) => new Set([...prev, userId]));
    setQuery("");
  }

  function inviteMember(userId: string) {
    const u = memberMap.get(userId);
    ringMember(userId);
    toast.success(`Invited ${u ? getUserDisplayName(u) : "member"} to join the call`);
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#081727]/95">
      <div className="flex h-[55px] shrink-0 items-center border-b border-white/[0.06]">
        <button
          onClick={() => setTab("participants")}
          className={cn(
            "relative h-full px-5 text-sm font-medium",
            tab === "participants" ? "text-white" : "text-slate-500",
          )}
        >
          Participants ({joinedRows.length})
          {tab === "participants" && (
            <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-indigo-500" />
          )}
        </button>
        <button
          onClick={() => setTab("chat")}
          className={cn(
            "relative h-full px-5 text-sm font-medium",
            tab === "chat" ? "text-white" : "text-slate-500",
          )}
        >
          Chat
          {tab === "chat" && (
            <span className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-indigo-500" />
          )}
        </button>
      </div>

      {tab === "participants" ? (
        <>
          <div className="shrink-0 px-4 py-4">
            <div className="flex h-11 items-center gap-3 rounded-lg bg-[#102136] px-3">
              <Search size={18} className="text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search participants or ring a member..."
                className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-500"
              />
            </div>
            {ringable.length > 0 && q ? (
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-[#102136] p-1">
                {ringable.slice(0, 8).map((m) => {
                  const u = memberMap.get(m.userId);
                  const name = u ? getUserDisplayName(u) : "Member";
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => ringMember(m.userId)}
                      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-slate-200 transition hover:bg-white/5"
                    >
                      <UserAvatar user={u ?? { firstName: name, email: "" }} className="h-6 w-6" />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      <Phone className="h-3.5 w-3.5 text-indigo-300" />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            <section>
              {visibleJoined.map((row) => (
                <div key={row.key} className="flex items-center gap-3 py-3">
                  <div className="relative shrink-0">
                    {row.isGuest ? (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#334675] text-sm font-medium text-white">
                        {row.name.charAt(0).toUpperCase()}
                      </div>
                    ) : (
                      <UserAvatar
                        user={row.user ?? { firstName: row.name, email: "" }}
                        className="h-12 w-12"
                      />
                    )}
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0c1928] bg-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {row.name}
                      {row.isYou ? (
                        <span className="ml-1 font-normal text-slate-400">(You)</span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{row.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.isYou && onToggleAudio ? (
                      <button
                        onClick={onToggleAudio}
                        className={cn("transition", row.audioOn ? "text-slate-300" : "text-red-400")}
                      >
                        {row.audioOn ? <Mic size={17} /> : <MicOff size={17} />}
                      </button>
                    ) : (
                      <span className={cn(row.audioOn ? "text-slate-300" : "text-red-400")}>
                        {row.audioOn ? <Mic size={17} /> : <MicOff size={17} />}
                      </span>
                    )}
                    {!isAudio ? (
                      row.isYou && onToggleVideo ? (
                        <button
                          onClick={onToggleVideo}
                          className={cn("transition", row.videoOn ? "text-slate-300" : "text-red-400")}
                        >
                          {row.videoOn ? <Video size={17} /> : <VideoOff size={17} />}
                        </button>
                      ) : (
                        <span className={cn(row.videoOn ? "text-slate-300" : "text-red-400")}>
                          {row.videoOn ? <Video size={17} /> : <VideoOff size={17} />}
                        </span>
                      )
                    ) : null}
                  </div>
                </div>
              ))}
            </section>

            {waitingRows.length > 0 ? (
              <section className="mt-4 pb-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-200">
                  Not yet joined ({visibleWaiting.length})
                </h3>
                {visibleWaiting.map((row) => (
                  <div key={row.key} className="flex items-center gap-4 rounded-xl px-1 py-3">
                    <UserAvatar
                      user={row.user ?? { firstName: row.name, email: "" }}
                      className="h-12 w-12"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-200">{row.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.subtitle}</p>
                    </div>
                    <span className="text-xs text-slate-400">Waiting...</span>
                  </div>
                ))}
              </section>
            ) : null}
          </div>

          <div className="shrink-0 p-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-14 w-full items-center justify-center gap-3 rounded-lg border border-indigo-500 bg-indigo-500/[0.04] text-sm font-medium text-white transition hover:bg-indigo-500/10">
                  <UserPlus size={18} />
                  Invite People
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-[340px]">
                <div className="px-2 py-1.5 text-xs font-medium text-slate-400">
                  Add organisation member
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {invitable.length === 0 ? (
                    <p className="px-2 py-3 text-xs text-slate-500">
                      Everyone in the organisation is already invited.
                    </p>
                  ) : (
                    invitable.map((m) => {
                      const u = memberMap.get(m.userId);
                      const name = u ? getUserDisplayName(u) : "Member";
                      return (
                        <DropdownMenuItem
                          key={m.userId}
                          onClick={() => inviteMember(m.userId)}
                        >
                          <UserAvatar
                            user={u ?? { firstName: name, email: "" }}
                            className="mr-2 h-6 w-6"
                          />
                          <span className="min-w-0 flex-1 truncate">{name}</span>
                          <Phone className="ml-2 h-3.5 w-3.5 shrink-0 text-indigo-300" />
                        </DropdownMenuItem>
                      );
                    })
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onCopyInviteLink}>
                  {copiedLink ? (
                    <Check className="mr-2 h-4 w-4" />
                  ) : (
                    <Link2 className="mr-2 h-4 w-4" />
                  )}
                  {copiedLink ? "Link copied" : "Copy invite link"}
                </DropdownMenuItem>
                {joinCode ? (
                  <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(joinCode)}>
                    <Copy className="mr-2 h-4 w-4" /> Copy meeting code
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="rounded-lg bg-[#102136] p-3">
                <p className="text-xs leading-5 text-slate-300">
                  Everyone in the meeting can see messages sent here.
                </p>
              </div>
            ) : (
              messages.map((m) => {
                const sender = joinedRows.find((r) => r.userId === m.userId);
                return (
                  <div key={m.id} className="flex flex-col gap-0.5">
                    <span className="text-xs font-medium text-slate-300">
                      {sender?.name ?? "Participant"}
                    </span>
                    <span className="rounded-lg bg-[#102136] px-3 py-2 text-xs text-slate-300">
                      {m.content}
                    </span>
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>
          <div className="p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendChatMessage();
              }}
              className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-[#0e1e30] px-3 py-2"
            >
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Send a message..."
                className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-slate-600"
              />
              <button
                type="submit"
                disabled={!chatInput.trim()}
                className="text-slate-500 transition hover:text-white disabled:opacity-40"
                aria-label="Send message"
              >
                <Send size={17} />
              </button>
            </form>
          </div>
        </div>
      )}
    </aside>
  );
}

interface CallRoomTileData {
  tileKey: string;
  participantId?: string;
  userId?: string;
  name: string;
  subtitle?: string;
  user?: Pick<UserDto, "firstName" | "lastName" | "email" | "avatarFileId"> | null;
  stream?: MediaStream | null;
  isLocal?: boolean;
  isScreenTile?: boolean;
  videoEnabled: boolean;
  audioOn: boolean;
  isSpeaking?: boolean;
  isHost?: boolean;
}

function CallTile({
  name,
  subtitle,
  user,
  stream,
  isLocal,
  videoEnabled,
  audioOn,
  isSpeaking,
  isHost,
  isScreenTile,
  onToggleMic,
  onToggleCamera,
  featured,
}: CallRoomTileData & {
  onToggleMic?: () => void;
  onToggleCamera?: () => void;
  featured?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const hasLiveVideo =
    !isScreenTile &&
    videoEnabled &&
    (stream?.getVideoTracks().some((t) => t.enabled && t.readyState !== "ended") ?? false);
  const showVideo = (isScreenTile && stream != null) || hasLiveVideo;

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, showVideo]);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream, showVideo]);

  return (
    <div
      className={cn(
        "group relative min-h-0 overflow-hidden rounded-xl border bg-[#0d1c2c] transition",
        isSpeaking
          ? "border-indigo-500 shadow-[0_0_0_1px_rgba(99,102,241,0.25)]"
          : "border-white/[0.07]",
      )}
    >
      {showVideo && stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#101e30] to-[#0b1828]">
          <UserAvatar
            user={user ?? { firstName: name, email: "" }}
            className={featured ? "h-32 w-32" : "h-28 w-28"}
            fallbackClassName="bg-[#334675] text-3xl text-white"
          />
        </div>
      )}
      {showVideo ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
      ) : null}
      {!isLocal && stream && !showVideo ? (
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      ) : null}

      {isSpeaking ? (
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-indigo-600/80 px-2.5 py-1.5 text-[10px] font-medium text-white backdrop-blur-xl">
          <span className="h-1.5 w-5 animate-pulse rounded-full bg-white" />
          Speaking
        </div>
      ) : null}

      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-3">
        <div className="rounded-lg bg-black/55 px-2.5 py-2 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-white">
              {name}
              {isLocal ? " (You)" : ""}
            </span>
            {isHost ? (
              <span className="rounded bg-indigo-500/80 px-1.5 py-0.5 text-[8px] font-semibold text-white">
                Host
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-0.5 text-[10px] text-slate-300">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-1.5">
          {isLocal && onToggleMic ? (
            <button
              onClick={onToggleMic}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-xl transition",
                audioOn ? "bg-black/50 text-white" : "bg-red-500/80 text-red-100",
              )}
              aria-label={audioOn ? "Mute" : "Unmute"}
            >
              {audioOn ? <Mic size={16} /> : <MicOff size={16} />}
            </button>
          ) : (
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-xl",
                audioOn ? "bg-black/50 text-white" : "bg-red-500/80 text-red-100",
              )}
            >
              {audioOn ? <Mic size={16} /> : <MicOff size={16} />}
            </span>
          )}
          {!isScreenTile ? (
            isLocal && onToggleCamera ? (
              <button
                onClick={onToggleCamera}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-xl transition",
                  videoEnabled ? "bg-black/50 text-white" : "bg-red-500/80 text-red-100",
                )}
                aria-label={videoEnabled ? "Stop video" : "Start video"}
              >
                {videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
              </button>
            ) : (
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-xl",
                  videoEnabled ? "bg-black/50 text-white" : "bg-red-500/80 text-red-100",
                )}
              >
                {videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
              </span>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActiveCallRoom({
  user,
  displayName,
  title,
  kind,
  meeting,
  meetingId,
  connected,
  localStream,
  micOn,
  videoOn,
  screenSharing,
  isHost,
  qualityStats,
  participants,
  remoteStreams,
  copiedLink,
  onCopyInviteLink,
  onLeave,
  onEnd,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  activeSpeakerId,
}: {
  user?: UserDto | null;
  displayName: string;
  title: string;
  kind: "audio" | "video";
  meeting?: Meeting;
  meetingId: string;
  connected: boolean;
  localStream?: MediaStream | null;
  micOn: boolean;
  videoOn: boolean;
  screenSharing: boolean;
  isHost: boolean;
  qualityStats: { audio: { packetsLost: number }; video: { packetsLost: number } } | null;
  participants: { id: string; displayName: string; userId?: string }[];
  remoteStreams: { participantId: string; stream: MediaStream }[];
  copiedLink: boolean;
  onCopyInviteLink: () => void;
  onLeave: () => void;
  onEnd?: () => void;
  onToggleAudio?: () => void;
  onToggleVideo?: () => void;
  onToggleScreenShare?: () => void;
  activeSpeakerId: string | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [layout, setLayout] = useState<"grid" | "speaker">("grid");
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const isAudio = kind === "audio";

  useEffect(() => {
    const interval = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const { attendeeMap, remoteJoined, waitingIds, guestJoined, joinedCount, totalCount, nameFor } =
    useCallRoster({ meeting, participants, user });

  const streamFor = (pid: string) =>
    remoteStreams.find((s) => s.participantId === pid)?.stream ?? null;
  const mediaOn = (stream: MediaStream | null, kindOf: "audio" | "video") => {
    const tracks = kindOf === "audio" ? stream?.getAudioTracks() : stream?.getVideoTracks();
    return tracks?.some((t) => t.enabled && t.readyState !== "ended") ?? false;
  };

  const kindLabel = isAudio ? "Voice Call" : totalCount > 2 ? "Group Call" : "1:1 Call";
  const elapsedLabel = formatElapsed(elapsed);
  const loss =
    (qualityStats?.audio.packetsLost ?? 0) + (qualityStats?.video.packetsLost ?? 0);
  const signalLevel = !qualityStats ? 4 : loss > 50 ? 1 : loss > 10 ? 3 : 4;
  const signalColor =
    signalLevel <= 1 ? "bg-red-400" : signalLevel === 3 ? "bg-amber-400" : "bg-emerald-400";
  const endLabel = onEnd ? "End Call" : "Leave";
  const endHandler = onEnd ?? onLeave;

  const baseId = (id: string) => id.replace(/^screen-/, "");

  const screenTiles: CallRoomTileData[] = remoteStreams
    .filter((s) => s.participantId.startsWith("screen-"))
    .map((s) => {
      const base = baseId(s.participantId);
      const p = participants.find((pp) => pp.id === base);
      return {
        tileKey: s.participantId,
        participantId: s.participantId,
        userId: p?.userId,
        name: p?.displayName ?? "Screen",
        subtitle: "Screen share",
        user: p?.userId ? attendeeMap.get(p.userId) : undefined,
        stream: s.stream,
        isScreenTile: true,
        videoEnabled: true,
        audioOn: false,
        isHost: p?.userId === meeting?.createdBy,
      };
    });

  const cameraTiles: CallRoomTileData[] = [
    {
      tileKey: "self",
      userId: user?.id,
      name: displayName,
      subtitle: isHost ? "Host" : undefined,
      user,
      stream: localStream ?? null,
      isLocal: true,
      videoEnabled: videoOn,
      audioOn: micOn,
      isHost,
    },
    ...remoteStreams
      .filter((s) => !s.participantId.startsWith("screen-"))
      .map((s) => {
        const p = participants.find((pp) => pp.id === s.participantId);
        return {
          tileKey: s.participantId,
          participantId: s.participantId,
          userId: p?.userId,
          name: p?.displayName ?? "Participant",
          subtitle: p?.userId === meeting?.createdBy ? "Host" : undefined,
          user: p?.userId ? attendeeMap.get(p.userId) : undefined,
          stream: s.stream,
          videoEnabled: mediaOn(s.stream, "video"),
          audioOn: mediaOn(s.stream, "audio"),
          isSpeaking: activeSpeakerId === s.participantId,
          isHost: p?.userId === meeting?.createdBy,
        };
      }),
  ];

  cameraTiles.sort((a, b) => {
    if (a.isLocal) return -1;
    if (b.isLocal) return 1;
    return (b.isSpeaking ? 1 : 0) - (a.isSpeaking ? 1 : 0);
  });

  const allTiles = [...screenTiles, ...cameraTiles];
  const featuredTile =
    screenTiles[0] ??
    allTiles.find((t) => t.tileKey === pinnedId) ??
    allTiles.find((t) => t.isSpeaking) ??
    allTiles[1] ??
    allTiles[0];
  const stripTiles = allTiles.filter((t) => t.tileKey !== featuredTile?.tileKey);

  const tileCount = allTiles.length;
  const cols = tileCount <= 1 ? 1 : tileCount === 2 ? 2 : tileCount <= 4 ? 2 : tileCount <= 9 ? 3 : 4;
  const rows = Math.max(1, Math.ceil(tileCount / cols));

  const joinedRows: CallRow[] = [
    {
      key: "self",
      userId: user?.id,
      name: displayName,
      user,
      subtitle: isHost ? "Host" : "Participant",
      isYou: true,
      audioOn: micOn,
      videoOn: videoOn,
    },
    ...remoteJoined.map((p) => {
      const stream = streamFor(p.id);
      return {
        key: p.id,
        userId: p.userId,
        name: p.displayName,
        user: p.userId ? attendeeMap.get(p.userId) : undefined,
        subtitle: p.userId === meeting?.createdBy ? "Host" : "Participant",
        audioOn: mediaOn(stream, "audio"),
        videoOn: mediaOn(stream, "video"),
      };
    }),
    ...guestJoined.map((p) => ({
      key: p.id,
      name: p.guestName ?? "Guest",
      subtitle: "Guest",
      isGuest: true,
    })),
  ];
  const waitingRows: CallRow[] = waitingIds.map((id) => ({
    key: id,
    userId: id,
    name: nameFor(id),
    user: attendeeMap.get(id),
    subtitle: "Invited",
  }));

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#040b15] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-60 bottom-[-200px] h-[600px] w-[700px] rounded-full bg-indigo-700/10 blur-[130px]" />
        <div className="absolute right-[-180px] bottom-[-180px] h-[550px] w-[650px] rounded-full bg-indigo-700/10 blur-[130px]" />
        <div className="absolute right-[25%] top-[-250px] h-[450px] w-[450px] rounded-full bg-blue-700/10 blur-[130px]" />
      </div>

      <CallRoomHeader
        title={title}
        kindLabel={kindLabel}
        joinedCount={joinedCount}
        totalCount={totalCount}
        durationMinutes={meeting?.durationMinutes}
        signalLevel={signalLevel}
        signalColor={signalColor}
        connected={connected}
        elapsedLabel={elapsedLabel}
        endLabel={endLabel}
        onEnd={endHandler}
      />

      <main className="relative min-h-0 flex-1 px-3 pb-2">
        <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_413px]">
          <section className="min-h-0 overflow-hidden rounded-xl border border-white/[0.05] bg-[#061321]/80 p-5">
            {layout === "speaker" && featuredTile ? (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="min-h-0 flex-1">
                  <CallTile
                    {...featuredTile}
                    featured
                    onToggleMic={featuredTile.isLocal ? onToggleAudio : undefined}
                    onToggleCamera={featuredTile.isLocal ? onToggleVideo : undefined}
                  />
                </div>
                <div className="grid h-32 shrink-0 auto-cols-[180px] grid-flow-col gap-3 overflow-x-auto">
                  {stripTiles.map((t) => (
                    <CallTile
                      key={t.tileKey}
                      {...t}
                      onToggleMic={t.isLocal ? onToggleAudio : undefined}
                      onToggleCamera={t.isLocal ? onToggleVideo : undefined}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="grid h-full min-h-0 gap-3"
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
                }}
              >
                {allTiles.map((t) => (
                  <CallTile
                    key={t.tileKey}
                    {...t}
                    onToggleMic={t.isLocal ? onToggleAudio : undefined}
                    onToggleCamera={t.isLocal ? onToggleVideo : undefined}
                  />
                ))}
              </div>
            )}
          </section>

          <CallSidePanel
            joinedRows={joinedRows}
            waitingRows={waitingRows}
            isAudio={isAudio}
            meetingId={meetingId}
            kind={kind}
            callerName={displayName}
            copiedLink={copiedLink}
            onCopyInviteLink={onCopyInviteLink}
            joinCode={meeting?.joinCode}
            onToggleAudio={onToggleAudio}
            onToggleVideo={onToggleVideo}
          />
        </div>
      </main>

      <footer className="relative flex h-[150px] shrink-0 items-center justify-center">
        <button
          onClick={() => setLayout((l) => (l === "grid" ? "speaker" : "grid"))}
          className="absolute bottom-6 left-7 flex items-center gap-2 rounded-lg bg-[#102035] px-4 py-3 text-xs font-medium text-slate-300 transition hover:bg-[#162b44]"
        >
          <Users size={17} />
          {layout === "grid" ? "Speaker view" : "Grid view"}
        </button>
        <div className="flex items-start gap-8">
          <WaitingControl
            icon={micOn ? <Mic size={22} /> : <MicOff size={22} />}
            label={micOn ? "Mute" : "Unmute"}
            active={micOn}
            onClick={onToggleAudio}
          />
          {!isAudio ? (
            <WaitingControl
              icon={videoOn ? <Video size={22} /> : <VideoOff size={22} />}
              label={videoOn ? "Stop Video" : "Start Video"}
              active={videoOn}
              onClick={onToggleVideo}
            />
          ) : null}
          <WaitingControl
            icon={screenSharing ? <Monitor size={22} /> : <MonitorOff size={22} />}
            label="Share"
            active={screenSharing}
            onClick={onToggleScreenShare}
          />
        </div>
      </footer>
    </div>
  );
}
