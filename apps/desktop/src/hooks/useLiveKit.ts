import { useEffect, useRef, useState, useCallback } from "react";
import { Room, RoomEvent, type RemoteParticipant, type Room as LKRoom } from "livekit-client";

export interface UseLiveKitOptions {
  url: string;
  token: string;
  roomName: string;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  rtcConfig?: RTCConfiguration;
}

export function useLiveKit({ url, token, audioEnabled = true, videoEnabled = true, rtcConfig }: UseLiveKitOptions) {
  const roomRef = useRef<LKRoom | null>(null);
  const [connectionState, setConnectionState] = useState<"disconnected" | "connecting" | "connected" | "reconnecting">("disconnected");
  const [error, setError] = useState<Error | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [localAudioEnabled, setLocalAudioEnabled] = useState(audioEnabled);
  const [localVideoEnabled, setLocalVideoEnabled] = useState(videoEnabled);
  const [localScreenShare, setLocalScreenShare] = useState(false);

  useEffect(() => {
    if (!url || !token) return;

    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    roomRef.current = room;

    function updateParticipants() {
      setRemoteParticipants(Array.from(room.remoteParticipants.values()));
    }

    room.on(RoomEvent.Connected, () => {
      setConnectionState("connected");
      updateParticipants();
    });
    room.on(RoomEvent.Disconnected, () => setConnectionState("disconnected"));
    room.on(RoomEvent.Reconnecting, () => setConnectionState("reconnecting"));
    room.on(RoomEvent.ParticipantConnected, updateParticipants);
    room.on(RoomEvent.ParticipantDisconnected, updateParticipants);
    room.on(RoomEvent.TrackSubscribed, updateParticipants);
    room.on(RoomEvent.TrackUnsubscribed, updateParticipants);
    room.on(RoomEvent.LocalTrackPublished, updateParticipants);
    room.on(RoomEvent.LocalTrackUnpublished, updateParticipants);

    setConnectionState("connecting");
    setError(null);
    room
      .connect(url, token, { rtcConfig })
      .then(async () => {
        try {
          await room.localParticipant.setMicrophoneEnabled(audioEnabled);
          await room.localParticipant.setCameraEnabled(videoEnabled);
          setLocalAudioEnabled(audioEnabled);
          setLocalVideoEnabled(videoEnabled);
        } catch (err) {
          // Camera/mic permission errors are non-fatal; user can enable later.
        }
      })
      .catch((err) => setError(err as Error));

    return () => {
      room.disconnect().catch(() => {});
      roomRef.current = null;
    };
  }, [url, token, audioEnabled, videoEnabled, rtcConfig]);

  const toggleMicrophone = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setLocalAudioEnabled(enabled);
  }, []);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(enabled);
    setLocalVideoEnabled(enabled);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = !room.localParticipant.isScreenShareEnabled;
    await room.localParticipant.setScreenShareEnabled(enabled);
    setLocalScreenShare(enabled);
  }, []);

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
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    leave,
  };
}
