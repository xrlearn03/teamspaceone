import { useEffect, useRef, useState } from "react";
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
import { cn } from "../lib/utils";
import type { UserDto } from "../lib/api";

interface NativeConferenceProps {
  user?: UserDto | null;
  title?: string;
  connected?: boolean;
  localStream?: MediaStream | null;
  nativeFrame?: string | null;
  localVideoEnabled?: boolean;
  localAudioEnabled?: boolean;
  remoteStreams?: { participantId: string; stream: MediaStream }[];
  participants?: { id: string; displayName: string }[];
  screenShareEnabled?: boolean;
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
  localStream,
  nativeFrame,
  localVideoEnabled = false,
  localAudioEnabled = false,
  remoteStreams = [],
  participants = [],
  screenShareEnabled = false,
  onLeave,
  onEnd,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
}: NativeConferenceProps) {
  const [activePanel, setActivePanel] = useState<"chat" | "participants" | null>(null);
  const [raisedHand, setRaisedHand] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [reaction, setReaction] = useState<string | null>(null);

  const displayName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email
    : "Guest";

  const participantCount = connected ? 1 + remoteStreams.length : 0;

  function remoteDisplayName(id: string) {
    return participants.find((p) => p.id === id)?.displayName ?? id;
  }

  function showReaction(emoji: string) {
    setReaction(emoji);
    window.setTimeout(() => setReaction(null), 2000);
  }

  function handleRecord() {
    if (isRecording) {
      mediaRecorder?.stop();
      setIsRecording(false);
      return;
    }

    if (!localStream) return;
    try {
      const recorder = new MediaRecorder(localStream);
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
            onClick={() =>
              setActivePanel((p) => (p === "chat" ? null : "chat"))
            }
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
            onClick={() =>
              setActivePanel((p) => (p === "participants" ? null : "participants"))
            }
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
              isLocal
              stream={localStream}
              nativeFrame={nativeFrame}
              videoEnabled={localVideoEnabled}
            />
            {remoteStreams.map(({ participantId, stream }) => (
              <ParticipantTile
                key={participantId}
                name={remoteDisplayName(participantId)}
                stream={stream}
                videoEnabled={stream.getVideoTracks().some((t) => t.enabled)}
              />
            ))}
          </div>
        </div>

        {activePanel && (
          <div className="flex w-80 shrink-0 flex-col border-l bg-surface p-4">
            {activePanel === "chat" ? (
              <ChatPanel />
            ) : (
              <ParticipantsPanel
                displayName={displayName}
                participants={participants}
              />
            )}
          </div>
        )}

        {reaction && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="animate-bounce text-6xl">{reaction}</span>
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
            active={raisedHand}
            onClick={() => setRaisedHand((v) => !v)}
            onIcon={<Hand className="h-5 w-5" />}
            offIcon={<Hand className="h-5 w-5" />}
            variant="state"
            title={raisedHand ? "Lower hand" : "Raise hand"}
          />
          <ControlButton
            active={isRecording}
            onClick={handleRecord}
            onIcon={<CircleDot className="h-5 w-5" />}
            offIcon={<CircleDot className="h-5 w-5" />}
            variant="danger"
            title={isRecording ? "Stop recording" : "Record"}
          />
          <ControlButton
            active={false}
            onClick={() => showReaction("👍")}
            onIcon={<Smile className="h-5 w-5" />}
            offIcon={<Smile className="h-5 w-5" />}
            variant="state"
            title="Reactions"
          />
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
}: {
  active: boolean;
  onClick?: () => void;
  onIcon: React.ReactNode;
  offIcon: React.ReactNode;
  variant: "mute" | "state" | "danger";
  title?: string;
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
      disabled={!onClick}
      title={title}
    >
      {active ? onIcon : offIcon}
    </Button>
  );
}

function ParticipantTile({
  name,
  stream,
  nativeFrame,
  isLocal,
  videoEnabled,
}: {
  name: string;
  stream?: MediaStream | null;
  nativeFrame?: string | null;
  isLocal?: boolean;
  videoEnabled?: boolean;
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
    <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-surface-elevated">
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
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-surface text-4xl font-semibold text-primary">
            {name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm text-text-secondary">{name}</span>
          {stream && (
            <audio ref={audioRef} autoPlay playsInline className="hidden" />
          )}
        </div>
      )}

      <div className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2.5 py-1 text-xs text-white">
        {name} {isLocal ? "(You)" : ""}
      </div>
    </div>
  );
}

function ChatPanel() {
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-sm font-semibold text-text">Chat</h3>
      <div className="flex flex-1 flex-col items-center justify-center rounded-md bg-surface-elevated p-4 text-center text-sm text-text-secondary">
        <MessageSquare className="mb-2 h-8 w-8 text-text-muted" />
        <p>Chat is not yet available.</p>
      </div>
      <div className="mt-2 flex gap-2">
        <input
          disabled
          placeholder="Send a message..."
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text"
        />
        <Button size="sm" disabled>
          Send
        </Button>
      </div>
    </div>
  );
}

function ParticipantsPanel({
  displayName,
  participants,
}: {
  displayName: string;
  participants: { id: string; displayName: string }[];
}) {
  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-sm font-semibold text-text">Participants</h3>
      <div className="flex-1 overflow-y-auto space-y-2">
        <div className="flex items-center gap-2 rounded-md bg-surface-elevated p-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm text-text">
            {displayName} <span className="text-text-muted">(You)</span>
          </span>
        </div>
        {participants.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-2 rounded-md bg-surface-elevated p-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-xs font-semibold text-text">
              {p.displayName.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm text-text">{p.displayName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
