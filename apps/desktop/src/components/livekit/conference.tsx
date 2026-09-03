import { Mic, MicOff, Video, VideoOff, MonitorUp, MessageSquare, Users, PhoneOff, Settings, Loader2 } from "lucide-react";
import { useLiveKit } from "../../hooks/useLiveKit";
import { VideoRenderer } from "./video-renderer";
import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { Track } from "livekit-client";
import type { Meeting } from "../../lib/api";

const LIVEKIT_URL = (import.meta.env.VITE_LIVEKIT_URL as string | undefined) ?? "ws://localhost:7880";

function buildRtcConfig(): RTCConfiguration | undefined {
  const stun = (import.meta.env.VITE_STUN_SERVER_URL as string | undefined)?.trim();
  const turn = (import.meta.env.VITE_TURN_SERVER_URL as string | undefined)?.trim();
  const turnUser = (import.meta.env.VITE_TURN_USERNAME as string | undefined)?.trim();
  const turnCred = (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined)?.trim();

  if (!stun && !turn) return undefined;

  const iceServers: RTCIceServer[] = [];
  if (stun) iceServers.push({ urls: stun });
  if (turn) {
    iceServers.push({
      urls: turn,
      username: turnUser,
      credential: turnCred,
    });
  }

  return { iceServers };
}

interface LiveKitConferenceProps {
  meeting: Meeting;
  token: string;
  videoEnabled?: boolean;
  onLeave: () => Promise<void>;
  onEnd?: () => Promise<void>;
  onScreenShare?: (enabled: boolean) => Promise<void>;
}

export function LiveKitConference({
  meeting,
  token,
  videoEnabled = true,
  onLeave,
  onEnd,
  onScreenShare,
}: LiveKitConferenceProps) {
  const {
    connectionState,
    error,
    remoteParticipants,
    localAudioEnabled,
    localVideoEnabled,
    localScreenShare,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    leave,
    room,
  } = useLiveKit({
    url: LIVEKIT_URL,
    token,
    roomName: meeting.roomName,
    audioEnabled: true,
    videoEnabled,
    rtcConfig: buildRtcConfig(),
  });

  async function handleLeave() {
    await leave();
    await onLeave();
  }

  async function handleEnd() {
    await onEnd?.();
    await handleLeave();
  }

  async function handleToggleScreenShare() {
    await toggleScreenShare();
    await onScreenShare?.(!localScreenShare);
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-text-secondary">
        <p className="text-sm text-error">{error.message}</p>
        <Button variant="secondary" onClick={() => void handleLeave()}>
          Go back
        </Button>
      </div>
    );
  }

  if (connectionState !== "connected") {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-2 text-sm">{connectionState === "connecting" ? "Connecting..." : connectionState}</p>
      </div>
    );
  }

  const localParticipant = room?.localParticipant;
  const localScreen = localParticipant?.getTrackPublication(Track.Source.ScreenShare)?.track;
  const allParticipants = [
    { participant: localParticipant, isLocal: true, screen: localScreen },
    ...remoteParticipants.map((p) => ({
      participant: p,
      isLocal: false,
      screen: p.getTrackPublication(Track.Source.ScreenShare)?.track,
    })),
  ];

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <div>
          <h1 className="text-sm font-semibold text-text">{meeting.title}</h1>
          <p className="text-xs text-text-muted">
            {connectionState} · {allParticipants.length} participants
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">
            <Users className="mr-1.5 h-4 w-4" />
            Participants
          </Button>
          <Button variant="ghost" size="sm">
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Chat
          </Button>
          {onEnd && (
            <Button variant="destructive" size="sm" onClick={() => void handleEnd()}>
              End
            </Button>
          )}
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-6 md:grid-cols-2 lg:grid-cols-3">
        {allParticipants.map(({ participant, isLocal, screen }) => {
          const videoTrack =
            screen ??
            participant?.getTrackPublication(Track.Source.Camera)?.track;
          return (
            <div
              key={participant?.identity ?? "local"}
              className={cn(
                "relative flex aspect-video flex-col items-center justify-center overflow-hidden rounded-lg border bg-surface-elevated",
                !videoTrack && "bg-primary-subtle",
              )}
            >
              {videoTrack ? (
                <VideoRenderer track={videoTrack} className="h-full w-full object-cover" />
              ) : (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-2xl font-semibold text-primary">
                    {(participant?.name ?? "U").charAt(0).toUpperCase()}
                  </div>
                  <span className="mt-3 text-sm font-medium text-text">
                    {participant?.name ?? "You"} {isLocal && "(You)"}
                  </span>
                </>
              )}
              {screen && (
                <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  Screen
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex h-16 items-center justify-between border-t px-6">
        <div className="text-xs text-text-muted">Connection quality: Excellent</div>
        <div className="flex items-center gap-2">
          <Button
            variant={localAudioEnabled ? "secondary" : "destructive"}
            size="icon"
            onClick={() => void toggleMicrophone()}
          >
            {localAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>
          <Button
            variant={localVideoEnabled ? "secondary" : "destructive"}
            size="icon"
            onClick={() => void toggleCamera()}
          >
            {localVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </Button>
          <Button
            variant={localScreenShare ? "default" : "secondary"}
            size="icon"
            onClick={() => void handleToggleScreenShare()}
          >
            <MonitorUp className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="destructive" size="sm" onClick={() => void handleLeave()}>
          <PhoneOff className="mr-1.5 h-4 w-4" />
          Leave
        </Button>
      </div>
    </div>
  );
}
