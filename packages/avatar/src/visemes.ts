/**
 * Viseme → morph-target mapping.
 *
 * The GLB uses Oculus-style viseme names (`viseme_aa`, `viseme_PP`, ...).
 * Each preset activates the relevant viseme at full influence and lets the
 * smoothing loop in `useLipSync` decay the others back to zero.
 */

export type Viseme =
  | "sil"
  | "PP"
  | "FF"
  | "TH"
  | "DD"
  | "kk"
  | "CH"
  | "SS"
  | "nn"
  | "RR"
  | "aa"
  | "E"
  | "I"
  | "O"
  | "U";

export interface VisemeWeights {
  [key: string]: number | undefined;
}

export const VISEME_PRESETS: Record<Viseme, VisemeWeights> = {
  sil: { viseme_sil: 1 },
  PP: { viseme_PP: 1 },
  FF: { viseme_FF: 1 },
  TH: { viseme_TH: 1 },
  DD: { viseme_DD: 1 },
  kk: { viseme_kk: 1 },
  CH: { viseme_CH: 1 },
  SS: { viseme_SS: 1 },
  nn: { viseme_nn: 1 },
  RR: { viseme_RR: 1 },
  aa: { viseme_aa: 1 },
  E: { viseme_E: 1 },
  I: { viseme_I: 1 },
  O: { viseme_O: 1 },
  U: { viseme_U: 1 },
};

const DIGRAPH_TO_VISEME: Record<string, Viseme> = {
  th: "TH",
  ch: "CH",
  sh: "CH",
  ng: "nn",
};

const CHAR_TO_VISEME: Record<string, Viseme> = {
  a: "aa",
  e: "E",
  i: "I",
  o: "O",
  u: "U",
  b: "PP",
  m: "PP",
  p: "PP",
  f: "FF",
  v: "FF",
  d: "DD",
  t: "DD",
  n: "nn",
  k: "kk",
  g: "kk",
  q: "kk",
  c: "CH",
  j: "CH",
  s: "SS",
  z: "SS",
  r: "RR",
  l: "RR",
  w: "U",
  y: "I",
};

export function getVisemeForChar(char: string): Viseme | null {
  const lower = char.toLowerCase();
  const digraph = DIGRAPH_TO_VISEME[lower];
  if (digraph) return digraph;
  return CHAR_TO_VISEME[lower] ?? null;
}

export function getVisemeAt(text: string, index: number): Viseme {
  if (index < 0 || index >= text.length) return "sil";
  const lower = text.toLowerCase();
  if (index + 1 < lower.length) {
    const pair = lower.slice(index, index + 2);
    if (DIGRAPH_TO_VISEME[pair]) return DIGRAPH_TO_VISEME[pair];
  }
  return getVisemeForChar(lower[index]) ?? "sil";
}
