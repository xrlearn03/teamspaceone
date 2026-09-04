import { useEffect, useRef, useState, useCallback } from "react";
import { Room, RoomEvent, type RemoteParticipant, type Room as LKRoom, Track } from "livekit-client";
import { getCurrentWindow } from "@tauri-apps/api/window";

async function focusTauriWindow(): Promise<void> {
  try {
    await getCurrentWindow().setFocus();
  } catch {
    // Not running inside Tauri; ignore.
  }
}

export interface UseLiveKitOptions {
  url: string;
  token: string;
  roomName: string;
  displayName?: string;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  audioInputId?: string;
  videoInputId?: string;
  audioOutputId?: string;
  previewStream?: MediaStream;
  rtcConfig?: RTCConfiguration;
}

export interface ChatMessage {
  id: string;
  senderName: string;
  content: string;
  timestamp: number;
  isLocal: boolean;
}

export interface Reaction {
  id: string;
  emoji: string;
  senderName: string;
  timestamp: number;
}

type MeetingData =
  | { type: "chat"; content: string; senderName: string; timestamp: number }
  | { type: "reaction"; emoji: string; senderName: string; timestamp: number }
  | { type: "raise_hand"; identity: string; raised: boolean }
  | { type: "recording"; recording: boolean };

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)),
  ]);
}

function createSilentWavUrl(): string {
  const sampleRate = 8000;
  const seconds = 2;
  const samples = sampleRate * seconds;
  const headerSize = 44;
  const buffer = new ArrayBuffer(headerSize + samples);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeString(36, "data");
  view.setUint32(40, samples, true);
  const blob = new Blob([buffer], { type: "audio/wav" });
  return URL.createObjectURL(blob);
}

function startKeepAliveAudio(): HTMLAudioElement | null {
  try {
    const audio = new Audio();
    audio.src = createSilentWavUrl();
    audio.loop = true;
    audio.muted = true;
    audio.play().catch(() => {});
    return audio;
  } catch {
    return null;
  }
}

function getMediaErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === "NotAllowedError") {
      return "Camera/microphone access was denied. Allow it in System Settings > Privacy & Security.";
    }
    if (err.name === "NotReadableError") {
      if (/permission|denied|system/i.test(err.message)) {
        return "macOS blocked camera/microphone. Allow Teamspace One in System Settings > Privacy & Security > Camera/Microphone.";
      }
      return "Camera or microphone is already in use by another app. Close other apps and try again.";
    }
    if (err.name === "OverconstrainedError") {
      return "The selected camera/microphone is unavailable.";
    }
    if (err.name === "NotFoundError") {
      return "No camera or microphone was found.";
    }
  }
  const message = err instanceof Error ? err.message : String(err);
  if (/permission|denied|system/i.test(message)) {
    return "macOS blocked camera/microphone. Allow Teamspace One in System Settings > Privacy & Security > Camera/Microphone.";
  }
  return message;
}

function encodeData(data: MeetingData): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(data)) as Uint8Array<ArrayBuffer>;
}

function decodeData(payload: Uint8Array): MeetingData | null {
  try {
    return JSON.parse(decoder.decode(payload)) as MeetingData;
  } catch {
    return null;
  }
}

