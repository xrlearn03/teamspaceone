"use client";

import { useEffect, useMemo, useState } from "react";
import { AiAvatar3D, useLipSync } from "@teamspace-one/avatar";

const VISAMES = ["sil", "aa", "E", "I", "O", "U", "PP", "SS", "TH", "FF"] as const;

const VISEME_TEXT: Record<(typeof VISAMES)[number], string> = {
  sil: " ",
  aa: "Aaaaaaaaa",
  E: "Eeeeeeeeee",
  I: "Iiiiiiiiii",
  O: "Ooooooooo",
  U: "Uuuuuuuuu",
  PP: "Mmm mmm mmm",
  SS: "Ssssssssss",
  TH: "Ththththth",
  FF: "Ffffffffff",
};

export default function TestAvatarPage() {
  const [index, setIndex] = useState(0);
  const [speaking, setSpeaking] = useState(true);
  const viseme = VISAMES[index];
  const text = VISEME_TEXT[viseme];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIndex((i) => (i + 1) % VISAMES.length);
    }, 1200);
    return () => window.clearInterval(interval);
  }, []);

  const wordBoundaries = useMemo(
    () => [
      { charIndex: 0, charLength: 0, elapsedTime: 0, name: "word" as const },
      { charIndex: text.length, charLength: 0, elapsedTime: 1000, name: "word" as const },
    ],
    [text],
  );

  const lipSyncWeights = useLipSync({
    speaking,
    text,
    wordBoundaries,
  });

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-white">
      <div className="flex items-center justify-between px-6 py-4">
        <h1 className="text-lg font-bold">Avatar 3D Test</h1>
        <div className="text-sm text-slate-400">viseme: {viseme}</div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <AiAvatar3D
          url="/assets/ai-interviewer.glb?v=4"
          weights={lipSyncWeights}
          speaking={speaking}
          fallback={<div className="flex h-full items-center justify-center text-slate-400">Loading 3D avatar…</div>}
        />
      </div>
      <div className="border-t border-slate-800 p-4">
        <div className="flex flex-wrap gap-2">
          {VISAMES.map((v, i) => (
            <button
              key={v}
              onClick={() => setIndex(i)}
              className={`rounded px-3 py-1 text-xs ${i === index ? "bg-indigo-600" : "bg-slate-800"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={() => setSpeaking((s) => !s)}
            className="rounded bg-slate-800 px-3 py-1 text-xs hover:bg-slate-700"
          >
            {speaking ? "Pause" : "Play"}
          </button>
          <span className="text-xs text-slate-400">
            Open the browser console to check whether the GLB loaded and which morph targets were found.
          </span>
        </div>
      </div>
    </div>
  );
}
