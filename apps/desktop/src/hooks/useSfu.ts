import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type Event } from "@tauri-apps/api/event";

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
    | "error";
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
}

type SendSignal =
  | { type: "join"; room_id: string; display_name: string; user_id?: string }
  | { type: "answer"; target: string; sdp: string }
  | {
      type: "ice";
      target: string;
      candidate: string;
      sdp_m_line_index: number;
      sdp_mid?: string;
    };

const SFU_URL =
  (import.meta.env.VITE_SFU_URL as string | undefined) ?? "ws://127.0.0.1:8443";
const STUN_SERVER =
  (import.meta.env.VITE_STUN_SERVER_URL as string | undefined) ??
  "stun:stun.l.google.com:19302";

export function useSfu() {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenShareModeRef = useRef<"browser" | "native" | null>(null);
  const nativeUnlistenRef = useRef<(() => void) | null>(null);
  const nativeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const isTauri = typeof (window as typeof window & { __TAURI_INTERNALS__?: unknown })?.__TAURI_INTERNALS__ !== "undefined";

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<SfuRemoteStream[]>([]);
  const [participants, setParticipants] = useState<SfuParticipant[]>([]);
  const [myParticipantId, setMyParticipantId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [localAudioEnabled, setLocalAudioEnabled] = useState(false);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);

  function send(msg: SendSignal) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
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

    const camera = cameraStreamRef.current;
    const cameraTrack = camera?.getVideoTracks()[0];

    if (pc && pc.connectionState !== "closed" && cameraTrack) {
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        try {
          await sender.replaceTrack(cameraTrack);
        } catch (err) {
          console.error("Failed to restore camera track", err);
        }
      }
    }

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

    // Try the browser getDisplayMedia path first (works in browsers and may
    // work in future Tauri versions).
    if (
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === "function"
    ) {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screen.getVideoTracks()[0];
        if (!screenTrack) return;

        screenTrack.onended = () => {
          void stopScreenShare();
        };

        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(screenTrack);
        }

        const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
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
      const sender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(track);
      }

      const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
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

  const toggleAudio = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setLocalAudioEnabled(track.enabled);
  }, []);

  const toggleVideo = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    if (screenShareEnabled) {
      await stopScreenShare();
    }

    const videoSender = pc
      .getTransceivers()
      .find((tr) => tr.receiver.track.kind === "video")?.sender;
    if (!videoSender) return;

    const currentVideoTrack = cameraStreamRef.current?.getVideoTracks()[0];
    const audioTracks = cameraStreamRef.current?.getAudioTracks() ?? [];

    if (currentVideoTrack) {
      // Stop sending and release the camera.
      try {
        await videoSender.replaceTrack(null);
      } catch (err) {
        console.error("Failed to stop video sender", err);
      }
      currentVideoTrack.stop();
      const preview = new MediaStream([...audioTracks]);
      cameraStreamRef.current = preview;
      localStreamRef.current = preview;
      setLocalStream(preview);
      setLocalVideoEnabled(false);
      return;
    }

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const newTrack = videoStream.getVideoTracks()[0];
      if (!newTrack) return;
      newTrack.enabled = true;
      await videoSender.replaceTrack(newTrack);
      const preview = new MediaStream([...audioTracks, newTrack]);
      cameraStreamRef.current = preview;
      localStreamRef.current = preview;
      setLocalStream(preview);
      setLocalVideoEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access camera");
    }
  }, [screenShareEnabled, stopScreenShare]);

  const leave = useCallback(async () => {
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
    async (roomId: string, displayName: string, mediaOptions: MediaOptions, userId?: string) => {
      await leave();
      setError(null);

      let stream: MediaStream | null = null;
      try {
        // Request audio always so it can be toggled in-call. Request video only
        // when the user has it enabled (e.g. voice rooms start audio-only).
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: mediaOptions.videoEnabled,
        });
      } catch {
        try {
          // Fall back to audio-only if the camera is unavailable or disabled.
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not access camera/mic");
          throw err;
        }
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

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: STUN_SERVER }],
      });
      pcRef.current = pc;

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
        setRemoteStreams((prev) => {
          const others = prev.filter((p) => p.participantId !== participantId);
          return [...others, { participantId, stream }];
        });
      };

      const ws = new WebSocket(SFU_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        send({ type: "join", room_id: roomId, display_name: displayName, user_id: userId });
        setConnected(true);
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
            break;

          case "offer": {
            try {
              await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp! });

              const tracks = stream!.getTracks();
              for (const track of tracks) {
                const transceiver = pc.getTransceivers().find(
                  (tr) =>
                    tr.receiver.track.kind === track.kind &&
                    tr.direction === "sendonly" &&
                    tr.sender.track === null,
                );
                if (transceiver) {
                  await transceiver.sender.replaceTrack(track);
                } else {
                  pc.addTrack(track, stream!);
                }
              }

              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              send({ type: "answer", target: "sfu", sdp: answer.sdp! });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to handle SFU offer");
            }
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
            setError(msg.message ?? "SFU error");
            break;
        }
      };

      ws.onerror = () => {
        setError("SFU WebSocket error");
        setConnected(false);
      };

      ws.onclose = () => {
        setConnected(false);
      };
    },
    [leave],
  );

  return {
    join,
    leave,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    localAudioEnabled,
    localVideoEnabled,
    screenShareEnabled,
    localStream,
    remoteStreams,
    participants,
    myParticipantId,
    connected,
    error,
  };
}
