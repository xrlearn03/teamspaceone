import { ArrowRight, Check } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

const highlights = [
  "Real-time messaging, voice, and video in one app",
  "Organized workspaces with granular permissions",
  "Built-in file storage, sharing, and preview",
  "HRMS, projects, and calendar connected by default",
];

function AppVisual() {
  return (
    <img
      src="/assets/app-home.png"
      alt="Teamspace One home screen"
      className="mx-auto w-full max-w-2xl rounded-2xl border border-slate-200 shadow-2xl"
    />
  );
}

export function Intro() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-40 top-1/2 h-[600px] w-[600px] -translate-y-1/2 rounded-full bg-brand-50/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal direction="left">
            <div>
              <SectionBadge>Inside the workspace</SectionBadge>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
                Everything your team needs to work together.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                Teamspace One brings communication, collaboration, and shared
                resources into one organized workspace—so your team can spend
                less time switching between tools and more time getting work
                done.
              </p>

              <ul className="mt-8 space-y-4">
                {highlights.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-slate-700"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span className="text-base leading-7">{item}</span>
                  </li>
                ))}
              </ul>

              <a
                href="#features"
                className="group mt-8 inline-flex items-center gap-2 rounded-lg text-base font-semibold text-brand-600 transition-colors hover:text-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
              >
                Explore what's inside
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
          </Reveal>

          <Reveal direction="right" delay={150}>
            <AppVisual />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
