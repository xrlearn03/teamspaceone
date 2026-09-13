import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  CircleDot,
  Copy,
  Ellipsis,
  Hand,
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
  Smile,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { cn, getUserDisplayName } from "../lib/utils";
import { useRealtime } from "../hooks/useRealtime";
import { useUIStore } from "../stores/ui";
import { useMembers, useUsers } from "../hooks/api";
import { UserAvatar } from "./user-avatar";
import {
  createMeetingMessage,
  createMeetingReaction,
  getMeetingMessages,
  getMeetingRaiseHands,
  getMeetingShareLink,
  setMeetingRecording,
  updateMeetingRaiseHand,
  type Meeting,
  type MeetingMessage,
  type UserDto,
} from "../lib/api";

interface QualityStats {
  audio: { packetsLost: number; jitter: number; bitrate: number };
  video: { packetsLost: number; jitter: number; bitrate: number };
  rtt?: number;
  timestamp: number;
}

interface NativeConferenceProps {
  user?: UserDto | null;
  title?: string;
  connected?: boolean;
  meetingId: string;
  meeting?: Meeting;
  kind?: "audio" | "video";
  localStream?: MediaStream | null;
  nativeFrame?: string | null;
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

export function NativeConference({
  user,
  title = "Meeting",
  connected = true,
  meetingId,
  meeting,
  kind = "video",
  localStream,
  nativeFrame,
  localVideoEnabled = false,
  localAudioEnabled = false,
  remoteStreams = [],
  participants = [],
  activeSpeakerId = null,
  qualityStats = null,
  screenShareEnabled = false,
  isRecording: initialRecording = false,
  isHost = false,
  onLeave,
  onEnd,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  audioOutputId,
}: NativeConferenceProps) {
  const realtime = useRealtime();
  const realtimeRef = useRef(realtime);
  realtimeRef.current = realtime;
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [reactions, setReactions] = useState<{ id: string; emoji: string; name: string }[]>([]);
  const [isRecording, setIsRecording] = useState(initialRecording);
  const [copiedLink, setCopiedLink] = useState(false);
  const [screenSharingUsers, setScreenSharingUsers] = useState<Set<string>>(new Set());
  const processedReactionIds = useRef<Set<string>>(new Set());
  const joinedAtRef = useRef(Date.now());

  const displayName = getUserDisplayName(user, "Guest");

  const participantUserIds = useMemo(() => {
    const ids = new Set<string>();
    if (user?.id) ids.add(user.id);
    for (const p of participants) {
      if (p.userId) ids.add(p.userId);
    }
    return [...ids];
  }, [user?.id, participants]);
  const { data: participantUsers } = useUsers(participantUserIds);
  const participantUserMap = useMemo(
    () => new Map((participantUsers ?? []).map((u) => [u.id, u])),
    [participantUsers],
  );

  function resolveName(userId: string) {
    if (user?.id === userId) return displayName;
    const p = participants.find((p) => p.userId === userId);
    return p?.displayName || "User";
  }

  function showReaction(emoji: string, userId: string, id: string) {
    if (processedReactionIds.current.has(id)) return;
    processedReactionIds.current.add(id);
    const name = resolveName(userId);
    setReactions((prev) => [...prev, { id, emoji, name }]);
    window.setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
      processedReactionIds.current.delete(id);
    }, 2500);
  }

  function addMessageFromEvent(payload: Omit<MeetingMessage, "updatedAt">) {
    setMessages((prev) => {
      if (prev.some((m) => m.id === payload.id)) return prev;
      const full: MeetingMessage = { ...payload, updatedAt: payload.createdAt };
      return [...prev, full];
    });
  }

  useEffect(() => {
    let cancelled = false;
    getMeetingMessages(meetingId)
      .then((res) => {
        if (!cancelled) setMessages(res.items);
      })
      .catch((err) => console.error("Failed to load meeting messages", err));
    getMeetingRaiseHands(meetingId)
      .then((res) => {
        if (!cancelled) {
          setRaisedHands(new Set(res.filter((h) => h.raised).map((h) => h.userId)));
        }
      })
      .catch((err) => console.error("Failed to load raise hands", err));
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  useEffect(() => {
    const unsubChat = realtimeRef.current.onRealtimeEvent("meeting.chat.created", (msg) => {
      addMessageFromEvent(msg);
    });
    const unsubReaction = realtimeRef.current.onRealtimeEvent("meeting.reaction.created", (r) => {
      showReaction(r.emoji, r.userId, r.id);
    });
    const unsubRaise = realtimeRef.current.onRealtimeEvent("meeting.raise_hand.changed", (payload) => {
      setRaisedHands((prev) => {
        const next = new Set(prev);
        if (payload.raised) next.add(payload.userId);
        else next.delete(payload.userId);
        return next;
      });
    });
    const unsubRecording = realtimeRef.current.onRealtimeEvent("meeting.recording.changed", (payload) => {
      setIsRecording(payload.isRecording);
    });
    const unsubScreen = realtimeRef.current.onRealtimeEvent("meeting.screen.shared", (payload) => {
      setScreenSharingUsers((prev) => {
        const next = new Set(prev);
        if (payload.isScreenSharing) next.add(payload.userId);
        else next.delete(payload.userId);
        return next;
      });
    });
    return () => {
      unsubChat();
      unsubReaction();
      unsubRaise();
      unsubRecording();
      unsubScreen();
    };
    // `realtime` is a fresh context object per provider render; depending on it
    // would resubscribe every handler on each realtime state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, participants, user?.id]);

  async function sendMessage() {
    const content = chatInput.trim();
    if (!content) return;
    setChatInput("");
    try {
      const msg = await createMeetingMessage(meetingId, content);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    } catch (err) {
      console.error("Failed to send message", err);
    }
  }

  async function sendReaction(emoji: string) {
    try {
      const reaction = await createMeetingReaction(meetingId, emoji);
      showReaction(reaction.emoji, reaction.userId, reaction.id);
    } catch (err) {
      console.error("Failed to send reaction", err);
    }
  }

  async function toggleRaiseHand() {
    if (!user?.id) return;
    const next = !raisedHands.has(user.id);
    try {
      await updateMeetingRaiseHand(meetingId, next);
      setRaisedHands((prev) => {
        const s = new Set(prev);
        if (next) s.add(user.id);
        else s.delete(user.id);
        return s;
      });
    } catch (err) {
      console.error("Failed to update raise hand", err);
    }
  }

  async function toggleRecording() {
    if (!isHost) return;
    try {
      await setMeetingRecording(meetingId, !isRecording);
    } catch (err) {
      console.error("Failed to update recording state", err);
    }
  }

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

  const sharedRoomProps = {
    user,
    displayName,
    title,
    kind,
    meeting,
    meetingId,
    connected,
    localStream,
    localVideoEnabled,
    localAudioEnabled,
    screenShareEnabled,
    isRecording,
    isHost,
    qualityStats,
    participants,
    remoteStreams,
    participantUserMap,
    audioOutputId,
    messages,
    chatInput,
    setChatInput,
    onSendMessage: sendMessage,
    resolveName,
    copiedLink,
    onCopyInviteLink: copyInviteLink,
    raisedHand: user?.id ? raisedHands.has(user.id) : false,
    onToggleRaiseHand: toggleRaiseHand,
    onToggleRecording: toggleRecording,
    onSendReaction: sendReaction,
    onLeave,
    onEnd,
    onToggleAudio,
    onToggleVideo,
    onToggleScreenShare,
    startedAt: joinedAtRef.current,
  };

  if (aloneInCall) {
    return <CallWaitingRoom {...sharedRoomProps} />;
  }

  return (
    <ActiveCallRoom
      {...sharedRoomProps}
      raisedHands={raisedHands}
      screenSharingUsers={screenSharingUsers}
      activeSpeakerId={activeSpeakerId}
      reactions={reactions}
      nativeFrame={nativeFrame}
    />
  );
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

interface SharedCallRoomProps {
  user?: UserDto | null;
  displayName: string;
  title: string;
  kind: "audio" | "video";
  meeting?: Meeting;
  meetingId: string;
  connected: boolean;
  localStream?: MediaStream | null;
  localVideoEnabled: boolean;
  localAudioEnabled: boolean;
  screenShareEnabled: boolean;
  isRecording: boolean;
  isHost: boolean;
  qualityStats: QualityStats | null;
  participants: { id: string; displayName: string; userId?: string }[];
  remoteStreams: { participantId: string; stream: MediaStream }[];
  participantUserMap: Map<string, UserDto>;
  audioOutputId?: string;
  messages: MeetingMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  onSendMessage: () => void;
  resolveName: (userId: string) => string;
  copiedLink: boolean;
  onCopyInviteLink: () => void;
  raisedHand: boolean;
  onToggleRaiseHand: () => void;
  onToggleRecording: () => void;
  onSendReaction: (emoji: string) => void;
  onLeave: () => void;
  onEnd?: () => void;
  onToggleAudio?: () => void;
  onToggleVideo?: () => void;
  onToggleScreenShare?: () => void;
  startedAt: number;
}

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
  waiting?: boolean;
  raisedHand?: boolean;
  screenSharing?: boolean;
}

function formatElapsed(seconds: number) {
  return seconds >= 3600
    ? `${Math.floor(seconds / 3600)}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
    : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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
  localVideoEnabled,
  localAudioEnabled,
  screenShareEnabled,
  isRecording,
  isHost,
  qualityStats,
  participants,
  remoteStreams,
  participantUserMap,
  messages,
  chatInput,
  setChatInput,
  onSendMessage,
  copiedLink,
  onCopyInviteLink,
  raisedHand,
  onToggleRaiseHand,
  onToggleRecording,
  onLeave,
  onEnd,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  startedAt,
}: SharedCallRoomProps) {
  const [elapsed, setElapsed] = useState(0);
  const [tab, setTab] = useState<"participants" | "chat">("participants");
  const videoRef = useRef<HTMLVideoElement>(null);

  const isAudio = kind === "audio";

  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream, localVideoEnabled]);

  const {
    attendeeMap,
    remoteJoined,
    waitingIds,
    guestJoined,
    joinedCount,
    totalCount,
    nameFor,
  } = useCallRoster({ meeting, participants, user, participantUserMap });

  const joinedRows: CallRow[] = [
    {
      key: "self",
      userId: user?.id,
      name: displayName,
      user,
      subtitle: isHost ? "Host" : "Participant",
      isYou: true,
      audioOn: localAudioEnabled,
      videoOn: localVideoEnabled,
      raisedHand,
    },
    ...remoteJoined.map((p) => {
      const stream = remoteStreams.find((r) => r.participantId === p.id)?.stream ?? null;
      const tracks = (kindOf: "audio" | "video") =>
        kindOf === "audio" ? stream?.getAudioTracks() : stream?.getVideoTracks();
      return {
        key: p.id,
        userId: p.userId,
        name: p.displayName,
        user: p.userId ? attendeeMap.get(p.userId) : undefined,
        subtitle: p.userId === meeting?.createdBy ? "Host" : "Participant",
        audioOn:
          tracks("audio")?.some((t) => t.enabled && !t.muted && t.readyState !== "ended") ?? false,
        videoOn:
          tracks("video")?.some((t) => t.enabled && !t.muted && t.readyState !== "ended") ?? false,
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
    waiting: true,
  }));

  const kindLabel = isAudio ? "Voice Call" : totalCount > 2 ? "Group Call" : "1:1 Call";

  const elapsedLabel = formatElapsed(elapsed);

  const loss =
    (qualityStats?.audio.packetsLost ?? 0) + (qualityStats?.video.packetsLost ?? 0);
  const signalLevel = !qualityStats ? 4 : loss > 50 ? 1 : loss > 10 ? 3 : 4;
  const signalColor = signalLevel <= 1 ? "bg-red-400" : signalLevel === 3 ? "bg-amber-400" : "bg-emerald-400";

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
      <CallRoomHeader
        title={title}
        kindLabel={kindLabel}
        joinedCount={joinedCount}
        totalCount={totalCount}
        durationMinutes={meeting?.durationMinutes}
        isRecording={isRecording}
        signalLevel={signalLevel}
        signalColor={signalColor}
        connected={connected}
        elapsedLabel={elapsedLabel}
        joinCode={meeting?.joinCode}
        onCopyInviteLink={onCopyInviteLink}
        raisedHand={raisedHand}
        onToggleRaiseHand={onToggleRaiseHand}
        isHost={isHost}
        onToggleRecording={onToggleRecording}
        endLabel={endLabel}
        onEnd={endHandler}
      />

      {/* Content */}
      <main className="relative min-h-0 flex-1 px-3 pb-3">
        <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_430px]">
          {/* Self media */}
          <section className="min-h-0 rounded-xl border border-white/[0.06] bg-[#071321]/80 p-4">
            <div className="relative h-full w-full overflow-hidden rounded-xl">
              {!isAudio && localVideoEnabled && localStream?.getVideoTracks().some((t) => t.enabled) ? (
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
                  {isAudio && !localAudioEnabled ? (
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
          <CallSidePanel
            joinedRows={joinedRows}
            waitingRows={waitingRows}
            tab={tab}
            setTab={setTab}
            isAudio={isAudio}
            meetingId={meetingId}
            kind={kind}
            callerName={displayName}
            messages={messages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSendMessage={onSendMessage}
            nameFor={nameFor}
            copiedLink={copiedLink}
            onCopyInviteLink={onCopyInviteLink}
            joinCode={meeting?.joinCode}
            onToggleAudio={onToggleAudio}
            onToggleVideo={onToggleVideo}
          />
        </div>
      </main>

      {/* Bottom controls */}
      <footer className="relative flex h-[145px] shrink-0 items-center justify-center">
        <div className="flex items-start gap-8">
          <WaitingControl
            icon={localAudioEnabled ? <Mic size={23} /> : <MicOff size={23} />}
            label={localAudioEnabled ? "Mute" : "Unmute"}
            active={localAudioEnabled}
            onClick={onToggleAudio}
          />
          {!isAudio ? (
            <WaitingControl
              icon={localVideoEnabled ? <Video size={23} /> : <VideoOff size={23} />}
              label={localVideoEnabled ? "Stop Video" : "Start Video"}
              active={localVideoEnabled}
              onClick={onToggleVideo}
            />
          ) : null}
          <WaitingControl
            icon={screenShareEnabled ? <Monitor size={22} /> : <MonitorOff size={22} />}
            label="Share"
            active={screenShareEnabled}
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
              <DropdownMenuItem onClick={onToggleRaiseHand}>
                <Hand className="mr-2 h-4 w-4" /> {raisedHand ? "Lower hand" : "Raise hand"}
              </DropdownMenuItem>
              {isHost ? (
                <DropdownMenuItem onClick={onToggleRecording}>
                  <CircleDot className="mr-2 h-4 w-4" />
                  {isRecording ? "Stop recording" : "Start recording"}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={onCopyInviteLink}>
                <Link2 className="mr-2 h-4 w-4" /> Copy invite link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="mx-1 h-10 w-px bg-white/[0.08]" />
          <WaitingControl
            icon={<PhoneOff size={22} />}
            label={endLabel}
            danger
            onClick={endHandler}
          />
        </div>
      </footer>
    </div>
  );
}



/* =========================================================
   Shared call-room pieces
========================================================= */

function useCallRoster({
  meeting,
  participants,
  user,
  participantUserMap,
}: {
  meeting?: Meeting;
  participants: { id: string; displayName: string; userId?: string }[];
  user?: UserDto | null;
  participantUserMap: Map<string, UserDto>;
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
    () => new Map([...(attendeeUsers ?? []), ...participantUserMap.values()].map((u) => [u.id, u])),
    [attendeeUsers, participantUserMap],
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

  return {
    attendeeMap,
    remoteJoined,
    waitingIds,
    guestJoined,
    joinedCount,
    totalCount,
    nameFor,
  };
}

function CallRoomHeader({
  title,
  kindLabel,
  joinedCount,
  totalCount,
  durationMinutes,
  isRecording,
  signalLevel,
  signalColor,
  connected,
  elapsedLabel,
  joinCode,
  onCopyInviteLink,
  raisedHand,
  onToggleRaiseHand,
  isHost,
  onToggleRecording,
  endLabel,
  onEnd,
}: {
  title: string;
  kindLabel: string;
  joinedCount: number;
  totalCount: number;
  durationMinutes?: number | null;
  isRecording: boolean;
  signalLevel: number;
  signalColor: string;
  connected: boolean;
  elapsedLabel: string;
  joinCode?: string | null;
  onCopyInviteLink: () => void;
  raisedHand: boolean;
  onToggleRaiseHand: () => void;
  isHost: boolean;
  onToggleRecording: () => void;
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
          {isRecording ? (
            <>
              <span>•</span>
              <span className="flex items-center gap-1 text-red-400">
                <CircleDot className="h-2 w-2 animate-pulse" />
                Recording
              </span>
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.07] bg-[#0d1f32] text-white transition hover:bg-[#142b44]"
              aria-label="Meeting options"
            >
              <Ellipsis size={20} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onCopyInviteLink}>
              <Link2 className="mr-2 h-4 w-4" /> Copy invite link
            </DropdownMenuItem>
            {joinCode ? (
              <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(joinCode)}>
                <Copy className="mr-2 h-4 w-4" /> Copy meeting code
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={onToggleRaiseHand}>
              <Hand className="mr-2 h-4 w-4" /> {raisedHand ? "Lower hand" : "Raise hand"}
            </DropdownMenuItem>
            {isHost ? (
              <DropdownMenuItem onClick={onToggleRecording}>
                <CircleDot className="mr-2 h-4 w-4" />
                {isRecording ? "Stop recording" : "Start recording"}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
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
  messages,
  chatInput,
  setChatInput,
  onSendMessage,
  nameFor,
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
  messages: MeetingMessage[];
  chatInput: string;
  setChatInput: (v: string) => void;
  onSendMessage: () => void;
  nameFor: (userId: string, fallback?: string) => string;
  copiedLink: boolean;
  onCopyInviteLink: () => void;
  joinCode?: string | null;
  onToggleAudio?: () => void;
  onToggleVideo?: () => void;
  tab?: "participants" | "chat";
  setTab?: (tab: "participants" | "chat") => void;
}) {
  const [internalTab, setInternalTab] = useState<"participants" | "chat">("participants");
  const tab = controlledTab ?? internalTab;
  const setTab = controlledSetTab ?? setInternalTab;
  const [query, setQuery] = useState("");
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const realtime = useRealtime();
  const organisationId = useUIStore((s) => s.organisationId);
  const { data: members } = useMembers(organisationId ?? undefined);
  const memberUserIds = useMemo(() => (members ?? []).map((m) => m.userId), [members]);
  const { data: memberUsers } = useUsers(memberUserIds);
  const memberMap = useMemo(
    () => new Map((memberUsers ?? []).map((u) => [u.id, u])),
    [memberUsers],
  );
  const [ringed, setRinged] = useState<Set<string>>(new Set());

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tab]);

  const q = query.trim().toLowerCase();
  const existingIds = useMemo(
    () => new Set([...joinedRows.map((r) => r.userId), ...waitingRows.map((r) => r.userId), ...ringed]),
    [joinedRows, waitingRows, ringed],
  );
  const visibleJoined = joinedRows.filter((r) => !q || r.name.toLowerCase().includes(q));
  const visibleWaiting = waitingRows.filter((r) => !q || r.name.toLowerCase().includes(q));
  const ringable = (members ?? []).filter(
    (m) => q && !existingIds.has(m.userId),
  );

  function ringMember(userId: string) {
    realtime.sendCallRing({ meetingId, kind, callerName, userIds: [userId] });
    setRinged((prev) => new Set([...prev, userId]));
    setQuery("");
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-white/[0.07] bg-[#091827]/95">
      {/* Tabs */}
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
        <button
          onClick={onCopyInviteLink}
          className="ml-auto mr-4 flex h-10 items-center gap-2 rounded-lg bg-indigo-500 px-3 text-xs font-semibold text-white transition hover:bg-indigo-400"
        >
          {copiedLink ? <Check size={15} /> : <UserPlus size={15} />}
          Invite
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

          {/* Lists */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-200">
                In call ({visibleJoined.length})
              </h3>
              {visibleJoined.map((row) => (
                <div key={row.key} className="flex items-center gap-4 rounded-xl px-1 py-3">
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
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-[#101b2a] bg-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-200">
                      {row.name}
                      {row.isYou ? (
                        <span className="ml-1 font-normal text-slate-400">(You)</span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{row.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.raisedHand ? <Hand className="h-4 w-4 text-amber-400" /> : null}
                    {row.isYou && onToggleAudio ? (
                      <button
                        onClick={onToggleAudio}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full transition",
                          row.audioOn
                            ? "bg-[#112136] text-slate-300 hover:bg-[#19304a]"
                            : "bg-red-500/15 text-red-400",
                        )}
                      >
                        {row.audioOn ? <Mic size={16} /> : <MicOff size={16} />}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full",
                          row.audioOn
                            ? "bg-[#112136] text-slate-300"
                            : "bg-red-500/15 text-red-400",
                        )}
                      >
                        {row.audioOn ? <Mic size={16} /> : <MicOff size={16} />}
                      </span>
                    )}
                    {!isAudio ? (
                      row.isYou && onToggleVideo ? (
                        <button
                          onClick={onToggleVideo}
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full transition",
                            row.videoOn
                              ? "bg-[#112136] text-slate-300 hover:bg-[#19304a]"
                              : "bg-red-500/15 text-red-400",
                          )}
                        >
                          {row.videoOn ? <Video size={16} /> : <VideoOff size={16} />}
                        </button>
                      ) : (
                        <span
                          className={cn(
                            "flex h-9 w-9 items-center justify-center rounded-full",
                            row.videoOn
                              ? "bg-[#112136] text-slate-300"
                              : "bg-red-500/15 text-red-400",
                          )}
                        >
                          {row.videoOn ? <Video size={16} /> : <VideoOff size={16} />}
                        </span>
                      )
                    ) : null}
                  </div>
                </div>
              ))}
            </section>

            {waitingRows.length > 0 ? (
              <section className="mt-6 pb-4">
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

          {/* Invite */}
          <div className="shrink-0 p-4">
            <div className="flex h-14 w-full overflow-hidden rounded-lg border border-indigo-500 bg-indigo-500/[0.05]">
              <button
                onClick={onCopyInviteLink}
                className="flex flex-1 items-center justify-center gap-3 text-sm font-medium text-white transition hover:bg-indigo-500/10"
              >
                <UserPlus size={19} />
                {copiedLink ? "Link copied" : "Invite People"}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex w-12 items-center justify-center border-l border-indigo-500/40 text-slate-400 transition hover:bg-indigo-500/10 hover:text-white"
                    aria-label="Invite options"
                  >
                    <ChevronDown size={17} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top">
                  <DropdownMenuItem onClick={onCopyInviteLink}>
                    <Link2 className="mr-2 h-4 w-4" /> Copy invite link
                  </DropdownMenuItem>
                  {joinCode ? (
                    <DropdownMenuItem onClick={() => void navigator.clipboard.writeText(joinCode)}>
                      <Copy className="mr-2 h-4 w-4" /> Copy meeting code
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
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
                    {nameFor(m.userId)}
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
                onSendMessage();
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
  );
}

function CallTile({
  name,
  subtitle,
  user,
  stream,
  nativeFrame,
  isLocal,
  videoEnabled,
  audioOn,
  isSpeaking,
  isHost,
  audioOutputId,
  onToggleMic,
  onToggleCamera,
  onPin,
  pinned,
  isScreenTile,
  raisedHand,
  featured,
}: {
  name: string;
  subtitle?: string;
  user?: Pick<UserDto, "firstName" | "lastName" | "email" | "avatarFileId"> | null;
  stream?: MediaStream | null;
  nativeFrame?: string | null;
  isLocal?: boolean;
  videoEnabled: boolean;
  audioOn: boolean;
  isSpeaking?: boolean;
  isHost?: boolean;
  audioOutputId?: string;
  onToggleMic?: () => void;
  onToggleCamera?: () => void;
  onPin?: () => void;
  pinned?: boolean;
  isScreenTile?: boolean;
  raisedHand?: boolean;
  featured?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const hasLiveVideo =
    !isScreenTile &&
    videoEnabled &&
    (stream
      ? stream.getVideoTracks().some((t) => t.enabled && !t.muted && t.readyState !== "ended")
      : Boolean(nativeFrame));
  const showVideo =
    (isScreenTile && stream != null) || hasLiveVideo;

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

  // Route remote audio through the selected speaker.
  useEffect(() => {
    const el = videoRef.current ?? audioRef.current;
    if (!el || !audioOutputId || !("setSinkId" in el)) return;
    try {
      void (el as HTMLMediaElement & { setSinkId: (id: string) => Promise<void> })
        .setSinkId(audioOutputId)
        .catch(() => {});
    } catch {
      // setSinkId is best-effort.
    }
  }, [audioOutputId, stream]);

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
      ) : showVideo && nativeFrame ? (
        <img src={nativeFrame} alt={name} className="absolute inset-0 h-full w-full object-cover" />
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
      {/* Remote audio when no video element carries it */}
      {!isLocal && stream && !showVideo ? (
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      ) : null}

      {/* Speaking indicator */}
      {isSpeaking ? (
        <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-indigo-600/80 px-2.5 py-1.5 text-[10px] font-medium text-white backdrop-blur-xl">
          <span className="h-1.5 w-5 animate-pulse rounded-full bg-white" />
          Speaking
        </div>
      ) : null}

      {/* Raised hand */}
      {raisedHand ? (
        <div className="absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/80 text-white backdrop-blur-xl">
          <Hand className="h-3.5 w-3.5" />
        </div>
      ) : null}

      {/* Hover menu */}
      {onPin ? (
        <button
          onClick={onPin}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg bg-black/40 text-white opacity-0 backdrop-blur-xl transition hover:bg-black/60 group-hover:opacity-100"
          aria-label={pinned ? "Unpin" : "Pin"}
        >
          <Ellipsis size={17} />
        </button>
      ) : null}

      {/* Bottom info */}
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

/* =========================================================
   Active call — joined conference with remote participants
========================================================= */

interface CallRoomTileData {
  tileKey: string;
  participantId?: string;
  userId?: string;
  name: string;
  subtitle?: string;
  user?: Pick<UserDto, "firstName" | "lastName" | "email" | "avatarFileId"> | null;
  stream?: MediaStream | null;
  nativeFrame?: string | null;
  isLocal?: boolean;
  isScreenTile?: boolean;
  videoEnabled: boolean;
  audioOn: boolean;
  isSpeaking?: boolean;
  isHost?: boolean;
  isScreenSharing?: boolean;
  raisedHand?: boolean;
}

function ActiveCallRoom({
  raisedHands,
  screenSharingUsers,
  activeSpeakerId,
  reactions,
  nativeFrame,
  ...props
}: SharedCallRoomProps & {
  raisedHands: Set<string>;
  screenSharingUsers: Set<string>;
  activeSpeakerId: string | null;
  reactions: { id: string; emoji: string; name: string }[];
  nativeFrame?: string | null;
}) {
  const {
    user,
    displayName,
    title,
    kind,
    meeting,
    meetingId,
    connected,
    localStream,
    localVideoEnabled,
    localAudioEnabled,
    screenShareEnabled,
    isRecording,
    isHost,
    qualityStats,
    participants,
    remoteStreams,
    participantUserMap,
    audioOutputId,
    messages,
    chatInput,
    setChatInput,
    onSendMessage,
    copiedLink,
    onCopyInviteLink,
    raisedHand,
    onToggleRaiseHand,
    onToggleRecording,
    onSendReaction,
    onLeave,
    onEnd,
    onToggleAudio,
    onToggleVideo,
    onToggleScreenShare,
    startedAt,
  } = props;

  const [elapsed, setElapsed] = useState(0);
  const [layout, setLayout] = useState<"grid" | "speaker">("grid");
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  const isAudio = kind === "audio";

  useEffect(() => {
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [startedAt]);

  const {
    attendeeMap,
    remoteJoined,
    waitingIds,
    guestJoined,
    joinedCount,
    totalCount,
    nameFor,
  } = useCallRoster({ meeting, participants, user, participantUserMap });

  const baseId = (id: string) => id.replace(/^screen-/, "");
  const streamFor = (pid: string) =>
    remoteStreams.find((s) => s.participantId === pid)?.stream ?? null;
  const mediaOn = (stream: MediaStream | null, kindOf: "audio" | "video") => {
    const tracks = kindOf === "audio" ? stream?.getAudioTracks() : stream?.getVideoTracks();
    return tracks?.some((t) => t.enabled && !t.muted && t.readyState !== "ended") ?? false;
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

  /* ---------------- tiles ---------------- */
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
      nativeFrame,
      isLocal: true,
      videoEnabled: localVideoEnabled,
      audioOn: localAudioEnabled,
      isHost,
      isScreenSharing: user?.id ? screenSharingUsers.has(user.id) : false,
      raisedHand,
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
          isScreenSharing: p?.userId ? screenSharingUsers.has(p.userId) : false,
          raisedHand: p?.userId ? raisedHands.has(p.userId) : false,
        };
      }),
  ];

  // Active-speaker-first ordering after the local tile.
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

  /* ---------------- sidebar rows ---------------- */
  const joinedRows: CallRow[] = [
    {
      key: "self",
      userId: user?.id,
      name: displayName,
      user,
      subtitle: isHost ? "Host" : "Participant",
      isYou: true,
      audioOn: localAudioEnabled,
      videoOn: localVideoEnabled,
      raisedHand,
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
        raisedHand: p.userId ? raisedHands.has(p.userId) : false,
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
    waiting: true,
  }));

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#040b15] text-white">
      {/* Background */}
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
        isRecording={isRecording}
        signalLevel={signalLevel}
        signalColor={signalColor}
        connected={connected}
        elapsedLabel={elapsedLabel}
        joinCode={meeting?.joinCode}
        onCopyInviteLink={onCopyInviteLink}
        raisedHand={raisedHand}
        onToggleRaiseHand={onToggleRaiseHand}
        isHost={isHost}
        onToggleRecording={onToggleRecording}
        endLabel={endLabel}
        onEnd={endHandler}
      />

      {/* Content */}
      <main className="relative min-h-0 flex-1 px-3 pb-2">
        <div className="grid h-full grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_413px]">
          {/* Video grid */}
          <section className="min-h-0 overflow-hidden rounded-xl border border-white/[0.05] bg-[#061321]/80 p-5">
            {layout === "speaker" && featuredTile ? (
              <div className="flex h-full min-h-0 flex-col gap-3">
                <div className="min-h-0 flex-1">
                  <CallTile {...featuredTile} featured audioOutputId={audioOutputId}
                    onToggleMic={featuredTile.isLocal ? onToggleAudio : undefined}
                    onToggleCamera={featuredTile.isLocal ? onToggleVideo : undefined}
                    onPin={!featuredTile.isLocal ? () => setPinnedId(null) : undefined}
                    pinned
                  />
                </div>
                <div className="grid h-32 shrink-0 auto-cols-[180px] grid-flow-col gap-3 overflow-x-auto">
                  {stripTiles.map((t) => (
                    <CallTile
                      key={t.tileKey}
                      {...t}
                      audioOutputId={audioOutputId}
                      onToggleMic={t.isLocal ? onToggleAudio : undefined}
                      onToggleCamera={t.isLocal ? onToggleVideo : undefined}
                      onPin={() => setPinnedId(t.tileKey)}
                      pinned={t.tileKey === pinnedId}
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
                    audioOutputId={audioOutputId}
                    onToggleMic={t.isLocal ? onToggleAudio : undefined}
                    onToggleCamera={t.isLocal ? onToggleVideo : undefined}
                    onPin={
                      !t.isLocal
                        ? () => {
                            setPinnedId(t.tileKey);
                            setLayout("speaker");
                          }
                        : undefined
                    }
                    pinned={t.tileKey === pinnedId}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Sidebar */}
          <CallSidePanel
            joinedRows={joinedRows}
            waitingRows={waitingRows}
            isAudio={isAudio}
            meetingId={meetingId}
            kind={kind}
            callerName={displayName}
            messages={messages}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSendMessage={onSendMessage}
            nameFor={nameFor}
            copiedLink={copiedLink}
            onCopyInviteLink={onCopyInviteLink}
            joinCode={meeting?.joinCode}
            onToggleAudio={onToggleAudio}
            onToggleVideo={onToggleVideo}
          />
        </div>
      </main>

      {/* Reactions overlay */}
      {reactions.length > 0 && (
        <div className="pointer-events-none absolute right-[440px] top-24 z-10 flex flex-col gap-2">
          {reactions.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-full border border-white/10 bg-[#0d1f32] px-3 py-1.5 shadow-sm"
            >
              <span className="animate-bounce text-2xl">{r.emoji}</span>
              <span className="max-w-[120px] truncate text-xs text-slate-200">{r.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom toolbar */}
      <footer className="relative flex h-[145px] shrink-0 items-center justify-center">
        <button
          onClick={() => setLayout((l) => (l === "grid" ? "speaker" : "grid"))}
          className="absolute bottom-6 left-7 flex items-center gap-2 rounded-lg bg-[#102035] px-4 py-3 text-xs font-medium text-slate-300 transition hover:bg-[#162b44]"
        >
          <Users size={17} />
          {layout === "grid" ? "Speaker view" : "Grid view"}
        </button>
        <div className="flex items-start gap-8">
          <WaitingControl
            icon={localAudioEnabled ? <Mic size={23} /> : <MicOff size={23} />}
            label={localAudioEnabled ? "Mute" : "Unmute"}
            active={localAudioEnabled}
            onClick={onToggleAudio}
          />
          {!isAudio ? (
            <WaitingControl
              icon={localVideoEnabled ? <Video size={23} /> : <VideoOff size={23} />}
              label={localVideoEnabled ? "Stop Video" : "Start Video"}
              active={localVideoEnabled}
              onClick={onToggleVideo}
            />
          ) : null}
          <WaitingControl
            icon={screenShareEnabled ? <Monitor size={22} /> : <MonitorOff size={22} />}
            label="Share"
            active={screenShareEnabled}
            onClick={onToggleScreenShare}
          />
          {isHost ? (
            <WaitingControl
              icon={<CircleDot size={22} />}
              label={isRecording ? "Recording" : "Record"}
              active={!isRecording}
              onClick={onToggleRecording}
            />
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group flex min-w-[72px] flex-col items-center gap-2">
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.04] bg-[#132237] text-white transition hover:bg-[#1b2f48]">
                  <Smile size={22} />
                </span>
                <span className="text-[12px] font-medium text-slate-300">Reactions</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="top" className="flex min-w-0 gap-1 p-1">
              {["👍", "❤️", "😂", "🎉", "👏"].map((emoji) => (
                <DropdownMenuItem
                  key={emoji}
                  className="h-10 w-10 cursor-pointer justify-center text-lg"
                  onClick={() => onSendReaction(emoji)}
                >
                  {emoji}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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
              <DropdownMenuItem onClick={onToggleRaiseHand}>
                <Hand className="mr-2 h-4 w-4" /> {raisedHand ? "Lower hand" : "Raise hand"}
              </DropdownMenuItem>
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
          <div className="mx-1 h-10 w-px bg-white/[0.08]" />
          <WaitingControl
            icon={<PhoneOff size={22} />}
            label={endLabel}
            danger
            onClick={endHandler}
          />
        </div>
      </footer>
    </div>
  );
}
