import { DownloadButtons } from "./DownloadButtons";
import { Reveal } from "./Reveal";

export function DownloadCTA() {
  return (
    <section id="download" className="relative overflow-hidden bg-ink-950 py-20 sm:py-28">
      {/* Brand glow, consistent with hero */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 60% at 50% 0%, rgba(1,112,251,0.25), transparent 65%), radial-gradient(40% 50% at 85% 100%, rgba(122,83,237,0.2), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Bring your team together.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            Start collaborating with Teamspace One today.
          </p>
        </Reveal>
        <Reveal delay={150}>
          <DownloadButtons variant="dark" className="mt-10 justify-center" />
        </Reveal>
      </div>
    </section>
  );
}
