import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleDot,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { cn, getUserDisplayName } from "@/lib/utils";
import { useNativeCamera } from "@/hooks/useNativeCamera";
import { useNativeMicrophone } from "@/hooks/useNativeMicrophone";
import { useSfu } from "@/hooks/useSfu";
import { UserAvatar } from "@/components/user-avatar";
import { type UserDto } from "@/lib/api";

interface NativeConferenceProps {
  user?: UserDto | null;
  title?: string;
  meetingId: string;
  kind?: "audio" | "video";
  isHost?: boolean;
  onLeave: () => void;
  onEnd?: () => void;
  [key: string]: any;
}

export function NativeConference({
  user,
  title = "Meeting",
  meetingId,
  kind = "video",
  isHost = false,
  onLeave,
  onEnd,
}: NativeConferenceProps) {
  const camera = useNativeCamera();
  const microphone = useNativeMicrophone();
  const sfu = useSfu();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micOn, setMicOn] = useState(microphone.enabled);
  const [videoOn, setVideoOn] = useState(camera.enabled);
  const [screenSharing, setScreenSharing] = useState(false);
  const [isRecording] = useState(false);

  const displayName = getUserDisplayName(user, "Guest");
  const userId = user?.id;

  useEffect(() => {
    const video = camera.videoStream;
    const audio = microphone.audioStream;
    if (!video && !audio) return;
    const tracks: MediaStreamTrack[] = [];
    if (video) tracks.push(...video.getTracks());
    if (audio) tracks.push(...audio.getTracks());
    const combined = new MediaStream(tracks);
    setLocalStream(combined);
    sfu
      .join(
        meetingId,
        displayName,
        {
          audioEnabled: microphone.enabled,
          videoEnabled: camera.enabled,
          stream: combined,
        },
        userId,
      )
      .catch((err) => console.error("Failed to join SFU", err));

    return () => {
      void sfu.leave();
    };
  }, [camera.videoStream, microphone.audioStream, meetingId, displayName, userId]);

  const handleToggleAudio = useCallback(() => {
    sfu.toggleAudio();
    setMicOn((prev) => !prev);
  }, [sfu]);

  const handleToggleVideo = useCallback(() => {
    void sfu.toggleVideo();
    setVideoOn((prev) => !prev);
  }, [sfu]);

  const handleToggleScreenShare = useCallback(() => {
    void sfu
      .toggleScreenShare()
      .then(() => setScreenSharing((prev) => !prev))
      .catch((err) => console.error("Screen share failed", err));
  }, [sfu]);

  const handleLeave = useCallback(() => {
    void sfu.leave();
    onLeave();
  }, [sfu, onLeave]);

  const participantCount = sfu.connected ? 1 + sfu.remoteStreams.length : 0;

  const sortedRemote = useMemo(() => {
    const base = [...sfu.remoteStreams];
    const screen = base.filter((s) => s.participantId.startsWith("screen-"));
    const cameras = base.filter((s) => !s.participantId.startsWith("screen-"));
    return [...screen, ...cameras];
  }, [sfu.remoteStreams]);

  const qualityTotal =
    (sfu.qualityStats?.audio.packetsLost ?? 0) +
    (sfu.qualityStats?.video.packetsLost ?? 0);

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
                sfu.connected ? "bg-success" : "bg-warning",
              )}
            />
            <span>{sfu.connected ? "connected" : "connecting..."}</span>
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
            {sfu.qualityStats ? (
              <>
                <span className="text-text-muted">•</span>
                <span
                  className={cn(
                    "flex items-center gap-1",
                    qualityTotal > 50 ? "text-error" : qualityTotal > 10 ? "text-warning" : "text-success",
                  )}
                >
                  <CircleDot className="h-2 w-2" />
                  {qualityTotal > 50 ? "Poor" : qualityTotal > 10 ? "Fair" : "Good"}
                </span>
              </>
            ) : null}
          </div>
        </div>

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

      {/* Main area */}
      <div className="relative flex flex-1 overflow-hidden p-4">
        <div className="grid h-full w-full auto-rows-fr grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ParticipantTile
            name={`${displayName} (You)`}
            user={user}
            isLocal
            stream={sfu.localStream ?? localStream}
            videoEnabled={videoOn}
            isScreenSharing={screenSharing}
          />
          {sortedRemote.map(({ participantId, stream }) => (
            <ParticipantTile
              key={participantId}
              name={sfu.participants.find((p) => p.id === participantId.replace(/^screen-/, ""))?.displayName ?? "User"}
              stream={stream}
              videoEnabled={stream.getVideoTracks().some((t) => t.enabled && !t.muted && t.readyState !== "ended")}
              isScreenSharing={participantId.startsWith("screen-")}
            />
          ))}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="relative flex h-20 shrink-0 items-center border-t bg-surface px-4">
        <div className="flex flex-1 justify-center gap-2 sm:gap-3">
          <ControlButton
            active={micOn}
            onClick={handleToggleAudio}
            onIcon={<Mic className="h-5 w-5" />}
            offIcon={<MicOff className="h-5 w-5" />}
            variant="mute"
            title={micOn ? "Mute" : "Unmute"}
          />
          {kind === "video" ? (
            <ControlButton
              active={videoOn}
              onClick={handleToggleVideo}
              onIcon={<Video className="h-5 w-5" />}
              offIcon={<VideoOff className="h-5 w-5" />}
              variant="mute"
              title={videoOn ? "Stop video" : "Start video"}
            />
          ) : null}
          <ControlButton
            active={screenSharing}
            onClick={handleToggleScreenShare}
            onIcon={<Monitor className="h-5 w-5" />}
            offIcon={<MonitorOff className="h-5 w-5" />}
            variant="state"
            title={screenSharing ? "Stop sharing" : "Share screen"}
          />
        </div>

        <Button
          variant="destructive"
          className="absolute right-4 gap-2 rounded-full px-5"
          onClick={handleLeave}
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
  variant: "mute" | "state";
  title?: string;
}) {
  let buttonVariant: "default" | "secondary" | "destructive" | "ghost" = "secondary";
  if (variant === "mute" && !active) buttonVariant = "destructive";
  else if (variant === "state" && active) buttonVariant = "default";

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
  user,
  stream,
  isLocal,
  videoEnabled,
  isScreenSharing,
  className,
}: {
  name: string;
  user?: Pick<UserDto, "firstName" | "lastName" | "email" | "avatarFileId"> | null;
  stream?: MediaStream | null;
  isLocal?: boolean;
  videoEnabled?: boolean;
  isScreenSharing?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo =
    videoEnabled && (stream ? stream.getVideoTracks().some((t) => t.enabled) : false);

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-border bg-surface-elevated aspect-square", className)}>
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <UserAvatar
            user={user ?? { firstName: name, email: "" }}
            className="h-24 w-24"
            fallbackClassName="bg-surface text-primary text-4xl"
          />
          <span className="text-sm text-text-secondary">{name}</span>
        </div>
      )}

      <div className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2.5 py-1 text-xs text-white">
        {name} {isLocal ? "(You)" : ""}
      </div>

      {isScreenSharing && (
        <div className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
          <Monitor className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}
