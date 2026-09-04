import { useCallback, useEffect, useRef, useState } from "react";

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
      return "The selected camera/microphone is unavailable. A different device will be used.";
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
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const releasedRef = useRef(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  const releaseStream = useCallback(() => {
    releasedRef.current = true;
    return streamRef.current;
  }, []);

  const startPreview = useCallback(
    async (audioDeviceId?: string, videoDeviceId?: string) => {
      stopStream();
      setError(null);

      const buildTrackConstraints = (deviceId?: string): MediaTrackConstraints | boolean => {
        if (!deviceId) return true;
        return { deviceId: { ideal: deviceId } };
      };

      const constraints: MediaStreamConstraints = {
        audio: audioEnabled ? buildTrackConstraints(audioDeviceId) : false,
        video: videoEnabled ? buildTrackConstraints(videoDeviceId) : false,
      };

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Media devices are not supported in this environment.");
        return;
      }

      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

      try {
        // Give the OS a moment to release the camera between restarts.
        await sleep(300);
        const nextStream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = nextStream;
        setStream(nextStream);
      } catch (err) {
        // If the selected device is busy or no longer available, fall back to defaults.
        const fallback: MediaStreamConstraints = {
          audio: audioEnabled ? true : false,
          video: videoEnabled ? true : false,
        };
        try {
          await sleep(500);
          const nextStream = await navigator.mediaDevices.getUserMedia(fallback);
          streamRef.current = nextStream;
          setStream(nextStream);
        } catch (err2) {
          const primary = getMediaErrorMessage(err);
          const fallbackMessage = err2 instanceof Error ? err2.message : "";
          setError(fallbackMessage ? `${primary} (fallback: ${fallbackMessage})` : primary);
        }
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
      setError(getMediaErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    void enumerate();
  }, [enumerate]);

  useEffect(() => {
    releasedRef.current = false;
    void startPreview(audioInputId, videoInputId);
    return () => {
      if (!releasedRef.current) {
        stopStream();
      }
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
    stream,
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
    releaseStream,
    applyAudioOutput,
    videoDevices: devices.filter((d) => d.kind === "videoinput"),
    audioInputDevices: devices.filter((d) => d.kind === "audioinput"),
    audioOutputDevices: devices.filter((d) => d.kind === "audiooutput"),
  };
}
