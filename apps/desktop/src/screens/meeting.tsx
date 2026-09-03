import { useEffect, useState } from "react";
import { Video, Loader2 } from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import { LiveKitConference } from "../components/livekit/conference";
import { Button } from "../components/ui/button";
import { useRealtime } from "../hooks/useRealtime";
import {
  endMeeting,
  getMeeting,
  getMeetingToken,
  joinMeeting,
  leaveMeeting,
  setScreenShare,
  type Meeting,
} from "../lib/api";
import { useMe } from "../hooks/api";

export function MeetingScreen() {
  const { activeMeetingId, setActiveView } = useUIStore(
    useShallow((s) => ({ activeMeetingId: s.activeMeetingId, setActiveView: s.setActiveView })),
  );
  const { joinRealtimeMeeting, leaveRealtimeMeeting, onRealtimeEvent } = useRealtime();
  const { data: user } = useMe();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [token, setToken] = useState<string | null>(null);
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

    async function join() {
      try {
        const m = await getMeeting(activeMeetingId!);
        let t: string;
        try {
          const result = await getMeetingToken(activeMeetingId!);
          t = result.token;
        } catch {
          const result = await joinMeeting(activeMeetingId!);
          t = result.token;
        }
        if (!cancelled) {
          setMeeting(m);
          setToken(t);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to join meeting");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void join();
    return () => {
      cancelled = true;
      leaveRealtimeMeeting(activeMeetingId);
      unsubscribe();
    };
  }, [activeMeetingId]);

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
    setActiveView("home");
  }

  async function handleEnd() {
    if (activeMeetingId) {
      await endMeeting(activeMeetingId);
    }
    await handleLeave();
  }

  async function handleScreenShare(enabled: boolean) {
    if (activeMeetingId) {
      await setScreenShare(activeMeetingId, enabled).catch(() => {});
    }
  }

  if (!activeMeetingId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-text-secondary">
        <Video className="h-12 w-12 text-text-muted" />
        <p className="text-sm">Select a meeting from the sidebar to join.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-2 text-sm">Joining meeting...</p>
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

  if (!meeting || !token) return null;

  return (
    <LiveKitConference
      meeting={meeting}
      token={token}
      videoEnabled={meeting.type !== "voice_room"}
      onLeave={handleLeave}
      onEnd={meeting.createdBy === user?.id ? handleEnd : undefined}
      onScreenShare={handleScreenShare}
    />
  );
}
