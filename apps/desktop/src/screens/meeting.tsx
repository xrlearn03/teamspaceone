import { useEffect, useState } from "react";
import { Video, Loader2 } from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import { MeetingLobby } from "../components/livekit/lobby";
import { NativeConference } from "../components/native-conference";
import { Button } from "../components/ui/button";
import { useRealtime } from "../hooks/useRealtime";
import { useNativeCamera } from "../hooks/useNativeCamera";
import { useNativeMicrophone } from "../hooks/useNativeMicrophone";
import {
  endMeeting,
  getMeeting,
  leaveMeeting,
  startMeeting,
  type Meeting,
} from "../lib/api";
import { useMe } from "../hooks/api";

export interface MediaJoinOptions {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioInputId?: string;
  videoInputId?: string;
  audioOutputId?: string;
  stream?: MediaStream;
}

export function MeetingScreen() {
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

  const {
    devices: nativeCameras,
    selectedIndex: nativeCameraIndex,
    setSelectedIndex: setNativeCamera,
    frame: nativeFrame,
    error: nativeError,
    enabled: nativeVideoEnabled,
    setEnabled: setNativeVideoEnabled,
    videoStream: nativeVideoStream,
  } = useNativeCamera();

  const {
    devices: nativeMicrophones,
    selectedIndex: nativeMicrophoneIndex,
    setSelectedIndex: setNativeMicrophone,
    enabled: nativeAudioEnabled,
    setEnabled: setNativeAudioEnabled,
    audioStream: nativeAudioStream,
    error: nativeAudioError,
    resumeContext: resumeNativeAudio,
  } = useNativeMicrophone();

  useEffect(() => {
    return () => {
      mediaOptions?.stream?.getTracks().forEach((track) => track.stop());
    };
  }, [mediaOptions]);

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
        let m = await getMeeting(activeMeetingId!);
        if (m.status === "scheduled") {
          try {
            m = await startMeeting(activeMeetingId!);
          } catch {
            m = await getMeeting(activeMeetingId!);
          }
        }
        if (m.status === "ended") {
          throw new Error("Meeting has ended");
        }
        if (!cancelled) {
          setMeeting(m);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load meeting");
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

    // Resume the AudioContext from the user gesture and combine native audio
    // (ScriptProcessorNode) with native canvas-captured video.
    await resumeNativeAudio();
    const combined = new MediaStream([
      ...(opts.audioEnabled && nativeAudioStream ? nativeAudioStream.getAudioTracks() : []),
      ...(opts.videoEnabled && nativeVideoStream ? nativeVideoStream.getVideoTracks() : []),
    ]);
    const full: MediaJoinOptions = {
      ...opts,
      audioEnabled: opts.audioEnabled && !!nativeAudioStream,
      videoEnabled: opts.videoEnabled && !!nativeVideoStream,
      audioInputId: String(nativeMicrophoneIndex ?? ""),
      videoInputId: String(nativeCameraIndex ?? ""),
      stream: combined,
    };
    setMediaOptions(full);
    setToken("native");
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

  function handleToggleAudio() {
    if (!mediaOptions) return;
    const next = !mediaOptions.audioEnabled;
    setMediaOptions((prev) => (prev ? { ...prev, audioEnabled: next } : prev));
    setNativeAudioEnabled(next);
  }

  function handleToggleVideo() {
    if (!mediaOptions) return;
    const next = !mediaOptions.videoEnabled;
    setMediaOptions((prev) => (prev ? { ...prev, videoEnabled: next } : prev));
    setNativeVideoEnabled(next);
  }

  if (!activeMeetingId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-text-secondary">
        <Video className="h-12 w-12 text-text-muted" />
        <p className="text-sm">Select a meeting from the sidebar to join.</p>
      </div>
    );
  }

  if (loading && !meeting) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-2 text-sm">Loading meeting...</p>
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
        nativeFrame={nativeFrame}
        nativeError={nativeError}
        nativeDevices={nativeCameras}
        nativeCameraIndex={nativeCameraIndex}
        setNativeCamera={setNativeCamera}
        nativeVideoEnabled={nativeVideoEnabled}
        setNativeVideoEnabled={setNativeVideoEnabled}
        nativeAudioDevices={nativeMicrophones}
        nativeAudioIndex={nativeMicrophoneIndex}
        setNativeAudio={setNativeMicrophone}
        nativeAudioEnabled={nativeAudioEnabled}
        setNativeAudioEnabled={setNativeAudioEnabled}
        nativeAudioError={nativeAudioError}
      />
    );
  }

  return (
    <NativeConference
      user={user}
      title={meeting.title}
      meetingId={meeting.id}
      nativeFrame={nativeFrame}
      recordingStream={mediaOptions.stream}
      localVideoEnabled={mediaOptions.videoEnabled}
      localAudioEnabled={mediaOptions.audioEnabled}
      isRecording={meeting.isRecording}
      onLeave={handleLeave}
      onEnd={meeting.createdBy === user?.id ? handleEnd : undefined}
      onToggleAudio={handleToggleAudio}
      onToggleVideo={handleToggleVideo}
    />
  );
}
