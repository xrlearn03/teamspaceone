import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

const points = [
  "AI-led structured candidate interviews",
  "Real-time skill and culture-fit scoring",
  "Automated notes and interview summaries",
  "Faster, more consistent hiring decisions",
];

const slides = [
  {
    id: "ai-1",
    src: "/assets/teamspaceone-AI.jpg",
    alt: "Teamspace One AI Assistant",
  },
  {
    id: "ai-2",
    src: "/assets/teamspaceone-AI-1.jpg",
    alt: "Teamspace One AI interview",
  },
  {
    id: "ai-3",
    src: "/assets/teamspaceone-AI-2.jpg",
    alt: "Teamspace One AI candidate chat",
  },
];

function AutoImageCarousel() {
  const [active, setActive] = useState(0);
  const [errored, setErrored] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const current = slides[active];
  const isError = errored[current.id] || !current.src;

  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-2xl">
      {isError ? (
        <div className="flex aspect-[5/3] w-full items-center justify-center text-slate-500">
          <span className="text-lg font-semibold">{current.alt}</span>
        </div>
      ) : (
        <img
          src={current.src}
          alt={current.alt}
          onError={() =>
            setErrored((prev) => ({ ...prev, [current.id]: true }))
          }
          className="w-full aspect-[5/3] object-cover"
        />
      )}
    </div>
  );
}

export function AIInterview() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal direction="left" className="order-2 lg:order-1">
            <AutoImageCarousel />
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
