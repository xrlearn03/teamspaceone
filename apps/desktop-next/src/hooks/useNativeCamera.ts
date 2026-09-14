"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface NativeDevice {
  id: string;
  name: string;
}

export interface UseNativeCameraReturn {
  devices: NativeDevice[];
  selectedIndex: number | null;
  setSelectedIndex: (index: number) => void;
  frame: string | null;
  error: string | null;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  videoStream: MediaStream | null;
  running: boolean;
}

export function useNativeCamera(): UseNativeCameraReturn {
  const [devices, setDevices] = useState<NativeDevice[]>([]);
  const [selectedIndex, setSelectedIndexState] = useState<number | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [running, setRunning] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const deviceIdsRef = useRef<string[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    try {
      setFrame(canvas.toDataURL("image/jpeg", 0.8));
    } catch {
      // Canvas tainting or unsupported; ignore.
    }
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    videoRef.current?.pause();
    videoRef.current = null;
    canvasRef.current = null;
    setVideoStream(null);
    setFrame(null);
    setRunning(false);
  }, []);

  const start = useCallback(
    async (index: number) => {
      if (
        typeof navigator.mediaDevices?.getUserMedia !== "function" ||
        window.isSecureContext === false
      ) {
        setError("Camera access needs a secure (HTTPS) context.");
        return;
      }
      stop();
      setError(null);
      const deviceId = deviceIdsRef.current[index];
      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false,
        };
        const next = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = next;
        setVideoStream(next);
        setRunning(true);

        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.srcObject = next;
        videoRef.current = video;
        void video.play().catch(() => {});

        const canvas = document.createElement("canvas");
        canvasRef.current = canvas;

        const onReady = () => {
          captureFrame();
          if (intervalRef.current === null) {
            intervalRef.current = window.setInterval(captureFrame, 200);
          }
        };

        video.addEventListener("loadeddata", onReady, { once: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [stop, captureFrame],
  );

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices || window.isSecureContext === false) return;
    let mounted = true;
    navigator.mediaDevices
      .enumerateDevices()
      .then((infos) => {
        const videos = infos.filter((d) => d.kind === "videoinput");
        const list = videos.map((d, i) => ({
          id: String(i),
          name: d.label || `Camera ${i + 1}`,
        }));
        if (!mounted) return;
        setDevices(list);
        deviceIdsRef.current = videos.map((d) => d.deviceId);
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
      stop();
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
    };
  }, [stop]);

  return {
    devices,
    selectedIndex,
    setSelectedIndex: (index: number) => {
      setSelectedIndexState(index);
      setEnabled(true);
    },
    frame,
    error,
    enabled,
    setEnabled,
    videoStream,
    running,
  };
}
