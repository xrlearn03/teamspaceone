"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface NativeAudioDevice {
  id: string;
  name: string;
}

export interface UseNativeMicrophoneReturn {
  devices: NativeAudioDevice[];
  selectedIndex: number | null;
  setSelectedIndex: (index: number) => void;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  audioStream: MediaStream | null;
  error: string | null;
  resumeContext: () => Promise<void>;
}

export function useNativeMicrophone(): UseNativeMicrophoneReturn {
  const [devices, setDevices] = useState<NativeAudioDevice[]>([]);
  const [selectedIndex, setSelectedIndexState] = useState<number | null>(null);
  const [enabled, setEnabledState] = useState(true);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const deviceIdsRef = useRef<string[]>([]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setAudioStream(null);
    setError(null);
  }, []);

  const start = useCallback(
    async (index: number) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Microphone access is not supported in this browser.");
        return;
      }
      stop();
      setError(null);
      const deviceId = deviceIdsRef.current[index];
      try {
        const next = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
          video: false,
        });
        streamRef.current = next;
        setAudioStream(next);

        if (!contextRef.current) {
          try {
            contextRef.current = new AudioContext();
          } catch {
            // Best-effort.
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [stop],
  );

  const setSelectedIndex = useCallback(
    (index: number) => {
      setSelectedIndexState(index);
      if (enabled) {
        start(index);
      }
    },
    [enabled, start],
  );

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value);
      if (value && selectedIndex !== null) {
        start(selectedIndex);
      } else {
        stop();
      }
    },
    [selectedIndex, start, stop],
  );

  const resumeContext = useCallback(async () => {
    if (contextRef.current?.state === "suspended") {
      await contextRef.current.resume().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let mounted = true;
    navigator.mediaDevices
      .enumerateDevices()
      .then((infos) => {
        const audios = infos.filter((d) => d.kind === "audioinput");
        const list = audios.map((d, i) => ({
          id: String(i),
          name: d.label || `Microphone ${i + 1}`,
        }));
        if (!mounted) return;
        setDevices(list);
        deviceIdsRef.current = audios.map((d) => d.deviceId);
        if (selectedIndex === null && list.length > 0) {
          setSelectedIndexState(0);
        }
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || selectedIndex === null) {
      return;
    }
    start(selectedIndex);
    return () => {
      stop();
    };
  }, [enabled, selectedIndex, start, stop]);

  useEffect(() => {
    return () => {
      stop();
      contextRef.current?.close().catch(() => {});
      contextRef.current = null;
    };
  }, [stop]);

  return {
    devices,
    selectedIndex,
    setSelectedIndex,
    enabled,
    setEnabled,
    audioStream,
    error,
    resumeContext,
  };
}