export function useLiveKit({
  url,
  token,
  displayName,
  audioEnabled = true,
  videoEnabled = true,
  audioInputId,
  videoInputId,
  audioOutputId,
  previewStream,
  rtcConfig,
}: UseLiveKitOptions) {
  const roomRef = useRef<LKRoom | null>(null);
  const [connectionState, setConnectionState] = useState<"disconnected" | "connecting" | "connected" | "reconnecting">("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [localAudioEnabled, setLocalAudioEnabled] = useState(false);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(false);
  const [localScreenShare, setLocalScreenShare] = useState(false);
  const [localTrackVersion, setLocalTrackVersion] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [raiseHands, setRaiseHands] = useState<Set<string>>(new Set());
  const [isRecording, setIsRecording] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const localName = displayName ?? "You";

  useEffect(() => {
    if (!url || !token) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      disconnectOnPageLeave: false,
      audioCaptureDefaults: audioInputId ? { deviceId: { ideal: audioInputId } } : undefined,
      videoCaptureDefaults: videoInputId ? { deviceId: { ideal: videoInputId } } : undefined,
      audioOutput: audioOutputId ? { deviceId: audioOutputId } : undefined,
    });
    roomRef.current = room;

    function updateParticipants() {
      setRemoteParticipants(Array.from(room.remoteParticipants.values()));
      setLocalTrackVersion((v) => v + 1);
    }

    function updateLocalParticipant() {
      setLocalTrackVersion((v) => v + 1);
    }

    room.on(RoomEvent.Connected, () => {
      setConnectionState("connected");
      updateParticipants();
      updateLocalParticipant();
    });
    room.on(RoomEvent.Disconnected, () => setConnectionState("disconnected"));
    room.on(RoomEvent.Reconnecting, () => setConnectionState("reconnecting"));
    room.on(RoomEvent.ParticipantConnected, updateParticipants);
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      updateParticipants();
      setRaiseHands((current) => {
        const next = new Set(current);
        next.delete(participant.identity);
        return next;
      });
    });
    room.on(RoomEvent.TrackSubscribed, updateParticipants);
    room.on(RoomEvent.TrackUnsubscribed, updateParticipants);
    room.on(RoomEvent.LocalTrackPublished, () => {
      updateParticipants();
      updateLocalParticipant();
    });
    room.on(RoomEvent.LocalTrackUnpublished, () => {
      updateParticipants();
      updateLocalParticipant();
    });

    room.on(RoomEvent.DataReceived, (payload, _participant) => {
      const data = decodeData(payload);
      if (!data) return;

      switch (data.type) {
        case "chat": {
          setChatMessages((prev) => [
            ...prev,
            {
              id: `${data.timestamp}-${prev.length}`,
              senderName: data.senderName,
              content: data.content,
              timestamp: data.timestamp,
              isLocal: false,
            },
          ]);
          break;
        }
        case "reaction": {
          const reactionTimestamp = data.timestamp;
          setReactions((prev) => [
            ...prev,
            {
              id: `${reactionTimestamp}-${prev.length}`,
              emoji: data.emoji,
              senderName: data.senderName,
              timestamp: reactionTimestamp,
            },
          ]);
          setTimeout(() => {
            setReactions((prev) => prev.filter((r) => r.timestamp !== reactionTimestamp));
          }, 2000);
          break;
        }
        case "raise_hand": {
          setRaiseHands((current) => {
            const next = new Set(current);
            if (data.raised) next.add(data.identity);
            else next.delete(data.identity);
            return next;
          });
          break;
        }
        case "recording": {
          setIsRecording(data.recording);
          break;
        }
      }
    });

    setConnectionState("connecting");
    setError(null);
    setChatMessages([]);
    setReactions([]);
    setRaiseHands(new Set());
    setIsRecording(false);
    setLocalTrackVersion(0);
    setLocalAudioEnabled(audioEnabled);
    setLocalVideoEnabled(videoEnabled);

    // Keep a silent audio loop playing while in a meeting. This tells the webview
    // the page is "active" and reduces WKWebView throttling when the window is not focused.
    const keepAlive = startKeepAliveAudio();

    room
      .connect(url, token, { rtcConfig })
      .then(async () => {
        let micPublished = false;
        let camPublished = false;

        if (previewStream) {
          const audioTrack = previewStream.getAudioTracks()[0];
          const videoTrack = previewStream.getVideoTracks()[0];
          if (audioEnabled && audioTrack && audioTrack.readyState === "live") {
            try {
              await withTimeout(
                room.localParticipant.publishTrack(audioTrack, { name: "microphone", source: Track.Source.Microphone }),
                8000,
                "Publish microphone",
              );
              micPublished = true;
            } catch (err) {
              console.warn("Failed to publish preview microphone:", err);
            }
          }
          if (videoEnabled && videoTrack && videoTrack.readyState === "live") {
            try {
              await withTimeout(
                room.localParticipant.publishTrack(videoTrack, { name: "camera", source: Track.Source.Camera }),
                8000,
                "Publish camera",
              );
              camPublished = true;
            } catch (err) {
              console.warn("Failed to publish preview camera:", err);
            }
          }
        }

        // If the preview tracks were not published (or the user turned them off in the lobby),
        // let LiveKit acquire fresh tracks. Use ideal constraints so a busy preferred device
        // can fall back to the system default instead of throwing NotReadableError.
        // Stop the unused preview tracks first and wait a moment so the OS releases the device.
        const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

        setMediaError(null);

        if (audioEnabled && !micPublished) {
          try {
            previewStream?.getAudioTracks().forEach((t) => t.stop());
            await sleep(1000);
            // WKWebView can hang getUserMedia if the window is not the key window.
            // Force focus before asking for the microphone.
            await focusTauriWindow();
            await withTimeout(room.localParticipant.setMicrophoneEnabled(true), 8000, "Enable microphone");
          } catch (err) {
            setMediaError(getMediaErrorMessage(err));
            console.warn("Failed to enable microphone:", err);
          }
        }
        if (videoEnabled && !camPublished) {
          try {
            previewStream?.getVideoTracks().forEach((t) => t.stop());
            await sleep(1000);
            await focusTauriWindow();
            await withTimeout(room.localParticipant.setCameraEnabled(true), 8000, "Enable camera");
          } catch (err) {
            const message = getMediaErrorMessage(err);
            setMediaError((prev) => (prev ? `${prev}; ${message}` : message));
            console.warn("Failed to enable camera:", err);
          }
        }
        if (!audioEnabled) {
          previewStream?.getAudioTracks().forEach((t) => t.stop());
          await room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        }
        if (!videoEnabled) {
          previewStream?.getVideoTracks().forEach((t) => t.stop());
          await room.localParticipant.setCameraEnabled(false).catch(() => {});
        }

        setLocalAudioEnabled(audioEnabled && (micPublished || room.localParticipant.isMicrophoneEnabled));
        setLocalVideoEnabled(videoEnabled && (camPublished || room.localParticipant.isCameraEnabled));
        updateLocalParticipant();
      })
      .catch((err) => setError(err as Error));

    return () => {
      room.disconnect().catch(() => {});
      roomRef.current = null;
      keepAlive?.pause();
      if (keepAlive?.src) {
        URL.revokeObjectURL(keepAlive.src);
      }
    };
  }, [url, token, audioEnabled, videoEnabled, audioInputId, videoInputId, audioOutputId, previewStream, rtcConfig]);

  function isRetryableMediaError(err: unknown): boolean {
    if (err instanceof DOMException) {
      if (err.name === "NotAllowedError") return false;
      return err.name === "NotReadableError" || err.name === "OverconstrainedError" || err.name === "AbortError";
    }
    const message = err instanceof Error ? err.message : String(err);
    if (/permission|denied|system/i.test(message)) return false;
    return message.includes("NotReadable") || message.includes("Overconstrained") || message.includes("timed out");
  }

  async function tryToggle(
    action: () => Promise<unknown>,
    label: string,
  ): Promise<void> {
    try {
      await withTimeout(action(), 8000, label);
      setMediaError(null);
    } catch (err) {
      if (isRetryableMediaError(err)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        try {
          await withTimeout(action(), 8000, `${label} retry`);
          setMediaError(null);
        } catch (err2) {
          const message = getMediaErrorMessage(err2);
          setMediaError(`${label}: ${message}`);
          console.warn(`Failed to ${label.toLowerCase()} after retry:`, err2);
        }
      } else {
        const message = getMediaErrorMessage(err);
        setMediaError(`${label}: ${message}`);
        console.warn(`Failed to ${label.toLowerCase()}:`, err);
      }
    }
  }

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !room.localParticipant.isMicrophoneEnabled;
    await tryToggle(() => room.localParticipant.setMicrophoneEnabled(enabled), "Microphone");
    setLocalAudioEnabled(room.localParticipant.isMicrophoneEnabled);
    setLocalTrackVersion((v) => v + 1);
  }, []);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !room.localParticipant.isCameraEnabled;
    await tryToggle(() => room.localParticipant.setCameraEnabled(enabled), "Camera");
    setLocalVideoEnabled(room.localParticipant.isCameraEnabled);
    setLocalTrackVersion((v) => v + 1);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !room.localParticipant.isScreenShareEnabled;
    await room.localParticipant.setScreenShareEnabled(enabled);
    setLocalScreenShare(enabled);
  }, []);

  const sendChatMessage = useCallback(
    (content: string) => {
      const room = roomRef.current;
      if (!room) return;
      const timestamp = Date.now();
      const data: MeetingData = { type: "chat", content, senderName: localName, timestamp };
      setChatMessages((prev) => [
        ...prev,
        { id: `${timestamp}-${prev.length}`, senderName: localName, content, timestamp, isLocal: true },
      ]);
      void room.localParticipant.publishData(encodeData(data), { reliable: true });
    },
    [localName],
  );

  const sendReaction = useCallback(
    (emoji: string) => {
      const room = roomRef.current;
      if (!room) return;
      const timestamp = Date.now();
      const data: MeetingData = { type: "reaction", emoji, senderName: localName, timestamp };
      setReactions((prev) => [
        ...prev,
        { id: `${timestamp}-${prev.length}`, emoji, senderName: localName, timestamp },
      ]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.timestamp !== timestamp));
      }, 2000);
      void room.localParticipant.publishData(encodeData(data), { reliable: false });
    },
    [localName],
  );

  const sendRaiseHand = useCallback(
    (raised: boolean) => {
      const room = roomRef.current;
      if (!room) return;
      const identity = room.localParticipant.identity;
      const data: MeetingData = { type: "raise_hand", identity, raised };
      setRaiseHands((current) => {
        const next = new Set(current);
        if (raised) next.add(identity);
        else next.delete(identity);
        return next;
      });
      void room.localParticipant.publishData(encodeData(data), { reliable: true });
    },
    [],
  );

  const setRecording = useCallback(
    (recording: boolean) => {
      const room = roomRef.current;
      if (!room) return;
      const data: MeetingData = { type: "recording", recording };
      setIsRecording(recording);
      void room.localParticipant.publishData(encodeData(data), { reliable: true });
    },
    [],
  );

  const leave = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    await room.disconnect();
    roomRef.current = null;
  }, []);

  return {
    room: roomRef.current,
    connectionState,
    error,
    remoteParticipants,
    localAudioEnabled,
    localVideoEnabled,
    localScreenShare,
    localTrackVersion,
    mediaError,
    chatMessages,
    reactions,
    raiseHands,
    isRecording,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    sendChatMessage,
    sendReaction,
    sendRaiseHand,
    setRecording,
    leave,
  };
}
