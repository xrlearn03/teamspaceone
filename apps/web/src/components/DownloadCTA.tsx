import { Check } from "lucide-react";
import { DownloadButtons } from "./DownloadButtons";
import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

const trustPoints = ["No credit card required", "Free for small teams", "Native macOS & Windows apps"];

export function DownloadCTA() {
  return (
    <section id="download" className="relative overflow-hidden bg-ink-950 py-20 sm:py-28">
      {/* Brand glow, consistent with hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 60% at 50% 0%, rgba(1,112,251,0.28), transparent 65%), radial-gradient(40% 50% at 15% 100%, rgba(122,83,237,0.22), transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal direction="up">
          <SectionBadge>Get started</SectionBadge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Bring your team together.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Start collaborating with Teamspace One today.
          </p>
        </Reveal>

        <Reveal direction="up" delay={150}>
          <DownloadButtons variant="dark" className="mt-10 justify-center" />
        </Reveal>

        <Reveal direction="up" delay={250}>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-sm text-slate-400">
            {trustPoints.map((point) => (
              <span key={point} className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-400" strokeWidth={2.5} />
                {point}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
