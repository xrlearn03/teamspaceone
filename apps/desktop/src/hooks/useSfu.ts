import { useCallback, useRef, useState } from "react";

export interface SfuParticipant {
  id: string;
  displayName: string;
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
  participants?: { id: string; display_name: string }[];
  display_name?: string;
  from?: string;
  sdp?: string;
  candidate?: string;
  sdp_m_line_index?: number;
  sdp_mid?: string;
  message?: string;
}

type SendSignal =
  | { type: "join"; room_id: string; display_name: string }
  | { type: "answer"; target: string; sdp: string }
  | {
      type: "ice";
      target: string;
      candidate: string;
      sdp_m_line_index: number;
      sdp_mid?: string;
    };

const SFU_URL = "ws://127.0.0.1:8443";
const STUN_SERVER = "stun:stun.l.google.com:19302";

export function useSfu() {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

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

    const camera = cameraStreamRef.current;
    const cameraTrack = camera?.getVideoTracks()[0];

    if (pc && cameraTrack) {
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

  const startScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

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
      setScreenShareEnabled(true);
      setLocalVideoEnabled(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screen share failed");
    }
  }, [stopScreenShare]);

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
    const camera = cameraStreamRef.current;
    const track = camera?.getVideoTracks()[0];
    if (!track) return;

    if (screenShareEnabled) {
      await stopScreenShare();
    }

    track.enabled = !track.enabled;
    setLocalVideoEnabled(track.enabled);

    const audioTracks = localStreamRef.current?.getAudioTracks() ?? [];
    const preview = new MediaStream([track, ...audioTracks]);
    localStreamRef.current = preview;
    setLocalStream(preview);
  }, [screenShareEnabled, stopScreenShare]);

  const leave = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;

    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
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
  }, []);

  const join = useCallback(
    async (roomId: string, displayName: string, mediaOptions: MediaOptions) => {
      leave();
      setError(null);

      let stream: MediaStream | null = null;
      try {
        // Try to get both tracks so in-call toggles work. If that fails (e.g. no camera),
        // fall back to the user's selected devices.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: mediaOptions.audioEnabled,
            video: mediaOptions.videoEnabled,
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
        send({ type: "join", room_id: roomId, display_name: displayName });
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
              msg.participants?.map((p) => ({ id: p.id, displayName: p.display_name })) ?? [],
            );
            break;

          case "participant_joined":
            setParticipants((prev) => [
              ...prev.filter((p) => p.id !== msg.participant_id),
              { id: msg.participant_id!, displayName: msg.display_name! },
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
