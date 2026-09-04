import { Reveal } from "./Reveal";

function AppVisual() {
  return (
    <img
      src="/assets/app-AI.png"
      alt="Teamspace One AI Assistant"
      className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 shadow-2xl"
    />
  );
}

export function Collaboration() {
  return (
    <section className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Your team, connected in one place.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">
              Whether you're working across departments, managing projects, or
              staying connected with your organization, Teamspace One keeps
              everyone aligned.
            </p>
          </div>
        </Reveal>
        <Reveal delay={200} className="mt-14">
          <AppVisual />
        </Reveal>
      </div>
    </section>
  );
}
