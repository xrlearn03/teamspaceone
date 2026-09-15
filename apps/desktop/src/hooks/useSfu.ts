import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";
import { getSfuToken } from "../lib/api";
import { toast } from "../lib/toast";

export interface SfuParticipant {
  id: string;
  displayName: string;
  userId?: string;
}

export interface SfuRemoteStream {
  participantId: string;
  stream: MediaStream;
}

interface MediaOptions {
  audioEnabled: boolean;
  videoEnabled: boolean;
  audioInputId?: string;
  /** Native (cpal) device name — matched against enumerateDevices labels. */
  audioInputLabel?: string;
  videoInputId?: string;
  audioOutputId?: string;
  stream?: MediaStream;
}

interface Signal {
  type:
    | "connected"
    | "room_state"
    | "participant_joined"
    | "participant_left"
    | "offer"
    | "answer"
    | "ice"
    | "error"
    | "room_event";
  participant_id?: string;
  room_id?: string;
  participants?: { id: string; display_name: string; user_id?: string }[];
  display_name?: string;
  user_id?: string;
  from?: string;
  sdp?: string;
  candidate?: string;
  sdp_m_line_index?: number;
  sdp_mid?: string;
  message?: string;
  data?: unknown;
}

type SendSignal =
  | { type: "join"; room_id: string; display_name: string; user_id?: string; token: string }
  | { type: "offer"; target: string; sdp: string }
  | { type: "answer"; target: string; sdp: string }
  | {
      type: "ice";
      target: string;
      candidate: string;
      sdp_m_line_index: number;
      sdp_mid?: string;
    }
  | { type: "room_event"; data: unknown };

export interface SfuRoomEvent {
  from: string;
  displayName: string;
  userId?: string;
  data: unknown;
}

const SFU_URL =
  (import.meta.env.VITE_SFU_URL as string | undefined) ?? "ws://127.0.0.1:8443";
const STUN_SERVER =
  (import.meta.env.VITE_STUN_SERVER_URL as string | undefined) ??
  "stun:stun.l.google.com:19302";
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000];

function normalizeIceServers(input: unknown): RTCIceServer[] {
  if (!Array.isArray(input)) {
    console.warn("VITE_ICE_SERVERS is not an array; falling back to STUN");
    return [{ urls: [STUN_SERVER] }];
  }

  return input
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => {
      const urls = Array.isArray(entry.urls)
        ? entry.urls.filter((u): u is string => typeof u === "string")
        : typeof entry.urls === "string"
          ? [entry.urls]
          : [STUN_SERVER];
      const server: RTCIceServer = { urls };
      if (typeof entry.username === "string") server.username = entry.username;
      if (typeof entry.credential === "string") server.credential = entry.credential;
      return server;
    })
    .filter((entry) => entry.urls.length > 0);
}

function getIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined;
  if (raw) {
    try {
      return normalizeIceServers(JSON.parse(raw));
    } catch {
      console.warn("VITE_ICE_SERVERS is not valid JSON; falling back to STUN");
    }
  }
  return [{ urls: [STUN_SERVER] }];
}

