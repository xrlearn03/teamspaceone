import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [frame, setFrame] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [running, setRunning] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const decodingRef = useRef(false);
  const lastPreviewAtRef = useRef(0);

  useEffect(() => {
    // Create an off-screen canvas once and expose its capture stream.
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    canvasRef.current = canvas;
    try {
      const stream = canvas.captureStream(30);
      setVideoStream(stream);
    } catch {
      // captureStream not supported; fallback later.
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    invoke<NativeDevice[]>("list-cameras")
      .then((found) => {
        if (!mounted) return;
        setDevices(found);
        if (found.length > 0) {
          const index = Number(found[0].id);
          setSelectedIndex(Number.isNaN(index) ? 0 : index);
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

  // Draw an emitted base64 frame onto the canvas so captureStream sees it.
  // Frames are dropped while a decode is still in flight — that bounds latency
  // (the video always tracks the newest frame) instead of queuing stale frames.
  const drawFrame = useCallback((dataUrl: string) => {
    const canvas = canvasRef.current;
    if (!canvas || decodingRef.current) return;
    decodingRef.current = true;
    const img = new Image();
    img.onload = () => {
      decodingRef.current = false;
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
    };
    img.onerror = () => {
      decodingRef.current = false;
    };
    img.src = dataUrl;
  }, []);

  const stop = useCallback(() => {
    unlistenRef.current?.();
    unlistenRef.current = null;
    decodingRef.current = false;
    setFrame(null);
    setRunning(false);
    void invoke("stop-camera").catch(() => {});
  }, []);

  const start = useCallback(
    async (index: number) => {
      if (Number.isNaN(index)) return;
      setError(null);
      setFrame(null);
      setRunning(false);
      stop();
      try {
        // The Rust capture thread emits "camera-frame" events at camera rate;
        // subscribe before starting so no early frames are missed.
        unlistenRef.current = await listen<string>("camera-frame", (event) => {
          const payload = event.payload;
          // The video canvas gets every frame; the preview <img> is driven by
          // React state, so it's throttled to avoid re-render churn.
          drawFrame(payload);
          const now = Date.now();
          if (now - lastPreviewAtRef.current >= 100) {
            lastPreviewAtRef.current = now;
            setFrame(payload);
          }
        });
        await invoke("start-camera", { index });
        setRunning(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [stop, drawFrame],
  );

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

  // Stop native capture and the canvas stream tracks on unmount.
  useEffect(() => {
    return () => {
      stop();
      videoStream?.getVideoTracks().forEach((t) => t.stop());
    };
  }, [stop, videoStream]);

  return {
    devices,
    selectedIndex,
    setSelectedIndex: (index: number) => {
      setSelectedIndex(index);
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
