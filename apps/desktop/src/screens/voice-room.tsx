import { useEffect, useState } from "react";
import { Mic, Loader2 } from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import { MeetingLobby } from "../components/livekit/lobby";
import { LiveKitConference } from "../components/livekit/conference";
import { Button } from "../components/ui/button";
import { useRealtime } from "../hooks/useRealtime";
import {
  endMeeting,
  getMeeting,
  getMeetingToken,
  joinMeeting,
  leaveMeeting,
  type Meeting,
} from "../lib/api";
import { useMe } from "../hooks/api";
import type { MediaJoinOptions } from "./meeting";

export function VoiceRoomScreen() {
  const { activeMeetingId, setActiveView } = useUIStore(
    useShallow((s) => ({ activeMeetingId: s.activeMeetingId, setActiveView: s.setActiveView })),
  );
  const { joinRealtimeMeeting, leaveRealtimeMeeting, onRealtimeEvent } = useRealtime();
  const { data: user } = useMe();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mediaOptions, setMediaOptions] = useState<MediaJoinOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeMeetingId) return;

    joinRealtimeMeeting(activeMeetingId);
    const unsubscribe = onRealtimeEvent("meeting.ended", (payload) => {
      if (payload.id === activeMeetingId) {
        setToken(null);
        setMeeting(null);
        setActiveView("home");
      }
    });

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function fetchMeeting() {
      try {
        const m = await getMeeting(activeMeetingId!);
        if (m.type !== "voice_room") {
          throw new Error("Selected item is not a voice room");
        }
        if (m.status === "ended") {
          throw new Error("Voice room has ended");
        }
        if (!cancelled) {
          setMeeting(m);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load voice room");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchMeeting();
    return () => {
      cancelled = true;
      leaveRealtimeMeeting(activeMeetingId);
      unsubscribe();
    };
  }, [activeMeetingId]);

  async function handleJoin(opts: MediaJoinOptions) {
    if (!activeMeetingId) return;
    setLoading(true);
    setError(null);
    try {
      let t: string;
      try {
        const result = await getMeetingToken(activeMeetingId);
        t = result.token;
      } catch {
        const result = await joinMeeting(activeMeetingId);
        t = result.token;
      }
      setMediaOptions({ ...opts, videoEnabled: false });
      setToken(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join voice room");
    } finally {
      setLoading(false);
    }
  }

  async function handleLeave() {
    if (activeMeetingId) {
      try {
        await leaveMeeting(activeMeetingId);
      } catch {
        // Best-effort.
      }
    }
    setToken(null);
    setMeeting(null);
    setMediaOptions(null);
    setActiveView("home");
  }

  async function handleEnd() {
    if (activeMeetingId) {
      await endMeeting(activeMeetingId);
    }
    await handleLeave();
  }

  if (!activeMeetingId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-text-secondary">
        <Mic className="h-12 w-12 text-text-muted" />
        <p className="text-sm">Select a voice room from the sidebar to join.</p>
      </div>
    );
  }

  if (loading && !meeting) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-2 text-sm">Loading voice room...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-text-secondary">
        <p className="text-sm text-error">{error}</p>
        <Button variant="secondary" onClick={() => setActiveView("home")}>
          Go back
        </Button>
      </div>
    );
  }

  if (!meeting) return null;

  if (!token || !mediaOptions) {
    return (
      <MeetingLobby
        meeting={meeting}
        user={user}
        onJoin={handleJoin}
        onCancel={() => setActiveView("home")}
      />
    );
  }

  const displayName =
    user
      ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email
      : "Guest";

  return (
    <LiveKitConference
      meeting={meeting}
      token={token}
      displayName={displayName}
      audioEnabled={mediaOptions.audioEnabled}
      videoEnabled={false}
      audioInputId={mediaOptions.audioInputId}
      audioOutputId={mediaOptions.audioOutputId}
      onLeave={handleLeave}
      onEnd={meeting.createdBy === user?.id ? handleEnd : undefined}
    />
  );
}
