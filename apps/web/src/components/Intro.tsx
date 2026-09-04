import { ArrowRight, Folder, MessageSquare, Video } from "lucide-react";
import { Reveal } from "./Reveal";

/** Abstract workspace visual built with CSS — intentionally not a product screenshot. */
function WorkspaceVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-[4/3] w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-ink-900 via-ink-800 to-brand-900 shadow-2xl"
    >
      {/* Soft brand glows */}
      <div className="absolute -top-16 -right-16 h-64 w-64 rounded-full bg-brand-500/25 blur-3xl" />
      <div className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-violet-brand/25 blur-3xl" />

      {/* Abstract panels */}
      <div className="absolute top-[12%] left-[8%] w-[46%] rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-brand-300" />
          <div className="h-2 w-16 rounded-full bg-white/40" />
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-2 w-full rounded-full bg-white/25" />
          <div className="h-2 w-4/5 rounded-full bg-white/25" />
          <div className="h-2 w-3/5 rounded-full bg-brand-400/60" />
        </div>
      </div>

      <div className="absolute top-[22%] right-[8%] w-[34%] rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-violet-300" />
          <div className="h-2 w-12 rounded-full bg-white/40" />
        </div>
        <div className="mt-3 flex -space-x-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-8 w-8 rounded-full border-2 border-white/20"
              style={{
                background: `linear-gradient(135deg, ${
                  ["#0aa8fd", "#0170fb", "#7a53ed", "#4397fe"][i]
                }, #0233ca)`,
              }}
            />
          ))}
        </div>
      </div>

      <div className="absolute bottom-[14%] left-[16%] w-[56%] rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Folder className="h-4 w-4 text-brand-300" />
          <div className="h-2 w-20 rounded-full bg-white/40" />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="h-8 rounded-lg bg-brand-500/40" />
          <div className="h-8 rounded-lg bg-white/20" />
          <div className="h-8 rounded-lg bg-violet-brand/40" />
        </div>
      </div>
    </div>
  );
}

export function Intro() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
                Everything your team needs to work together.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                Teamspace One brings communication, collaboration, and shared
                resources into one organized workspace—so your team can spend
                less time switching between tools and more time getting work
                done.
              </p>
              <a
                href="#features"
                className="group mt-7 inline-flex items-center gap-2 text-base font-semibold text-brand-600 transition-colors hover:text-brand-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded"
              >
                Explore what's inside
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
          </Reveal>
          <Reveal delay={150}>
            <WorkspaceVisual />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
