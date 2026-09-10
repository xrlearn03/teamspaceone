import { ArrowRight } from "lucide-react";
import { DownloadButtons } from "./DownloadButtons";
import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-ink-950 pt-32 pb-20 sm:pt-40 sm:pb-28"
    >
      {/* Brand glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 60% at 50% 0%, rgba(1,112,251,0.28), transparent 65%), radial-gradient(40% 50% at 85% 100%, rgba(122,83,237,0.22), transparent 70%)",
        }}
      />

      {/* Decorative floating blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 top-20 h-80 w-80 rounded-full bg-brand-600/15 blur-3xl animate-float"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full bg-violet-brand/15 blur-3xl animate-float-delayed"
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal direction="up">
            <SectionBadge>One workspace. Every team.</SectionBadge>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Work together without the{" "}
              <span className="relative inline-block text-white">
                tool sprawl
                <svg
                  className="absolute -bottom-2 left-0 w-full text-brand-500"
                  viewBox="0 0 300 12"
                  fill="none"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M2 8c60-4 180-8 296 0"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300">
              Teamspace One brings communication, collaboration, and shared work
              together in a single organized desktop workspace.
            </p>
          </Reveal>

          <Reveal direction="up" delay={150}>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <DownloadButtons variant="dark" />
              <a
                href="#features"
                className="group inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white transition-colors hover:text-brand-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
              >
                Explore features
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
          </Reveal>

          <Reveal direction="scale" delay={300}>
            <img
              src="/assets/teamspaceone-splash.png"
              alt="Teamspace One workspace overview"
              className="mt-16 w-full"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
