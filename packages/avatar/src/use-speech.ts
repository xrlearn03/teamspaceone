import { useCallback, useEffect, useRef, useState } from "react";

export interface SpeechBoundary {
  charIndex: number;
  charLength: number;
  elapsedTime: number;
  name: "word" | "sentence";
}

export interface UseSpeechResult {
  supported: boolean;
  speaking: boolean;
  paused: boolean;
  wordBoundaries: SpeechBoundary[];
  speak: (text: string) => void;
  cancel: () => void;
}

/**
 * Browser SpeechSynthesis wrapper that tracks word-level timing events.
 *
 * The word boundaries are used by `useLipSync` to drive facial blendshapes.
 * This hook is a deliberate fallback: swapping in ElevenLabs later only
 * requires replacing the audio source and timing stream.
 */
export function useSpeech(): UseSpeechResult {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [wordBoundaries, setWordBoundaries] = useState<SpeechBoundary[]>([]);
  const boundariesRef = useRef<SpeechBoundary[]>([]);

  const cancel = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
    boundariesRef.current = [];
    setWordBoundaries([]);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;

      window.speechSynthesis.cancel();
      boundariesRef.current = [];
      setWordBoundaries([]);

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;

      utterance.onboundary = (event) => {
        const boundary: SpeechBoundary = {
          charIndex: event.charIndex,
          charLength: event.charLength,
          elapsedTime: event.elapsedTime,
          name: event.name === "sentence" ? "sentence" : "word",
        };
        boundariesRef.current = [...boundariesRef.current, boundary];
        setWordBoundaries(boundariesRef.current);
      };

      utterance.onstart = () => {
        setSpeaking(true);
      };
      utterance.onpause = () => setPaused(true);
      utterance.onresume = () => setPaused(false);
      utterance.onend = () => {
        setSpeaking(false);
        setPaused(false);
      };
      utterance.onerror = () => {
        setSpeaking(false);
        setPaused(false);
      };

      window.speechSynthesis.speak(utterance);
    },
    [supported],
  );

  useEffect(() => cancel, [cancel]);

  return { supported, speaking, paused, wordBoundaries, speak, cancel };
}
