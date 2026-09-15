import { useEffect, useRef, useState } from "react";
import { getVisemeAt, VISEME_PRESETS, type VisemeWeights } from "./visemes";
import type { SpeechBoundary } from "./use-speech";

export interface LipSyncInput {
  /** True while the avatar is producing speech audio. */
  speaking: boolean;
  /** The exact text being spoken. */
  text: string;
  /** Word boundary events from the speech engine (charIndex + elapsedTime). */
  wordBoundaries: SpeechBoundary[];
  /** Optional 0-1 audio energy level for hybrid volume influence. */
  audioLevel?: number;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothWeights(
  current: VisemeWeights,
  target: VisemeWeights,
  factor: number,
): VisemeWeights {
  const keys = new Set([
    ...Object.keys(current),
    ...Object.keys(target),
  ]) as Set<keyof VisemeWeights>;
  const next: VisemeWeights = {};
  keys.forEach((k) => {
    next[k] = lerp(current[k] ?? 0, target[k] ?? 0, factor);
  });
  return next;
}

/**
 * Estimate which character is currently being spoken from word boundary
 * events.  Within a word we linearly interpolate between the boundaries;
 * after the last boundary we fall back to a ~12 chars/second rate.
 */
function estimateCharIndex(
  text: string,
  boundaries: SpeechBoundary[],
  elapsedMs: number,
): number {
  if (!text) return 0;

  const sorted = [...boundaries].sort((a, b) => a.elapsedTime - b.elapsedTime);
  if (sorted.length === 0) {
    const charsPerMs = 12 / 1000;
    return Math.min(Math.floor(elapsedMs * charsPerMs), text.length - 1);
  }

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (elapsedMs < next.elapsedTime) {
      const wordText = text.slice(prev.charIndex, next.charIndex);
      const duration = next.elapsedTime - prev.elapsedTime;
      const progress = Math.max(0, Math.min(1, (elapsedMs - prev.elapsedTime) / duration));
      const offset = Math.floor(progress * wordText.length);
      return prev.charIndex + offset;
    }
  }

  const last = sorted[sorted.length - 1];
  const charsPerMs = 12 / 1000;
  return Math.min(
    last.charIndex + Math.floor((elapsedMs - last.elapsedTime) * charsPerMs),
    text.length - 1,
  );
}

/**
 * Returns a frame-updated set of facial blendshape weights that approximate
 * the mouth pose for the currently spoken phoneme.
 *
 * When a real audio analyzer is available, pass `audioLevel` to add a
 * volume-driven jaw opening influence on top of the phoneme heuristic.
 */
export function useLipSync(input: LipSyncInput): VisemeWeights {
  const { speaking, text, wordBoundaries, audioLevel = 0 } = input;
  const [weights, setWeights] = useState<VisemeWeights>({});
  const weightsRef = useRef<VisemeWeights>({});
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (speaking) {
      startTimeRef.current = performance.now();
    }
  }, [speaking, text]);

  useEffect(() => {
    let raf = 0;

    const loop = () => {
      const neutral: VisemeWeights = { viseme_sil: 1 };

      if (!speaking || !text) {
        weightsRef.current = smoothWeights(weightsRef.current, neutral, 0.08);
        setWeights(weightsRef.current);
        raf = requestAnimationFrame(loop);
        return;
      }

      const now = performance.now() - startTimeRef.current;
      const charIndex = estimateCharIndex(text, wordBoundaries, now);
      const viseme = getVisemeAt(text, charIndex);
      const preset = VISEME_PRESETS[viseme] ?? neutral;

      let target: VisemeWeights = { ...preset };
      if (audioLevel > 0) {
        const energyBoost = audioLevel * 0.35;
        target = {
          ...target,
          jawOpen: Math.min(1, (target.jawOpen ?? 0) * (1 + audioLevel * 0.4) + energyBoost),
        };
      }

      weightsRef.current = smoothWeights(weightsRef.current, target, 0.25);
      setWeights(weightsRef.current);

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speaking, text, wordBoundaries, audioLevel]);

  return weights;
}
