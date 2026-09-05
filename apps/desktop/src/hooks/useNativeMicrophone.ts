import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

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

function base64ToFloat32Array(b64: string): Float32Array {
  if (!b64) return new Float32Array(0);
  const binary = atob(b64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    u8[i] = binary.charCodeAt(i);
  }
  return new Float32Array(u8.buffer);
}

export function useNativeMicrophone(): UseNativeMicrophoneReturn {
  const [devices, setDevices] = useState<NativeAudioDevice[]>([]);
  const [selectedIndex, setSelectedIndexState] = useState<number | null>(null);
  const [enabled, setEnabledState] = useState(true);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const queueRef = useRef<number[]>([]);
  const intervalRef = useRef<number | null>(null);
  const formatRef = useRef<{ sampleRate: number; channels: number } | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    invoke<NativeAudioDevice[]>("list-microphones")
      .then((found) => {
        if (!mounted) return;
        setDevices(found);
        if (found.length > 0) {
          const idx = Number(found[0].id);
          setSelectedIndexState(Number.isNaN(idx) ? 0 : idx);
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

  const stop = useCallback(() => {
    runningRef.current = false;
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    queueRef.current = [];
    sourceRef.current?.stop();
    sourceRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    destinationRef.current = null;
    contextRef.current?.close().catch(() => {});
    contextRef.current = null;
    setAudioStream(null);
    setError(null);
    void invoke("stop-microphone").catch(() => {});
  }, []);

  const start = useCallback(
    async (index: number) => {
      if (runningRef.current) {
        stop();
      }
      runningRef.current = true;
      setError(null);

      try {
        const format = await invoke<{ sample_rate: number; channels: number }>("start-microphone", { index });
        formatRef.current = { sampleRate: format.sample_rate, channels: format.channels };

        const ctx = new AudioContext({ sampleRate: format.sample_rate });
        contextRef.current = ctx;

        const bufferSize = 4096;
        const channels = format.channels;
        const processor = ctx.createScriptProcessor(bufferSize, channels, channels);
        processorRef.current = processor;

        const destination = ctx.createMediaStreamDestination();
        destinationRef.current = destination;

        // Drive the script processor with a looping silent input so it fires onaudioprocess.
        const silent = ctx.createBuffer(channels, 1, format.sample_rate);
        const source = ctx.createBufferSource();
        source.buffer = silent;
        source.loop = true;
        sourceRef.current = source;

        source.connect(processor);
        processor.connect(destination);
        source.start();

        processor.onaudioprocess = (e) => {
          const output = e.outputBuffer;
          const frames = output.length;
          const needed = frames * channels;
          const queue = queueRef.current;
          for (let c = 0; c < channels; c++) {
            const out = output.getChannelData(c);
            for (let i = 0; i < frames; i++) {
              if (i * channels + c < queue.length) {
                out[i] = queue[i * channels + c];
              } else {
                out[i] = 0;
              }
            }
          }
          queueRef.current = queue.slice(needed);
        };

        setAudioStream(destination.stream);

        intervalRef.current = window.setInterval(async () => {
          if (!runningRef.current) return;
          try {
            const b64 = await invoke<string>("get-microphone-chunk", { chunk_size: bufferSize * channels });
            if (b64) {
              const samples = base64ToFloat32Array(b64);
              queueRef.current.push(...Array.from(samples));
            }
          } catch (err) {
            // Ignore transient chunk errors.
          }
        }, 20);

        await ctx.resume().catch(() => {});
      } catch (err) {
        runningRef.current = false;
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

  useEffect(() => {
    if (!enabled || selectedIndex === null) {
      return;
    }
    start(selectedIndex);
    return () => {
      stop();
    };
  }, [enabled, selectedIndex, start, stop]);

  const resumeContext = useCallback(async () => {
    if (contextRef.current?.state === "suspended") {
      await contextRef.current.resume().catch(() => {});
    }
  }, []);

  useEffect(() => {
    return () => {
      stop();
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
