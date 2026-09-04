import { useCallback, useEffect, useRef, useState } from "react";

export interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export interface UseMediaDevicesOptions {
  audioEnabled?: boolean;
  videoEnabled?: boolean;
}

export function useMediaDevices(options: UseMediaDevicesOptions = {}) {
  const [audioEnabled, setAudioEnabled] = useState(options.audioEnabled ?? true);
  const [videoEnabled, setVideoEnabled] = useState(options.videoEnabled ?? true);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioInputId, setAudioInputId] = useState<string>("");
  const [videoInputId, setVideoInputId] = useState<string>("");
  const [audioOutputId, setAudioOutputId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const startPreview = useCallback(
    async (audioDeviceId?: string, videoDeviceId?: string) => {
      stopStream();
      setError(null);

      const constraints: MediaStreamConstraints = {
        audio: audioEnabled
          ? { deviceId: audioDeviceId ? { exact: audioDeviceId } : undefined }
          : false,
        video: videoEnabled
          ? { deviceId: videoDeviceId ? { exact: videoDeviceId } : undefined }
          : false,
      };

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Media devices are not supported in this environment.");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not access camera or microphone.");
      }
    },
    [audioEnabled, videoEnabled, stopStream],
  );

  const enumerate = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const infos = await navigator.mediaDevices.enumerateDevices();
      const mapped = infos
        .filter((d) => d.kind !== "audiooutput" || "setSinkId" in HTMLAudioElement.prototype)
        .map((d) => ({ deviceId: d.deviceId, label: d.label || d.kind, kind: d.kind }));
      setDevices(mapped);

      const defaultAudioInput = infos.find((d) => d.kind === "audioinput")?.deviceId ?? "";
      const defaultVideoInput = infos.find((d) => d.kind === "videoinput")?.deviceId ?? "";
      const defaultAudioOutput = infos.find((d) => d.kind === "audiooutput")?.deviceId ?? "";

      setAudioInputId((current) => current || defaultAudioInput);
      setVideoInputId((current) => current || defaultVideoInput);
      setAudioOutputId((current) => current || defaultAudioOutput);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list media devices.");
    }
  }, []);

  useEffect(() => {
    void enumerate();
  }, [enumerate]);

  useEffect(() => {
    void startPreview(audioInputId, videoInputId);
    return () => {
      stopStream();
    };
  }, [startPreview, stopStream, audioInputId, videoInputId, audioEnabled, videoEnabled]);

  const toggleAudio = useCallback(() => {
    setAudioEnabled((prev) => !prev);
  }, []);

  const toggleVideo = useCallback(() => {
    setVideoEnabled((prev) => !prev);
  }, []);

  const setAudioDevice = useCallback((id: string) => {
    setAudioInputId(id);
  }, []);

  const setVideoDevice = useCallback((id: string) => {
    setVideoInputId(id);
  }, []);

  const setSpeakerDevice = useCallback((id: string) => {
    setAudioOutputId(id);
  }, []);

  const applyAudioOutput = useCallback((element: HTMLMediaElement | null) => {
    if (!element || !audioOutputId || !("setSinkId" in element)) return;
    try {
      void (element as HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(audioOutputId);
    } catch {
      // Speaker selection is best-effort.
    }
  }, [audioOutputId]);

  return {
    stream: streamRef.current,
    audioEnabled,
    videoEnabled,
    devices,
    audioInputId,
    videoInputId,
    audioOutputId,
    error,
    toggleAudio,
    toggleVideo,
    setAudioDevice,
    setVideoDevice,
    setSpeakerDevice,
    applyAudioOutput,
    videoDevices: devices.filter((d) => d.kind === "videoinput"),
    audioInputDevices: devices.filter((d) => d.kind === "audioinput"),
    audioOutputDevices: devices.filter((d) => d.kind === "audiooutput"),
  };
}
