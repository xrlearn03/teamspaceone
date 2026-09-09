import { useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDot,
  Hand,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  MoreHorizontal,
  PhoneOff,
  Smile,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
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
  setMeetingRecording,
  updateMeetingRaiseHand,
  type MeetingMessage,
  type OrganisationMember,
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
  kind?: "audio" | "video";
  localStream?: MediaStream | null;
  recordingStream?: MediaStream | null;
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
  kind = "video",
  localStream,
  recordingStream,
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
}: NativeConferenceProps) {
  const realtime = useRealtime();
  const [activePanel, setActivePanel] = useState<"chat" | "participants" | null>(null);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [reactions, setReactions] = useState<{ id: string; emoji: string; name: string }[]>([]);
  const [isRecording, setIsRecording] = useState(initialRecording);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [screenSharingUsers, setScreenSharingUsers] = useState<Set<string>>(new Set());
  const processedReactionIds = useRef<Set<string>>(new Set());

  const displayName = getUserDisplayName(user, "Guest");

  const participantCount = connected ? 1 + remoteStreams.length : 0;
  const streamToRecord = recordingStream || localStream;

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

  function participantBaseId(id: string) {
    return id.replace(/^screen-/, "");
  }

  function remoteDisplayName(id: string) {
    return participants.find((p) => p.id === participantBaseId(id))?.displayName ?? "User";
  }

  function remoteUserId(id: string) {
    return participants.find((p) => p.id === participantBaseId(id))?.userId;
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
    const unsubChat = realtime.onRealtimeEvent("meeting.chat.created", (msg) => {
      addMessageFromEvent(msg);
    });
    const unsubReaction = realtime.onRealtimeEvent("meeting.reaction.created", (r) => {
      showReaction(r.emoji, r.userId, r.id);
    });
    const unsubRaise = realtime.onRealtimeEvent("meeting.raise_hand.changed", (payload) => {
      setRaisedHands((prev) => {
        const next = new Set(prev);
        if (payload.raised) next.add(payload.userId);
        else next.delete(payload.userId);
        return next;
      });
    });
    const unsubRecording = realtime.onRealtimeEvent("meeting.recording.changed", (payload) => {
      setIsRecording(payload.isRecording);
    });
    const unsubScreen = realtime.onRealtimeEvent("meeting.screen.shared", (payload) => {
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
  }, [realtime, meetingId, participants, user?.id]);

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
    if (!streamToRecord || !isHost) return;
    if (isRecording) {
      mediaRecorder?.stop();
      try {
        await setMeetingRecording(meetingId, false);
      } catch (err) {
        console.error("Failed to update recording state", err);
      }
      setIsRecording(false);
      setMediaRecorder(null);
      return;
    }

    try {
      const recorder = new MediaRecorder(streamToRecord);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `recording-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setIsRecording(true);
      await setMeetingRecording(meetingId, true);
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Top bar */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b bg-surface px-4">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text">{title}</span>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                connected ? "bg-success" : "bg-warning",
              )}
            />
            <span>{connected ? "connected" : "connecting..."}</span>
            <span className="text-text-muted">•</span>
            <span>
              {participantCount} participant{participantCount === 1 ? "" : "s"}
            </span>
            {isRecording ? (
              <>
                <span className="text-text-muted">•</span>
                <span className="flex items-center gap-1 text-error">
                  <CircleDot className="h-2 w-2 animate-pulse" />
                  Recording
                </span>
              </>
            ) : null}
            {qualityStats ? (
              <>
                <span className="text-text-muted">•</span>
                <span
                  className={cn(
                    "flex items-center gap-1",
                    (qualityStats.audio.packetsLost ?? 0) +
                      (qualityStats.video.packetsLost ?? 0) >
                      50
                      ? "text-error"
                      : (qualityStats.audio.packetsLost ?? 0) +
                            (qualityStats.video.packetsLost ?? 0) >
                          10
                        ? "text-warning"
                        : "text-success",
                  )}
                >
                  <CircleDot className="h-2 w-2" />
                  {(qualityStats.audio.packetsLost ?? 0) +
                    (qualityStats.video.packetsLost ?? 0) >
                    50
                    ? "Poor"
                    : (qualityStats.audio.packetsLost ?? 0) +
                          (qualityStats.video.packetsLost ?? 0) >
                        10
                      ? "Fair"
                      : "Good"}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 rounded-full",
              activePanel === "chat" && "bg-primary text-white hover:bg-primary",
            )}
            onClick={() => setActivePanel((p) => (p === "chat" ? null : "chat"))}
            title="Chat"
          >
            <MessageSquare className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 rounded-full",
              activePanel === "participants" && "bg-primary text-white hover:bg-primary",
            )}
            onClick={() => setActivePanel((p) => (p === "participants" ? null : "participants"))}
            title="Participants"
          >
            <Users className="h-5 w-5" />
          </Button>
          {onEnd ? (
            <Button
              variant="destructive"
              className="gap-2 rounded-full px-4"
              onClick={onEnd}
            >
              <PhoneOff className="h-4 w-4" />
              End
            </Button>
          ) : null}
        </div>
      </div>

      {/* Main area */}
      <div className="relative flex flex-1 overflow-hidden">
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-4">
          <div className="grid w-full max-w-6xl auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ParticipantTile
              name={displayName}
              user={user}
              isLocal
              stream={localStream}
              nativeFrame={nativeFrame}
              videoEnabled={localVideoEnabled}
              isHandRaised={user?.id ? raisedHands.has(user.id) : false}
              isScreenSharing={user?.id ? screenSharingUsers.has(user.id) : false}
            />
            {[...remoteStreams]
              .sort((a, b) => {
                const aScreen = a.participantId.startsWith("screen-") ? 1 : 0;
                const bScreen = b.participantId.startsWith("screen-") ? 1 : 0;
                if (aScreen !== bScreen) return bScreen - aScreen;
                const aActive = participantBaseId(a.participantId) === activeSpeakerId ? 1 : 0;
                const bActive = participantBaseId(b.participantId) === activeSpeakerId ? 1 : 0;
                return bActive - aActive;
              })
              .map(({ participantId, stream }) => {
                const pUserId = remoteUserId(participantId);
                const isScreen = participantId.startsWith("screen-");
                return (
                  <ParticipantTile
                    key={participantId}
                    name={`${remoteDisplayName(participantId)}${isScreen ? " (screen)" : ""}`}
                    user={pUserId ? participantUserMap.get(pUserId) : undefined}
                    stream={stream}
                    videoEnabled={stream.getVideoTracks().some((t) => t.enabled && !t.muted && t.readyState !== "ended")}
                    isHandRaised={pUserId ? raisedHands.has(pUserId) : false}
                    isScreenSharing={pUserId ? screenSharingUsers.has(pUserId) : false}
                  />
                );
              })}
          </div>
        </div>

        {activePanel && (
          <div className="flex w-80 shrink-0 flex-col border-l bg-surface p-4">
            {activePanel === "chat" ? (
              <ChatPanel
                messages={messages}
                input={chatInput}
                setInput={setChatInput}
                onSend={sendMessage}
                resolveName={resolveName}
              />
            ) : (
              <ParticipantsPanel
                displayName={displayName}
                participants={participants}
                raisedHands={raisedHands}
                screenSharingUsers={screenSharingUsers}
                meetingId={meetingId}
                kind={kind}
                callerName={displayName}
                currentUserId={user?.id}
              />
            )}
          </div>
        )}

        {reactions.length > 0 && (
          <div className="pointer-events-none absolute right-4 top-4 flex flex-col gap-2">
            {reactions.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 shadow-sm"
              >
                <span className="animate-bounce text-2xl">{r.emoji}</span>
                <span className="max-w-[120px] truncate text-xs text-text">{r.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="relative flex h-20 shrink-0 items-center border-t bg-surface px-4">
        <div className="flex flex-1 justify-center gap-2 sm:gap-3">
          <ControlButton
            active={localAudioEnabled}
            onClick={onToggleAudio}
            onIcon={<Mic className="h-5 w-5" />}
            offIcon={<MicOff className="h-5 w-5" />}
            variant="mute"
            title={localAudioEnabled ? "Mute" : "Unmute"}
          />
          <ControlButton
            active={localVideoEnabled}
            onClick={onToggleVideo}
            onIcon={<Video className="h-5 w-5" />}
            offIcon={<VideoOff className="h-5 w-5" />}
            variant="mute"
            title={localVideoEnabled ? "Stop video" : "Start video"}
          />
          <ControlButton
            active={screenShareEnabled}
            onClick={onToggleScreenShare}
            onIcon={<Monitor className="h-5 w-5" />}
            offIcon={<MonitorOff className="h-5 w-5" />}
            variant="state"
            title={screenShareEnabled ? "Stop sharing" : "Share screen"}
          />
          <ControlButton
            active={raisedHands.has(user?.id ?? "")}
            onClick={toggleRaiseHand}
            onIcon={<Hand className="h-5 w-5" />}
            offIcon={<Hand className="h-5 w-5" />}
            variant="state"
            title={raisedHands.has(user?.id ?? "") ? "Lower hand" : "Raise hand"}
          />
          <ControlButton
            active={isRecording}
            onClick={toggleRecording}
            onIcon={<CircleDot className="h-5 w-5" />}
            offIcon={<CircleDot className="h-5 w-5" />}
            variant="danger"
            disabled={!streamToRecord || !isHost}
            title={isRecording ? "Stop recording" : "Record"}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                className="h-11 w-11 rounded-xl"
                title="Reactions"
              >
                <Smile className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="flex min-w-0 gap-1 p-1">
              {["👍", "❤️", "😂", "🎉", "👏"].map((emoji) => (
                <DropdownMenuItem
                  key={emoji}
                  className="h-10 w-10 cursor-pointer justify-center text-lg"
                  onClick={() => sendReaction(emoji)}
                >
                  {emoji}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <ControlButton
            active={false}
            onClick={() => {}}
            onIcon={<MoreHorizontal className="h-5 w-5" />}
            offIcon={<MoreHorizontal className="h-5 w-5" />}
            variant="state"
            title="More"
          />
        </div>

        <Button
          variant="destructive"
          className="absolute right-4 gap-2 rounded-full px-5"
          onClick={onLeave}
        >
          <PhoneOff className="h-4 w-4" />
          Leave
        </Button>
      </div>
    </div>
  );
}

function ControlButton({
  active,
  onClick,
  onIcon,
  offIcon,
  variant,
  title,
  disabled,
}: {
  active: boolean;
  onClick?: () => void;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  variant: "mute" | "state" | "danger";
  title?: string;
  disabled?: boolean;
}) {
  let buttonVariant: "default" | "secondary" | "destructive" | "ghost" = "secondary";
  if (variant === "mute" && !active) buttonVariant = "destructive";
  else if (variant === "state" && active) buttonVariant = "default";
  else if (variant === "danger" && active) buttonVariant = "destructive";

  return (
    <Button
      variant={buttonVariant}
      size="icon"
      className="h-11 w-11 rounded-xl"
      onClick={onClick}
      disabled={disabled || !onClick}
      title={title}
    >
      {active ? onIcon : offIcon}
    </Button>
  );
}

function ParticipantTile({
  name,
  user,
  stream,
  nativeFrame,
  isLocal,
  videoEnabled,
  isHandRaised,
  isScreenSharing,
}: {
  name: string;
  user?: Pick<UserDto, "firstName" | "lastName" | "email" | "avatarFileId"> | null;
  stream?: MediaStream | null;
  nativeFrame?: string | null;
  isLocal?: boolean;
  videoEnabled?: boolean;
  isHandRaised?: boolean;
  isScreenSharing?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  useEffect(() => {
    if (audioRef.current && stream) {
      audioRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo =
    videoEnabled &&
    (stream
      ? stream.getVideoTracks().some((t) => t.enabled)
      : nativeFrame != null && nativeFrame !== "");

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-surface-elevated">
      {hasVideo ? (
        stream ? (
          <video
            ref={videoRef}
            autoPlay
            muted={isLocal}
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <img
            src={nativeFrame || undefined}
            alt={name}
            className="h-full w-full object-cover"
          />
        )
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <UserAvatar
            user={user ?? { firstName: name, email: "" }}
            className="h-24 w-24"
            fallbackClassName="bg-surface text-primary text-4xl"
          />
          <span className="text-sm text-text-secondary">{name}</span>
          {stream && (
            <audio ref={audioRef} autoPlay playsInline muted={isLocal} className="hidden" />
          )}
        </div>
      )}

      <div className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2.5 py-1 text-xs text-white">
        {name} {isLocal ? "(You)" : ""}
      </div>

      {(isHandRaised || isScreenSharing) && (
        <div className="absolute right-3 top-3 flex gap-1">
          {isHandRaised && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-warning text-white">
              <Hand className="h-3.5 w-3.5" />
            </div>
          )}
          {isScreenSharing && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
              <Monitor className="h-3.5 w-3.5" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChatPanel({
  messages,
  input,
  setInput,
  onSend,
  resolveName,
}: {
  messages: MeetingMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  resolveName: (userId: string) => string;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-sm font-semibold text-text">Chat</h3>
      <div className="flex-1 overflow-y-auto space-y-2 rounded-md bg-surface-elevated p-2">
        {messages.length === 0 ? (
          <p className="text-sm text-text-secondary">No messages yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-text">{resolveName(m.userId)}</span>
              <span className="text-sm text-text-secondary">{m.content}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend();
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message..."
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text outline-none focus:border-primary"
        />
        <Button type="submit" size="sm" disabled={!input.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

function ParticipantsPanel({
  displayName,
  participants,
  raisedHands,
  screenSharingUsers,
  meetingId,
  kind,
  callerName,
  currentUserId,
}: {
  displayName: string;
  participants: { id: string; displayName: string; userId?: string }[];
  raisedHands: Set<string>;
  screenSharingUsers: Set<string>;
  meetingId: string;
  kind: "audio" | "video";
  callerName?: string;
  currentUserId?: string;
}) {
  const organisationId = useUIStore((s) => s.organisationId);
  const { data: members } = useMembers(organisationId ?? undefined);
  const memberUserIds = useMemo(() => (members ?? []).map((m) => m.userId), [members]);
  const { data: users } = useUsers(memberUserIds);
  const [query, setQuery] = useState("");
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const realtime = useRealtime();

  const panelUserIds = useMemo(
    () =>
      [...new Set([...(currentUserId ? [currentUserId] : []), ...participants.map((p) => p.userId).filter((u): u is string => Boolean(u))])],
    [currentUserId, participants],
  );
  const { data: panelUsers } = useUsers(panelUserIds);

  const userMap = useMemo(
    () => new Map([...(users ?? []), ...(panelUsers ?? [])].map((u) => [u.id, u])),
    [users, panelUsers],
  );

  const existingIds = useMemo(
    () =>
      new Set([
        ...(currentUserId ? [currentUserId] : []),
        ...participants.map((p) => p.userId).filter((u): u is string => Boolean(u)),
        ...invited,
      ]),
    [currentUserId, participants, invited],
  );

  const matches = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return (members ?? []).filter((member) => {
      if (existingIds.has(member.userId)) return false;
      const user = userMap.get(member.userId);
      const name = getMemberName(member, user);
      return name.toLowerCase().includes(q);
    });
  }, [members, userMap, query, existingIds]);

  function addToCall(member: OrganisationMember) {
    realtime.sendCallRing({
      meetingId,
      kind,
      callerName,
      userIds: [member.userId],
    });
    setInvited((prev) => new Set([...prev, member.userId]));
    setQuery("");
  }

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-sm font-semibold text-text">Participants</h3>
      <div className="mb-2 space-y-1">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members..."
        />
        {matches.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-1">
            {matches.map((member) => {
              const user = userMap.get(member.userId);
              const name = getMemberName(member, user);
              return (
                <button
                  key={member.userId}
                  type="button"
                  onClick={() => addToCall(member)}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-left hover:bg-surface-elevated"
                >
                  <UserAvatar
                    user={user ?? { firstName: name, email: "" }}
                    className="h-6 w-6"
                    fallbackClassName="bg-surface text-text text-xs"
                  />
                  <span className="truncate">{name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-2">
        <div className="flex items-center gap-2 rounded-md bg-surface-elevated p-2">
          <UserAvatar
            user={currentUserId ? userMap.get(currentUserId) : undefined}
            className="h-8 w-8"
            fallbackClassName="bg-primary text-white text-xs"
          />
          <span className="flex-1 truncate text-sm text-text">
            {displayName} <span className="text-text-muted">(You)</span>
          </span>
        </div>
        {participants.map((p) => {
          const pUser = p.userId ? userMap.get(p.userId) : undefined;
          return (
            <div key={p.id} className="flex items-center gap-2 rounded-md bg-surface-elevated p-2">
              <UserAvatar
                user={pUser ?? { firstName: p.displayName, email: "" }}
                className="h-8 w-8"
                fallbackClassName="bg-surface text-text text-xs"
              />
              <span className="flex-1 truncate text-sm text-text">{p.displayName}</span>
              {p.userId && raisedHands.has(p.userId) && (
                <Hand className="h-4 w-4 text-warning" />
              )}
              {p.userId && screenSharingUsers.has(p.userId) && (
                <Monitor className="h-4 w-4 text-primary" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getMemberName(_member: OrganisationMember, user?: UserDto) {
  return getUserDisplayName(user);
}


