import { DownloadButtons } from "./DownloadButtons";
import { Reveal } from "./Reveal";

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-ink-950 pt-32 pb-20 sm:pt-40 sm:pb-28"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 60% at 50% 0%, rgba(1,112,251,0.25), transparent 65%), radial-gradient(40% 50% at 85% 100%, rgba(122,83,237,0.2), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Reveal>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              One workspace. <span className="text-brand-500">Every team.</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              Teamspace One brings communication, collaboration, and shared
              work together in a single organized desktop workspace.
            </p>
          </Reveal>
          <Reveal delay={150}>
            <div className="mt-10 flex justify-center">
              <DownloadButtons variant="dark" />
            </div>
          </Reveal>
          <Reveal delay={300}>
            <img
              src="/assets/hero-banner.jpg"
              alt="Teamspace One workspace overview"
              className="mt-16 w-full rounded-2xl shadow-2xl ring-1 ring-white/10"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
