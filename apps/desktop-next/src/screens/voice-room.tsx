import { useEffect, useRef, useState } from "react";
import { Mic, Loader2 } from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { useShallow } from "zustand/shallow";
import { MeetingLobby } from "@/components/livekit/lobby";
import { NativeConference } from "@/components/native-conference";
import { Button } from "@teamspace-one/ui/button";
import { useRealtime } from "@/hooks/useRealtime";
import { useNativeMicrophone } from "@/hooks/useNativeMicrophone";
import { endMeeting, getMeeting, joinMeeting, leaveMeeting, setScreenShare, type Meeting } from "@/lib/api";
import { useMe } from "@/hooks/api";
import type { MediaJoinOptions } from "./meeting";
import { useSfu } from "@/hooks/useSfu";
import { getUserDisplayName } from "@/lib/utils";

export function VoiceRoomScreen() {
  const { activeMeetingId, setActiveView } = useUIStore(
    useShallow((s) => ({ activeMeetingId: s.activeMeetingId, setActiveView: s.setActiveView })),
  );
  const { joinRealtimeMeeting, leaveRealtimeMeeting, onRealtimeEvent, sendCallCancel } = useRealtime();
  const { data: user } = useMe();
  const sfu = useSfu();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [mediaOptions, setMediaOptions] = useState<MediaJoinOptions | null>(null);
  const [audioOutputId, setAudioOutputId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nativeMic = useNativeMicrophone();

  useEffect(() => {
    if (sfu.error) {
      setError(sfu.error);
    }
  }, [sfu.error]);

  const sfuRef = useRef(sfu);
  sfuRef.current = sfu;

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
      void sfuRef.current.leave();
    };
  }, [activeMeetingId]);

  async function handleJoin(opts: MediaJoinOptions) {
    if (!activeMeetingId) return;

    const displayName = getUserDisplayName(user, "Guest");

    setMediaOptions(opts);
    setAudioOutputId(opts.audioOutputId);
    setError(null);

    try {
      await joinMeeting(activeMeetingId, displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join meeting");
      setMediaOptions(null);
      return;
    }

    try {
      await sfu.join(activeMeetingId, displayName, opts, user?.id);
      setToken("native");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join SFU");
      setMediaOptions(null);
    }
  }

  async function handleLeave() {
    if (activeMeetingId) {
      sendCallCancel(activeMeetingId);
      try {
        await leaveMeeting(activeMeetingId);
      } catch {
        // Best-effort.
      }
    }
    sfu.leave();
    setToken(null);
    setMeeting(null);
    setMediaOptions(null);
    setAudioOutputId(undefined);
    setActiveView("home");
  }

  async function handleEnd() {
    if (activeMeetingId) {
      await endMeeting(activeMeetingId);
    }
    await handleLeave();
  }

  async function handleToggleScreenShare() {
    if (!activeMeetingId) return;
    try {
      await sfu.toggleScreenShare();
      await setScreenShare(activeMeetingId, sfu.screenShareEnabled);
    } catch (err) {
      console.error("Screen share toggle failed", err);
    }
  }

  if (!activeMeetingId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-3 sm:p-4 lg:p-6 text-text-secondary">
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
      <div className="flex h-full flex-col items-center justify-center gap-3 p-3 sm:p-4 lg:p-6 text-text-secondary">
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
        nativeAudioEnabled={nativeMic.enabled}
        setNativeAudioEnabled={nativeMic.setEnabled}
        nativeAudioDevices={nativeMic.devices}
        nativeAudioIndex={nativeMic.selectedIndex}
        setNativeAudio={nativeMic.setSelectedIndex}
        nativeAudioError={nativeMic.error}
        nativeAudioStream={nativeMic.audioStream}
        nativeVideoEnabled={false}
      />
    );
  }

  return (
    <NativeConference
      user={user}
      title={meeting.title}
      connected={sfu.connected}
      meetingId={meeting.id}
      meeting={meeting}
      kind="audio"
      localStream={sfu.localStream}
      localVideoEnabled={sfu.localVideoEnabled}
      localAudioEnabled={sfu.localAudioEnabled}
      screenShareEnabled={sfu.screenShareEnabled}
      isRecording={meeting.isRecording}
      isHost={meeting.createdBy === user?.id}
      audioOutputId={audioOutputId}
      remoteStreams={sfu.remoteStreams}
      participants={sfu.participants}
      onLeave={handleLeave}
      onEnd={meeting.createdBy === user?.id ? handleEnd : undefined}
      onToggleAudio={sfu.toggleAudio}
      onToggleVideo={sfu.toggleVideo}
      onToggleScreenShare={handleToggleScreenShare}
    />
  );
}
