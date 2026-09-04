import { ArrowRight } from "lucide-react";
import { Reveal } from "./Reveal";

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
            <AppVisual />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
