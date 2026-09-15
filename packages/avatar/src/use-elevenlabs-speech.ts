import { useCallback, useEffect, useRef, useState } from "react";
import type { SpeechBoundary } from "./use-speech";

export interface ElevenLabsSpeechOptions {
  /**
   * Fetches a base64-encoded audio URL for the given text.
   * Should return a data URL the browser can play (e.g. data:audio/mpeg;base64,...).
   */
  fetchAudio: (text: string) => Promise<{ audioUrl: string }>;
}

export interface UseElevenLabsSpeechResult {
  speaking: boolean;
  wordBoundaries: SpeechBoundary[];
  audioLevel: number;
  speak: (text: string) => void;
  cancel: () => void;
}

/**
 * Plays backend-generated ElevenLabs audio and emits the timing/energy data
 * the `useLipSync` hook needs.  The word boundaries are synthetic because
 * ElevenLabs does not expose word-level timestamps; we linearly map the text
 * across the audio duration and use the Web Audio analyzer for volume-driven
 * jaw emphasis.
 */
export function useElevenLabsSpeech(options: ElevenLabsSpeechOptions): UseElevenLabsSpeechResult {
  const [speaking, setSpeaking] = useState(false);
  const [wordBoundaries, setWordBoundaries] = useState<SpeechBoundary[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const textRef = useRef("");

  const cancel = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    audioRef.current?.pause();
    audioRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    analyserRef.current = null;
    setSpeaking(false);
    setAudioLevel(0);
    setWordBoundaries([]);
    textRef.current = "";
  }, []);

  const stopAnalyser = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    setAudioLevel(0);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      cancel();
      textRef.current = text;

      try {
        const { audioUrl } = await options.fetchAudio(text);
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          setSpeaking(true);
        };

        audio.onended = () => {
          setSpeaking(false);
          stopAnalyser();
        };

        audio.onpause = () => {
          setSpeaking(false);
          stopAnalyser();
        };

        audio.onerror = () => {
          setSpeaking(false);
          stopAnalyser();
        };

        audio.onloadedmetadata = () => {
          setWordBoundaries([
            { charIndex: 0, charLength: 0, elapsedTime: 0, name: "word" },
            {
              charIndex: text.length,
              charLength: 0,
              elapsedTime: (audio.duration || text.length * 60 / 1000) * 1000,
              name: "word",
            },
          ]);
        };

        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
        if (AC) {
          const ctx = new AC();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaElementSource(audio);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyser.connect(ctx.destination);
          analyserRef.current = analyser;

          const analyze = () => {
            if (!analyserRef.current) return;
            const data = new Uint8Array(analyserRef.current.frequencyBinCount);
            analyserRef.current.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
            setAudioLevel(avg);
            rafRef.current = requestAnimationFrame(analyze);
          };
          rafRef.current = requestAnimationFrame(analyze);
        }

        await audio.play();
      } catch {
        cancel();
      }
    },
    [cancel, options.fetchAudio, stopAnalyser],
  );

  useEffect(() => cancel, [cancel]);

  return { speaking, wordBoundaries, audioLevel, speak, cancel };
}
