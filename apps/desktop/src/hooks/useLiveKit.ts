import { useEffect, useRef, useState, useCallback } from "react";
import { Room, RoomEvent, type RemoteParticipant, type Room as LKRoom } from "livekit-client";

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

function encodeData(data: MeetingData): Uint8Array {
  return encoder.encode(JSON.stringify(data));
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

  const localName = displayName ?? "You";

  useEffect(() => {
    if (!url || !token) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: audioInputId ? { deviceId: audioInputId } : undefined,
      videoCaptureDefaults: videoInputId ? { deviceId: videoInputId } : undefined,
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
    room
      .connect(url, token, { rtcConfig })
      .then(async () => {
        try {
          await room.localParticipant.setMicrophoneEnabled(audioEnabled);
          await room.localParticipant.setCameraEnabled(videoEnabled);
        } catch (err) {
          // Camera/mic permission errors are non-fatal; user can enable later.
          console.warn("Failed to enable camera/microphone:", err);
        }
        setLocalAudioEnabled(room.localParticipant.isMicrophoneEnabled);
        setLocalVideoEnabled(room.localParticipant.isCameraEnabled);
        updateLocalParticipant();
      })
      .catch((err) => setError(err as Error));

    return () => {
      room.disconnect().catch(() => {});
      roomRef.current = null;
    };
  }, [url, token, audioEnabled, videoEnabled, audioInputId, videoInputId, audioOutputId, rtcConfig]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setLocalAudioEnabled(room.localParticipant.isMicrophoneEnabled);
    setLocalTrackVersion((v) => v + 1);
  }, []);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(enabled);
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
