import { useCallback, useRef, useState } from "react";

export interface SfuParticipant {
  id: string;
  displayName: string;
  userId?: string;
}

export interface SfuRemoteStream {
  participantId: string;
  stream: MediaStream;
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
  participants?: { id: string; display_name: string; user_id?: string }[];
  display_name?: string;
  user_id?: string;
  sdp?: string;
  candidate?: string;
  sdp_m_line_index?: number;
  sdp_mid?: string;
  message?: string;
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
    };

const FALLBACK_ICE: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302"] }];

function getIceServers(): RTCIceServer[] {
  const raw = import.meta.env.VITE_ICE_SERVERS as string | undefined;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { urls?: string | string[]; username?: string; credential?: string }[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .map((entry) => ({
            ...entry,
            urls: Array.isArray(entry.urls) ? entry.urls : entry.urls ? [entry.urls] : [],
          }))
          .filter((entry) => entry.urls.length > 0);
      }
    } catch {
      // Fall through to the default STUN server.
    }
  }
  return FALLBACK_ICE;
}

export function defaultSfuUrl(): string {
  const configured = import.meta.env.VITE_SFU_URL as string | undefined;
  if (configured) return configured;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/sfu`;
}

/**
 * Minimal SFU client for browser guests: WebSocket signaling + a single
 * RTCPeerConnection. Mirrors the protocol used by the desktop app's useSfu
 * hook (join -> SFU offer -> answer, trickle ICE, room state events).
 */
export function useGuestSfu() {
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<SfuRemoteStream[]>([]);
  const [participants, setParticipants] = useState<SfuParticipant[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);

  function send(msg: SendSignal) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  const leave = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    wsRef.current?.close();
    wsRef.current = null;
    screenShareRef.current?.track.stop();
    screenShareRef.current = null;
    setScreenShareEnabled(false);
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStreams([]);
    setParticipants([]);
    setConnected(false);
    setAudioEnabled(false);
    setVideoEnabled(false);
  }, []);

  const join = useCallback(
    async (args: {
      url: string;
      roomId: string;
      displayName: string;
      userId: string;
      token: string;
      stream: MediaStream;
    }) => {
      setError(null);
      localStreamRef.current = args.stream;
      setLocalStream(args.stream);
      setAudioEnabled(args.stream.getAudioTracks()[0]?.enabled ?? false);
      setVideoEnabled(args.stream.getVideoTracks()[0]?.enabled ?? false);

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      pcRef.current = pc;

      pc.onconnectionstatechange = () => {
        setConnected(pc.connectionState === "connected");
        if (pc.connectionState === "failed") setError("Peer connection failed");
      };

      // Track added mid-call (e.g. camera enabled after joining muted) →
      // re-offer to the SFU, which replies with an "answer" signal.
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          send({ type: "offer", target: "sfu", sdp: offer.sdp! });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Negotiation failed");
        }
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
        // `muted` flips on the remote track when the peer stops sending (mic
        // muted / camera off). Bump remoteStreams so tiles re-render.
        const bump = () => setRemoteStreams((prev) => [...prev]);
        e.track.onmute = bump;
        e.track.onunmute = bump;
        e.track.onended = bump;
        setRemoteStreams((prev) => [
          ...prev.filter((p) => p.participantId !== participantId),
          { participantId, stream },
        ]);
      };

      const ws = new WebSocket(args.url);
      wsRef.current = ws;

      ws.onopen = () => {
        send({
          type: "join",
          room_id: args.roomId,
          display_name: args.displayName,
          user_id: args.userId,
          token: args.token,
        });
      };

      ws.onmessage = async (event) => {
        let msg: Signal;
        try {
          msg = JSON.parse(event.data as string) as Signal;
        } catch {
          return;
        }

        switch (msg.type) {
          case "room_state":
            setParticipants(
              msg.participants?.map((p) => ({
                id: p.id,
                displayName: p.display_name,
                userId: p.user_id,
              })) ?? [],
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
                (p) =>
                  p.participantId !== msg.participant_id &&
                  p.participantId !== `screen-${msg.participant_id}`,
              ),
            );
            break;

          case "offer": {
            try {
              await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp! });
              const hasLocalTracks = pc.getSenders().some((s) => s.track);
              if (!hasLocalTracks) {
                for (const track of args.stream.getTracks()) {
                  const transceiver = pc.getTransceivers().find(
                    (tr) =>
                      tr.receiver.track.kind === track.kind &&
                      tr.direction === "sendonly" &&
                      tr.sender.track === null,
                  );
                  if (transceiver) {
                    await transceiver.sender.replaceTrack(track);
                  } else {
                    pc.addTrack(track, args.stream);
                  }
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

          case "answer":
            // Reply to a client-initiated offer (onnegotiationneeded).
            try {
              await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp! });
            } catch {
              // Stale answer (e.g. connection already renegotiated); ignore.
            }
            break;

          case "ice":
            try {
              await pc.addIceCandidate({
                candidate: msg.candidate!,
                sdpMLineIndex: msg.sdp_m_line_index,
                sdpMid: msg.sdp_mid,
              });
            } catch {
              // Ignore candidates that arrive after the connection is torn down.
            }
            break;

          case "error":
            setError(msg.message ?? "SFU error");
            break;
        }
      };

      ws.onerror = () => {
        setError("Could not connect to the media server");
        setConnected(false);
      };

      ws.onclose = () => {
        setConnected(false);
      };
    },
    [],
  );

  // Attach a freshly captured track to the call: reuse the sendonly
  // transceiver the SFU offered for that kind when possible, else addTrack
  // (which triggers onnegotiationneeded → client offer → SFU answer).
  const attachLocalTrack = useCallback(async (track: MediaStreamTrack) => {
    const current = localStreamRef.current ?? new MediaStream();
    const next = new MediaStream([...current.getTracks(), track]);
    localStreamRef.current = next;
    setLocalStream(next);

    const pc = pcRef.current;
    if (!pc) return;
    const transceiver = pc.getTransceivers().find(
      (tr) =>
        tr.receiver.track.kind === track.kind &&
        tr.direction === "sendonly" &&
        tr.sender.track === null,
    );
    if (transceiver) {
      await transceiver.sender.replaceTrack(track);
    } else {
      pc.addTrack(track, next);
    }
  }, []);

  const acquiringRef = useRef(false);
  const acquireTrack = useCallback(
    async (kind: "audio" | "video") => {
      if (acquiringRef.current) return;
      acquiringRef.current = true;
      try {
        const media = await navigator.mediaDevices.getUserMedia(
          kind === "audio"
            ? {
                audio: {
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                },
                video: false,
              }
            : { audio: false, video: true },
        );
        const track = (kind === "audio" ? media.getAudioTracks() : media.getVideoTracks())[0];
        if (!track) return;
        await attachLocalTrack(track);
        if (kind === "audio") setAudioEnabled(true);
        else setVideoEnabled(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not access ${kind}`);
      } finally {
        acquiringRef.current = false;
      }
    },
    [attachLocalTrack],
  );

  const toggleAudio = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) {
      // Joined without a mic — "Unmute" acquires one and attaches it.
      void acquireTrack("audio");
      return;
    }
    track.enabled = !track.enabled;
    setAudioEnabled(track.enabled);
  }, [acquireTrack]);

  const toggleVideo = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) {
      // Joined without a camera — "Start video" acquires one and attaches it.
      void acquireTrack("video");
      return;
    }
    track.enabled = !track.enabled;
    setVideoEnabled(track.enabled);
  }, [acquireTrack]);

  const screenShareRef = useRef<{ track: MediaStreamTrack; sender: RTCRtpSender } | null>(null);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);

  const toggleScreenShare = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;

    const active = screenShareRef.current;
    if (active) {
      try {
        pc.removeTrack(active.sender);
      } catch {
        // Sender may already be gone if the connection dropped.
      }
      active.track.stop();
      screenShareRef.current = null;
      setScreenShareEnabled(false);
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      if (!track) return;
      // A second video track is forwarded by the SFU as "screen-<id>".
      const sender = pc.addTrack(track, new MediaStream([track]));
      screenShareRef.current = { track, sender };
      setScreenShareEnabled(true);
      // "Stop sharing" from the browser chrome ends the track.
      track.onended = () => {
        const cur = screenShareRef.current;
        if (cur) {
          try {
            pc.removeTrack(cur.sender);
          } catch {
            // Already removed.
          }
          screenShareRef.current = null;
          setScreenShareEnabled(false);
        }
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : "Screen share failed");
    }
  }, []);

  return {
    join,
    leave,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    screenShareEnabled,
    localStream,
    remoteStreams,
    participants,
    connected,
    error,
    audioEnabled,
    videoEnabled,
  };
}
