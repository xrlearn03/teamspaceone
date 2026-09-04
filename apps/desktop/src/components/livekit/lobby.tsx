import { useRef, useEffect } from "react";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Button } from "../ui/button";
import { useMediaDevices } from "../../hooks/useMediaDevices";
import type { Meeting, UserDto } from "../../lib/api";

interface MeetingLobbyProps {
  meeting: Meeting;
  user?: UserDto | null;
  onJoin: (opts: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    audioInputId?: string;
    videoInputId?: string;
    audioOutputId?: string;
  }) => void;
  onCancel: () => void;
}

export function MeetingLobby({ meeting, user, onJoin, onCancel }: MeetingLobbyProps) {
  const {
    stream,
    audioEnabled,
    videoEnabled,
    audioInputId,
    videoInputId,
    audioOutputId,
    toggleAudio,
    toggleVideo,
    setAudioDevice,
    setVideoDevice,
    setSpeakerDevice,
    applyAudioOutput,
    error: mediaError,
    videoDevices,
    audioInputDevices,
    audioOutputDevices,
  } = useMediaDevices({ audioEnabled: true, videoEnabled: meeting.type !== "voice_room" });

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play();
      applyAudioOutput(videoRef.current);
    }
  }, [stream, applyAudioOutput]);

  const displayName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email
    : "Guest";

  const formattedScheduled = meeting.scheduledAt
    ? new Date(meeting.scheduledAt).toLocaleString([], {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-text">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">{meeting.title}</h1>
          {meeting.description ? (
            <p className="text-sm text-text-secondary">{meeting.description}</p>
          ) : null}
          {formattedScheduled ? (
            <p className="text-xs text-text-muted">Scheduled for {formattedScheduled}</p>
          ) : null}
        </div>

        <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-surface-elevated">
          {videoEnabled ? (
            <video
              ref={videoRef}
              muted
              playsInline
              autoPlay
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface text-3xl font-semibold text-primary">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-text-secondary">Camera is off</span>
            </div>
          )}

          {mediaError ? (
            <div className="absolute inset-x-0 bottom-0 bg-error/90 p-2 text-center text-xs text-white">
              {mediaError}
            </div>
          ) : null}

          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2">
            <Button
              variant={audioEnabled ? "secondary" : "destructive"}
              size="icon"
              onClick={() => void toggleAudio()}
              aria-label={audioEnabled ? "Mute microphone" : "Unmute microphone"}
            >
              {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
            <Button
              variant={videoEnabled ? "secondary" : "destructive"}
              size="icon"
              onClick={() => void toggleVideo()}
              aria-label={videoEnabled ? "Turn off camera" : "Turn on camera"}
            >
              {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Microphone</span>
            <select
              className="w-full rounded-md border bg-surface px-3 py-2 text-sm"
              value={audioInputId}
              onChange={(e) => setAudioDevice(e.target.value)}
            >
              {audioInputDevices.length === 0 ? (
                <option value="">Default microphone</option>
              ) : (
                audioInputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Camera</span>
            <select
              className="w-full rounded-md border bg-surface px-3 py-2 text-sm"
              value={videoInputId}
              onChange={(e) => setVideoDevice(e.target.value)}
            >
              {videoDevices.length === 0 ? (
                <option value="">Default camera</option>
              ) : (
                videoDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-text-secondary">Speaker</span>
            <select
              className="w-full rounded-md border bg-surface px-3 py-2 text-sm"
              value={audioOutputId}
              onChange={(e) => setSpeakerDevice(e.target.value)}
            >
              {audioOutputDevices.length === 0 ? (
                <option value="">Default speaker</option>
              ) : (
                audioOutputDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))
              )}
            </select>
          </label>
        </div>

        <div className="flex justify-center gap-3">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onJoin({
                audioEnabled,
                videoEnabled,
                audioInputId,
                videoInputId,
                audioOutputId,
              })
            }
          >
            Join {meeting.type === "voice_room" ? "voice room" : "meeting"}
          </Button>
        </div>
      </div>
    </div>
  );
}
