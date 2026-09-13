"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, Loader2, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { useSfu } from "@/hooks/useSfu";
import { useNativeCamera } from "@/hooks/useNativeCamera";
import { useNativeMicrophone } from "@/hooks/useNativeMicrophone";
import {
  getAccessToken,
  getGuestMeetingLinkInfo,
  getMeeting,
  joinMeetingAsGuest,
  type GuestJoinResult,
  type GuestMeetingLinkInfo,
} from "@/lib/api";
import { toast, toastError } from "@/lib/toast";

export const PENDING_MEETING_KEY = "teamspace-one:pendingMeetingId";

function decodeMeetingId(token: string): string | null {
  try {
    const part = token.split(".")[0];
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    return atob(b64) || null;
  } catch {
    return null;
  }
}

function RemoteTile({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  const hasVideo = stream.getVideoTracks().some((t) => t.enabled && !t.muted && t.readyState !== "ended");
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-border bg-surface-elevated">
      <video ref={ref} autoPlay playsInline className="h-full w-full object-cover" />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-xl font-semibold text-primary">
            {name.charAt(0).toUpperCase() || "?"}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {name}
      </div>
    </div>
  );
}

export function GuestMeetingScreen({ token }: { token: string }) {
  const sfu = useSfu();
  const camera = useNativeCamera();
  const mic = useNativeMicrophone();

  const [info, setInfo] = useState<GuestMeetingLinkInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [memberMeeting, setMemberMeeting] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<GuestJoinResult | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const isVoiceRoom = info?.type === "voice_room" || joined?.type === "voice_room";

  // Resolve the link: if the user is signed in and the meeting is visible to
  // them, offer the normal member route instead of the guest flow.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const session = await getAccessToken();
        const meetingId = decodeMeetingId(token);
        if (session && meetingId) {
          try {
            const m = await getMeeting(meetingId);
            if (!cancelled) {
              setMemberMeeting(m.id);
              setInfo({
                meetingId: m.id,
                title: m.title,
                type: m.type,
                status: m.status,
                scheduledAt: m.scheduledAt,
              });
            }
            return;
          } catch {
            // Not a member of this meeting — continue as guest.
          }
        }
        const data = await getGuestMeetingLinkInfo(token);
        if (!cancelled) setInfo(data);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "This meeting link is invalid or has expired";
          setInfoError(message);
          toast.error(message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (localVideoRef.current && sfu.localStream) {
      localVideoRef.current.srcObject = sfu.localStream;
    }
  }, [sfu.localStream, joined]);

  useEffect(() => () => void sfu.leave(), [sfu]);

  function continueAsMember() {
    if (!memberMeeting) return;
    sessionStorage.setItem(PENDING_MEETING_KEY, memberMeeting);
    window.location.href = "/";
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Your name is required");
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Enter a valid email address");
      return;
    }
    setJoining(true);
    try {
      const result = await joinMeetingAsGuest(token, { name: name.trim(), email: email.trim() });

      const tracks: MediaStreamTrack[] = [];
      if (mic.enabled && mic.audioStream) tracks.push(...mic.audioStream.getAudioTracks());
      if (camera.enabled && !isVoiceRoom && camera.videoStream) {
        tracks.push(...camera.videoStream.getVideoTracks());
      }
      await mic.resumeContext();

      await sfu.join(
        result.roomId,
        result.displayName,
        {
          audioEnabled: mic.enabled,
          videoEnabled: camera.enabled && !isVoiceRoom,
          stream: tracks.length > 0 ? new MediaStream(tracks) : undefined,
        },
        result.userId,
        result.token,
      );
      setJoined(result);
    } catch (err) {
      toastError(err, "Could not join the meeting");
    } finally {
      setJoining(false);
    }
  }

  function handleLeave() {
    void sfu.leave();
    setJoined(null);
  }

  // --- In-call view ---
  if (joined) {
    const nameOf = (participantId: string) =>
      sfu.participants.find((p) => p.id === participantId)?.displayName ?? "Participant";
    return (
      <div className="flex h-full flex-col bg-background">
        <div className="flex h-14 shrink-0 items-center justify-between border-b bg-surface px-4">
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-text">{joined.title}</span>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span className={`h-2 w-2 rounded-full ${sfu.connected ? "bg-success" : "bg-warning"}`} />
              <span>{sfu.connected ? "connected" : "connecting..."}</span>
              <span className="text-text-muted">•</span>
              <span>
                {sfu.participants.length + 1} participant{sfu.participants.length === 0 ? "" : "s"}
              </span>
              <span className="text-text-muted">•</span>
              <span className="text-text-muted">Guest</span>
            </div>
          </div>
          <Button variant="destructive" className="gap-2 rounded-full px-4" onClick={handleLeave}>
            <PhoneOff className="h-4 w-4" />
            Leave
          </Button>
        </div>

        <div className="relative flex-1 overflow-hidden p-4">
          {sfu.remoteStreams.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-text-muted">
              Waiting for others to join...
            </div>
          ) : (
            <div className="mx-auto grid h-full max-w-6xl auto-rows-fr grid-cols-1 content-center gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sfu.remoteStreams.map(({ participantId, stream }) => (
                <RemoteTile key={participantId} stream={stream} name={nameOf(participantId)} />
              ))}
            </div>
          )}
          {sfu.localStream && !isVoiceRoom && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-4 right-4 aspect-video w-48 rounded-xl border border-border bg-surface-elevated object-cover"
            />
          )}
        </div>

        <div className="flex h-16 shrink-0 items-center justify-center gap-3 border-t bg-surface px-4">
          <Button
            variant={sfu.localAudioEnabled ? "secondary" : "destructive"}
            size="icon"
            className="rounded-full"
            onClick={sfu.toggleAudio}
            title={sfu.localAudioEnabled ? "Mute" : "Unmute"}
          >
            {sfu.localAudioEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </Button>
          {!isVoiceRoom && (
            <Button
              variant={sfu.localVideoEnabled ? "secondary" : "destructive"}
              size="icon"
              className="rounded-full"
              onClick={() => void sfu.toggleVideo()}
              title={sfu.localVideoEnabled ? "Stop video" : "Start video"}
            >
              {sfu.localVideoEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
            </Button>
          )}
          {sfu.error ? <span className="text-xs text-error">{sfu.error}</span> : null}
        </div>
      </div>
    );
  }

  if (infoError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm font-medium text-text">Cannot join meeting</p>
        <p className="max-w-sm text-xs text-text-muted">{infoError}</p>
        <Button variant="secondary" onClick={() => (window.location.href = "/")}>
          Go back
        </Button>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-2 text-sm">Loading meeting...</p>
      </div>
    );
  }

  // --- Guest lobby ---
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background p-8 text-text">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">{info.title}</h1>
          <p className="text-sm text-text-secondary">
            {info.scheduledAt
              ? `Scheduled for ${new Date(info.scheduledAt).toLocaleString()}`
              : "Join as a guest — no account needed."}
          </p>
        </div>

        <div className="relative aspect-video w-full overflow-hidden rounded-xl border bg-surface-elevated">
          {!isVoiceRoom && camera.enabled && camera.frame ? (
            <img src={camera.frame} alt="Camera preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface text-3xl font-semibold text-primary">
                {(name || "G").charAt(0).toUpperCase()}
              </div>
              <span className="text-sm text-text-secondary">
                {isVoiceRoom ? "Voice room" : "Camera is off"}
              </span>
            </div>
          )}
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2">
            <Button
              type="button"
              variant={mic.enabled ? "secondary" : "destructive"}
              size="icon"
              onClick={() => mic.setEnabled(!mic.enabled)}
              aria-label={mic.enabled ? "Mute microphone" : "Unmute microphone"}
            >
              {mic.enabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
            {!isVoiceRoom && (
              <Button
                type="button"
                variant={camera.enabled ? "secondary" : "destructive"}
                size="icon"
                onClick={() => camera.setEnabled(!camera.enabled)}
                aria-label={camera.enabled ? "Turn off camera" : "Turn on camera"}
              >
                {camera.enabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>

        <form onSubmit={handleJoin} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={100}
              required
            />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              required
            />
          </div>
          {sfu.error && <p className="text-sm text-error">{sfu.error}</p>}
          <div className="flex justify-center gap-3">
            {memberMeeting ? (
              <Button type="button" variant="secondary" className="gap-2" onClick={continueAsMember}>
                <Link2 className="h-4 w-4" />
                Continue as member
              </Button>
            ) : null}
            <Button type="submit" disabled={joining}>
              {joining ? "Joining..." : `Join ${isVoiceRoom ? "voice room" : "meeting"} as guest`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