export function useSfu() {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenShareModeRef = useRef<"browser" | "native" | null>(null);
  const screenShareSenderRef = useRef<RTCRtpSender | null>(null);
  const nativeUnlistenRef = useRef<(() => void) | null>(null);
  const nativeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const trackIdToParticipantRef = useRef<Record<string, string>>({});
  const roomEventHandlersRef = useRef<Set<(event: SfuRoomEvent) => void>>(new Set());
  // Serializes every signaling op (remote offers/answers, local offers) so two
  // overlapping negotiations can't interleave setRemote/setLocal calls — that
  // race produced "no pending remote description" crashes.
  const signalQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Set when we have local changes to negotiate while a negotiation is already
  // in flight (e.g. an SFU re-offer arrived first). Re-offered once stable.
  const pendingLocalOfferRef = useRef(false);

  const isIntentionalLeaveRef = useRef(false);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const lastJoinArgsRef = useRef<{
    roomId: string;
    displayName: string;
    mediaOptions: MediaOptions;
    userId?: string;
    sfuToken?: string;
  } | null>(null);

  const isTauri = typeof (window as typeof window & { __TAURI_INTERNALS__?: unknown })?.__TAURI_INTERNALS__ !== "undefined";
  // getUserMedia/getDisplayMedia throw "The operation is insecure" outside a
  // secure context (the Tauri WKWebView, plain-http origins, etc.) and are
  // absent entirely on some webviews — never call them there.
  const canUseMediaDevices =
    !isTauri &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    window.isSecureContext !== false;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<SfuRemoteStream[]>([]);
  const [participants, setParticipants] = useState<SfuParticipant[]>([]);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [localAudioEnabled, setLocalAudioEnabled] = useState(false);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);

  interface QualityStats {
    audio: { packetsLost: number; jitter: number; bitrate: number };
    video: { packetsLost: number; jitter: number; bitrate: number };
    rtt?: number;
    timestamp: number;
  }
  const [qualityStats, setQualityStats] = useState<QualityStats | null>(null);
  const lastStatsRef = useRef<Record<string, { bytes: number; timestamp: number }>>({});

  useEffect(() => {
    if (!connected) return;
    const pc = pcRef.current;
    if (!pc) return;

    const update = async () => {
      try {
        const report = await pc.getStats();
        const next: Record<string, { bytes: number; timestamp: number }> = {};
        const audio = { packetsLost: 0, jitter: 0, bitrate: 0 };
        const video = { packetsLost: 0, jitter: 0, bitrate: 0 };
        let rtt: number | undefined;

        for (const stat of Array.from(report.values())) {
          const s = stat as Record<string, unknown>;

          if (s.type === "candidate-pair" && s.nominated === true && typeof s.currentRoundTripTime === "number") {
            rtt = s.currentRoundTripTime * 1000;
          }

          if (s.type === "inbound-rtp" && s.kind === "audio") {
            audio.packetsLost = typeof s.packetsLost === "number" ? s.packetsLost : 0;
            audio.jitter = typeof s.jitter === "number" ? s.jitter : 0;
            const id = String(s.id);
            const bytes = (typeof s.bytesReceived === "number" ? s.bytesReceived : 0) as number;
            const ts = (typeof s.timestamp === "number" ? s.timestamp : 0) as number;
            const last = lastStatsRef.current[id];
            if (last && ts > last.timestamp) {
              const delta = bytes - last.bytes;
              audio.bitrate = Math.round((delta * 8 * 1000) / (ts - last.timestamp));
            }
            next[id] = { bytes, timestamp: ts };
          }

          if (s.type === "inbound-rtp" && s.kind === "video") {
            video.packetsLost = typeof s.packetsLost === "number" ? s.packetsLost : 0;
            video.jitter = typeof s.jitter === "number" ? s.jitter : 0;
            const id = String(s.id);
            const bytes = (typeof s.bytesReceived === "number" ? s.bytesReceived : 0) as number;
            const ts = (typeof s.timestamp === "number" ? s.timestamp : 0) as number;
            const last = lastStatsRef.current[id];
            if (last && ts > last.timestamp) {
              const delta = bytes - last.bytes;
              video.bitrate = Math.round((delta * 8 * 1000) / (ts - last.timestamp));
            }
            next[id] = { bytes, timestamp: ts };
          }
        }

        lastStatsRef.current = next;
        setQualityStats({ audio, video, rtt, timestamp: Date.now() });
      } catch {
        // Stats may fail briefly during reconnects; ignore.
      }
    };

    update();
    const id = window.setInterval(update, 5000);
    return () => window.clearInterval(id);
  }, [connected]);

  // Active speaker detection: poll remote audio receivers for
  // synchronization source audio levels and pick the loudest speaker.
  useEffect(() => {
    if (!connected) return;
    const pc = pcRef.current;
    if (!pc) return;

    const detect = () => {
      let loudestId: string | null = null;
      let loudestLevel = 0;
      const threshold = 0.15;

      for (const receiver of pc.getReceivers()) {
        if (receiver.track?.kind !== "audio") continue;
        const participantId = receiver.track
          ? trackIdToParticipantRef.current[receiver.track.id]
          : undefined;
        if (!participantId) continue;

        const sources = receiver.getSynchronizationSources();
        for (const source of sources) {
          const level = (source as { audioLevel?: number }).audioLevel ?? 0;
          if (level > threshold && level > loudestLevel) {
            loudestLevel = level;
            loudestId = participantId;
          }
        }
      }

      setActiveSpeakerId(loudestId);
    };

    detect();
    const id = window.setInterval(detect, 1000);
    return () => window.clearInterval(id);
  }, [connected]);

  function send(msg: SendSignal) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  function enqueueSignal(fn: () => Promise<void>) {
    signalQueueRef.current = signalQueueRef.current
      .then(fn)
      .catch((err) => console.error("SFU signaling op failed", err));
  }

  function makeLocalOffer(pc: RTCPeerConnection) {
    enqueueSignal(async () => {
      if (pc.signalingState !== "stable") {
        pendingLocalOfferRef.current = true;
        return;
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      send({ type: "offer", target: "sfu", sdp: offer.sdp! });
    });
  }

  const stopScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    const screen = screenStreamRef.current;
    if (screen) {
      screen.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    if (screenShareModeRef.current === "native") {
      nativeUnlistenRef.current?.();
      nativeUnlistenRef.current = null;
      nativeCanvasRef.current = null;
      try {
        await invoke("stop-screen-share");
      } catch {
        // Best-effort cleanup.
      }
    }
    screenShareModeRef.current = null;

    if (pc && pc.connectionState !== "closed" && screenShareSenderRef.current) {
      try {
        pc.removeTrack(screenShareSenderRef.current);
      } catch (err) {
        console.error("Failed to remove screen share track", err);
      }
    }
    screenShareSenderRef.current = null;

    const camera = cameraStreamRef.current;
    const cameraTrack = camera?.getVideoTracks()[0];

    const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
    const preview = cameraTrack
      ? new MediaStream([cameraTrack, ...audioTracks])
      : (camera ?? null);
    localStreamRef.current = preview;
    setLocalStream(preview);

    setScreenShareEnabled(false);
    setLocalVideoEnabled(cameraTrack?.enabled ?? false);
  }, []);

  const startNativeScreenShare = useCallback(async () => {
    if (!isTauri) {
      throw new Error("Native screen share is only available in the desktop app");
    }

    await invoke("start-screen-share");

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    nativeCanvasRef.current = canvas;

    const stream = canvas.captureStream(15);
    const track = stream.getVideoTracks()[0];
    track.onended = () => {
      void stopScreenShare();
    };

    const unlisten = await listen<string>("screen-frame", (event: Event<string>) => {
      const payload = event.payload;
      const img = new Image();
      img.onload = () => {
        if (canvas.width !== img.width || canvas.height !== img.height) {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0);
      };
      img.onerror = () => {};
      img.src = payload;
    });

    nativeUnlistenRef.current = unlisten;
    screenShareModeRef.current = "native";
    return { stream, track };
  }, [stopScreenShare]);

  const startScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];

    // Try the browser getDisplayMedia path first (works in secure-context
    // browsers and may work in future Tauri versions).
    if (
      canUseMediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === "function"
    ) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screen.getVideoTracks()[0];
        if (!screenTrack) return;

        screenTrack.onended = () => {
          void stopScreenShare();
        };

        const sender = pc.addTrack(screenTrack, new MediaStream([screenTrack]));
        screenShareSenderRef.current = sender;

        const preview = new MediaStream([screenTrack, ...audioTracks]);
        localStreamRef.current = preview;
        setLocalStream(preview);

        screenStreamRef.current = screen;
        screenShareModeRef.current = "browser";
        setScreenShareEnabled(true);
        setLocalVideoEnabled(true);
        return;
      } catch {
        // getDisplayMedia denied or not supported in this webview; fall through
        // to the native Tauri screen capture fallback.
      }
    }

    try {
      const { stream, track } = await startNativeScreenShare();

      const sender = pc.addTrack(track, new MediaStream([track]));
      screenShareSenderRef.current = sender;

      const preview = new MediaStream([track, ...audioTracks]);
      localStreamRef.current = preview;
      setLocalStream(preview);

      screenStreamRef.current = stream;
      setScreenShareEnabled(true);
      setLocalVideoEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screen share failed");
    }
  }, [startNativeScreenShare, stopScreenShare]);

  const toggleScreenShare = useCallback(async () => {
    if (screenShareEnabled) {
      await stopScreenShare();
    } else {
      await startScreenShare();
    }
  }, [screenShareEnabled, startScreenShare, stopScreenShare]);

  const toggleAudio = useCallback(async () => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) {
      const pc = pcRef.current;
      const canGetMic =
        typeof navigator !== "undefined" &&
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        window.isSecureContext !== false;
      if (pc && canGetMic) {
        try {
          // Joined muted — acquire the mic now. The getUserMedia track carries
          // WebKit's echo cancellation, unlike the raw native capture.
          const mic = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          const audioTrack = mic.getAudioTracks()[0];
          if (audioTrack) {
            const sender = pc
              .getTransceivers()
              .find((tr) => tr.receiver.track.kind === "audio")?.sender;
            if (sender) {
              await sender.replaceTrack(audioTrack);
            } else {
              pc.addTrack(audioTrack, localStreamRef.current ?? new MediaStream());
            }
            const merged = new MediaStream([
              audioTrack,
              ...(localStreamRef.current?.getVideoTracks() ?? []),
            ]);
            cameraStreamRef.current = merged;
            localStreamRef.current = merged;
            setLocalStream(merged);
            setLocalAudioEnabled(true);
            return;
          }
        } catch {
          // Fall through to the toast below.
        }
      }
      toast.error(
        isTauri
          ? "Microphone is off. Enable it before joining or check mic permissions."
          : "Microphone capture needs a secure (HTTPS) context or permission.",
      );
      return;
    }
    track.enabled = !track.enabled;
    setLocalAudioEnabled(track.enabled);
  }, [isTauri]);

  const toggleVideo = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    // The first video transceiver is the camera. Screen share, if active, is on
    // a separate transceiver added later.
    const videoSender = pc
      .getTransceivers()
      .find((tr) => tr.receiver.track.kind === "video")?.sender;
    if (!videoSender) return;

    const currentVideoTrack = videoSender.track;
    if (currentVideoTrack) {
      // Mute/unmute the existing camera track (e.g. a native-captured stream)
      // instead of replacing it with a browser one.
      currentVideoTrack.enabled = !currentVideoTrack.enabled;
      setLocalVideoEnabled(currentVideoTrack.enabled);
      return;
    }

    if (!canUseMediaDevices) {
      // getUserMedia is unavailable/insecure here — camera is captured
      // natively before joining, so there is nothing to attach mid-call.
      // (Toast, not setError: a recoverable toggle shouldn't replace the call UI.)
      toast.error(
        isTauri
          ? "Camera is off. Enable it before joining or check camera permissions."
          : "Camera capture needs a secure (HTTPS) context or permission.",
      );
      return;
    }

    const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
    const screenTrack = screenShareEnabled
      ? (localStreamRef.current?.getVideoTracks()[0] ?? null)
      : null;

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newTrack = videoStream.getVideoTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = true;
      await videoSender.replaceTrack(newTrack);
      const preview = screenTrack
        ? new MediaStream([newTrack, screenTrack, ...audioTracks])
        : new MediaStream([...audioTracks, newTrack]);
      cameraStreamRef.current = new MediaStream([...audioTracks, newTrack]);
      localStreamRef.current = preview;
      setLocalStream(preview);
      setLocalVideoEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access camera");
    }
  }, [screenShareEnabled]);

  const leave = useCallback(async () => {
    isIntentionalLeaveRef.current = true;
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    await stopScreenShare();

    pcRef.current?.close();
    pcRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    setRemoteStreams([]);
    setParticipants([]);
    setMyParticipantId(null);
    setConnected(false);
    setError(null);
    setLocalAudioEnabled(false);
    setLocalVideoEnabled(false);
    setScreenShareEnabled(false);
  }, [stopScreenShare]);

  const join = useCallback(
    async (
      roomId: string,
      displayName: string,
      mediaOptions: MediaOptions,
      userId?: string,
      sfuTokenOverride?: string,
    ) => {
      await leave();
      setError(null);

      isIntentionalLeaveRef.current = false;
      reconnectTimerRef.current = null;
      lastJoinArgsRef.current = { roomId, displayName, mediaOptions, userId, sfuToken: sfuTokenOverride };

      let stream: MediaStream | null = mediaOptions.stream ?? null;

      // In the Tauri webview on a secure origin (http://localhost release or
      // the Vite dev server), prefer the browser microphone: wry grants
      // capture permission automatically and WebKit's getUserMedia applies
      // echo cancellation/noise suppression. The native cpal capture has no
      // AEC, so speaker output bleeds back into the mic and remote
      // participants hear themselves repeated. If getUserMedia fails here the
      // native track is kept as the fallback.
      if (
        isTauri &&
        window.isSecureContext &&
        typeof navigator.mediaDevices?.getUserMedia === "function" &&
        ((stream?.getAudioTracks().length ?? 0) > 0 || mediaOptions.audioEnabled)
      ) {
        try {
          let audioInputId: string | undefined = mediaOptions.audioInputId;
          if (!audioInputId && mediaOptions.audioInputLabel) {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const match = devices.find(
              (d) => d.kind === "audioinput" && d.label === mediaOptions.audioInputLabel,
            );
            audioInputId = match?.deviceId;
          }
          const mic = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: audioInputId ? { exact: audioInputId } : undefined,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          const audioTrack = mic.getAudioTracks()[0];
          if (audioTrack) {
            stream?.getAudioTracks().forEach((t) => t.stop());
            stream = new MediaStream([audioTrack, ...(stream?.getVideoTracks() ?? [])]);
            // The browser mic replaced the native one — stop the cpal capture
            // so it doesn't hold the device and burn CPU polling chunks.
            void invoke("stop-microphone").catch(() => {});
          }
        } catch {
          // Browser capture still unavailable in this webview — keep the
          // native track (echo risk, but the call works).
        }
      }

      if ((!stream || stream.getTracks().length === 0) && canUseMediaDevices) {
        // Secure-context browsers only — the Tauri webview (WKWebView) has no
        // usable getUserMedia ("The operation is insecure"); the desktop app
        // captures natively and passes the stream in via mediaOptions.stream.
        const audioConstraints: MediaTrackConstraints = {
          deviceId: mediaOptions.audioInputId ? { exact: mediaOptions.audioInputId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };
        const videoConstraints: boolean | MediaTrackConstraints = mediaOptions.videoEnabled
          ? (mediaOptions.videoInputId ? { deviceId: { exact: mediaOptions.videoInputId } } : true)
          : false;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: videoConstraints,
          });
        } catch {
          try {
            // Fall back to audio-only with the default microphone if the selected
            // camera or device is unavailable or disabled.
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not access camera/mic");
            throw err;
          }
        }
      }
      if (stream && mediaOptions.videoEnabled && stream.getVideoTracks().length === 0 && canUseMediaDevices) {
        try {
          const camera = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: mediaOptions.videoInputId ? { deviceId: { exact: mediaOptions.videoInputId } } : true,
          });
          const videoTrack = camera.getVideoTracks()[0];
          if (videoTrack) stream.addTrack(videoTrack);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not access camera");
        }
      }
      // No captured tracks (Tauri permission denied, or browser in an insecure
      // context) — join anyway with an empty stream so the user can still
      // watch/listen.
      if (!stream || stream.getTracks().length === 0) {
        if (mediaOptions.audioEnabled || mediaOptions.videoEnabled) {
          toast.error(
            isTauri
              ? "Joined without camera/microphone — check permissions in System Settings > Privacy & Security."
              : "Joined without camera/microphone — media capture needs a secure (HTTPS) context or permission.",
          );
        }
        stream = new MediaStream();
      }

      stream.getAudioTracks().forEach((t) => {
        t.enabled = mediaOptions.audioEnabled;
      });
      stream.getVideoTracks().forEach((t) => {
        t.enabled = mediaOptions.videoEnabled;
      });

      cameraStreamRef.current = stream;
      localStreamRef.current = stream;
      setLocalStream(stream);
      setLocalAudioEnabled(stream.getAudioTracks()[0]?.enabled ?? false);
      setLocalVideoEnabled(stream.getVideoTracks()[0]?.enabled ?? false);

      let sfuToken: string;
      try {
        // Guests join with a token issued by the public join endpoint; members
        // fetch one here (re-issue keeps reconnects working past expiry).
        sfuToken = sfuTokenOverride ?? (await getSfuToken(roomId)).token;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get SFU token");
        await leave();
        throw err;
      }

      let pc: RTCPeerConnection;
      try {
        pc = new RTCPeerConnection({
          iceServers: getIceServers(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const context = `(isSecureContext=${window.isSecureContext}, origin=${window.location.origin}, tauri=${isTauri})`;
        console.warn("RTCPeerConnection with ice servers failed:", message, context);
        // WKWebView on the tauri:// scheme may reject the configured ICE
        // servers as insecure (e.g. STUN over a non-HTTP origin). Try again
        // with an empty configuration so the call can still signal.
        try {
          pc = new RTCPeerConnection();
        } catch (err2) {
          const message2 = err2 instanceof Error ? err2.message : String(err2);
          const wrapped = new Error(`${message2} (fallback RTCPeerConnection) ${context}`);
          setError(wrapped.message);
          await leave();
          throw wrapped;
        }
      }
      pcRef.current = pc;

      pc.onconnectionstatechange = () => {
        setConnected(pc.connectionState === "connected");
        if (pc.connectionState === "connected") {
          reconnectAttemptRef.current = 0;
        } else if (pc.connectionState === "failed") {
          setError("Peer connection failed");
          wsRef.current?.close();
        }
      };

      pc.onnegotiationneeded = () => {
        // Perfect negotiation: the client is the polite peer. Never offer while
        // a negotiation is in flight — the change is re-offered once stable.
        if (pc.signalingState !== "stable") {
          pendingLocalOfferRef.current = true;
          return;
        }
        makeLocalOffer(pc);
      };

      pc.onicecandidate = (e) => {
        const c = e.candidate;
        if (!c) return;
        send({
          type: "ice",
          target: "sfu",
          candidate: c.candidate,
          sdp_m_line_index: c.sdpMLineIndex ?? 0,
          sdp_mid: c.sdpMid ?? undefined,
        });
      };

      pc.ontrack = (e) => {
        const stream = e.streams[0] ?? new MediaStream([e.track]);
        const participantId = stream.id;
        trackIdToParticipantRef.current[e.track.id] = participantId;
        // `muted` flips on the remote track when the peer stops sending (mic
        // muted / camera off). That isn't a state change React can see, so
        // bump remoteStreams to re-render tiles and mic/cam indicators.
        const bump = () => setRemoteStreams((prev) => [...prev]);
        e.track.onmute = bump;
        e.track.onunmute = bump;
        e.track.onended = bump;
        setRemoteStreams((prev) => {
          const others = prev.filter((p) => p.participantId !== participantId);
          return [...others, { participantId, stream }];
        });
      };

      let ws: WebSocket;
      try {
        ws = new WebSocket(SFU_URL);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`WebSocket(${SFU_URL}) failed: ${message}`);
        throw err;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        send({ type: "join", room_id: roomId, display_name: displayName, user_id: userId, token: sfuToken });
      };

      ws.onmessage = async (event) => {
        let msg: Signal;
        try {
          msg = JSON.parse(event.data) as Signal;
        } catch (e) {
          console.error("Invalid SFU message", event.data);
          return;
        }

        switch (msg.type) {
          case "connected":
            setMyParticipantId(msg.participant_id ?? null);
            break;

          case "room_state":
            setParticipants(
              msg.participants?.map((p) => ({ id: p.id, displayName: p.display_name, userId: p.user_id })) ?? [],
            );
            break;

          case "participant_joined":
            setParticipants((prev) => [
              ...prev.filter((p) => p.id !== msg.participant_id),
              { id: msg.participant_id!, displayName: msg.display_name!, userId: msg.user_id },
            ]);
            break;

          case "participant_left":
            setParticipants((prev) => prev.filter((p) => p.id !== msg.participant_id));
            setRemoteStreams((prev) =>
              prev.filter(
                (p) => p.participantId !== msg.participant_id &&
                  p.participantId !== `screen-${msg.participant_id}`,
              ),
            );
            break;

          case "offer": {
            // Serialized so a second SFU offer can't interleave with the one
            // currently being processed.
            enqueueSignal(async () => {
              let stage = "receive offer";
              try {
                // Polite side of glare resolution: if our own offer is still
                // outstanding, roll it back and accept the SFU's offer. The
                // rolled-back changes are re-offered once we're stable again.
                if (pc.signalingState === "have-local-offer") {
                  pendingLocalOfferRef.current = true;
                  try {
                    stage = "rollback local offer";
                    await pc.setLocalDescription({ type: "rollback" });
                  } catch {
                    // Rollback unsupported — proceed and let the offer apply.
                  }
                }
                stage = "set remote offer";
                await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp! });

                // Only attach local tracks on the initial offer; on renegotiation
                // the senders are already set and should not be re-added.
                const hasLocalTracks = pc.getSenders().some((s) => s.track);
                if (!hasLocalTracks) {
                  const tracks = stream!.getTracks();
                  for (const track of tracks) {
                    const transceiver = pc.getTransceivers().find(
                      (tr) =>
                        tr.receiver.track.kind === track.kind &&
                        tr.direction === "sendonly" &&
                        tr.sender.track === null,
                    );
                    stage = `${transceiver ? "replace" : "add"} ${track.kind} track`;
                    if (transceiver) {
                      await transceiver.sender.replaceTrack(track);
                    } else {
                      pc.addTrack(track, stream!);
                    }
                  }
                }

                stage = "create answer";
                const answer = await pc.createAnswer();
                stage = "set local answer";
                await pc.setLocalDescription(answer);
                send({ type: "answer", target: "sfu", sdp: answer.sdp! });

                if (pendingLocalOfferRef.current && pc.signalingState === "stable") {
                  pendingLocalOfferRef.current = false;
                  makeLocalOffer(pc);
                }
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                setError(`SFU ${stage} failed (${pc.signalingState}): ${message}`);
              }
            });
            break;
          }

          case "answer": {
            // Reply to a client-initiated offer (e.g. screen-share or camera
            // started mid-call via onnegotiationneeded). Without this the pc
            // stays stuck in have-local-offer and the track never flows.
            enqueueSignal(async () => {
              try {
                await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp! });
              } catch (err) {
                // Stale answer (our offer was rolled back for an SFU offer).
                console.error("Failed to apply SFU answer", err);
              }
              if (pendingLocalOfferRef.current && pc.signalingState === "stable") {
                pendingLocalOfferRef.current = false;
                makeLocalOffer(pc);
              }
            });
            break;
          }

          case "ice": {
            try {
              await pc.addIceCandidate({
                candidate: msg.candidate!,
                sdpMLineIndex: msg.sdp_m_line_index,
                sdpMid: msg.sdp_mid,
              });
            } catch (err) {
              console.error("Failed to add ICE candidate", err);
            }
            break;
          }

          case "error":
            setError(`SFU signaling error: ${msg.message ?? "Unknown error"}`);
            break;

          case "room_event": {
            // Ephemeral in-room event broadcast by the SFU on behalf of
            // another participant (raise hand, reaction, …).
            const roomEvent: SfuRoomEvent = {
              from: msg.from ?? "",
              displayName: msg.display_name ?? "Participant",
              userId: msg.user_id,
              data: msg.data,
            };
            roomEventHandlersRef.current.forEach((h) => h(roomEvent));
            break;
          }
        }
      };

      ws.onerror = () => {
        setError("SFU WebSocket error");
        setConnected(false);
        pcRef.current?.close();
        pcRef.current = null;
        cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      };

      ws.onclose = () => {
        setConnected(false);
        pcRef.current?.close();
        pcRef.current = null;
        cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
        screenStreamRef.current?.getTracks().forEach((t) => t.stop());

        if (isIntentionalLeaveRef.current || !lastJoinArgsRef.current) return;

        if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setError("SFU connection lost and could not reconnect");
          return;
        }

        reconnectAttemptRef.current += 1;
        const delay =
          RECONNECT_DELAYS_MS[
            Math.min(reconnectAttemptRef.current - 1, RECONNECT_DELAYS_MS.length - 1)
          ];
        setError(
          `SFU connection lost. Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current}/${MAX_RECONNECT_ATTEMPTS})...`,
        );
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          const args = lastJoinArgsRef.current;
          if (!args) return;
          const { roomId, displayName, mediaOptions, userId, sfuToken } = args;
          void join(roomId, displayName, mediaOptions, userId, sfuToken);
        }, delay);
      };
    },
    [leave],
  );

  // Ephemeral room-scoped events (raise hand, reactions, …) shared with every
  // participant — including link guests who have no realtime socket.
  const sendRoomEvent = useCallback((data: unknown) => {
    send({ type: "room_event", data });
  }, []);

  const onRoomEvent = useCallback((handler: (event: SfuRoomEvent) => void) => {
    roomEventHandlersRef.current.add(handler);
    return () => {
      roomEventHandlersRef.current.delete(handler);
    };
  }, []);

  return {
    join,
    leave,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    sendRoomEvent,
    onRoomEvent,
    localAudioEnabled,
    localVideoEnabled,
    screenShareEnabled,
    localStream,
    remoteStreams,
    participants,
    myParticipantId,
    connected,
    error,
    qualityStats,
    activeSpeakerId,
  };
}
