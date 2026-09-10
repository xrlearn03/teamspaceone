import { Check } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

const points = [
  "AI-led structured candidate interviews",
  "Real-time skill and culture-fit scoring",
  "Automated notes and interview summaries",
  "Faster, more consistent hiring decisions",
];

export function AIInterview() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal direction="left" className="order-2 lg:order-1">
            <img
              src="/assets/app-AI.png"
              alt="Teamspace One AI Interview"
              className="mx-auto w-full max-w-4xl aspect-[5/3] object-cover rounded-2xl border border-slate-200 shadow-2xl"
            />
          </Reveal>

          <Reveal direction="right" delay={150} className="order-1 lg:order-2">
            <div>
              <SectionBadge>AI Interview</SectionBadge>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
                Hire better with AI interviews.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                Screen and evaluate candidates at scale with AI-powered
                interviews that keep the process fair, fast, and consistent.
              </p>

              <ul className="mt-8 space-y-4">
                {points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 text-slate-700"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span className="text-base leading-7">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
