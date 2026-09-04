import { Reveal } from "./Reveal";

/**
 * Abstract collaboration visual — connected nodes representing team members,
 * conversations, files, and shared work. Pure CSS, not a product screenshot.
 */
function CollaborationVisual() {
  const nodes = [
    { top: "12%", left: "18%", size: 56, color: "#0aa8fd" },
    { top: "30%", left: "70%", size: 44, color: "#7a53ed" },
    { top: "55%", left: "30%", size: 40, color: "#0170fb" },
    { top: "68%", left: "62%", size: 52, color: "#4397fe" },
    { top: "20%", left: "45%", size: 36, color: "#925af9" },
    { top: "78%", left: "12%", size: 34, color: "#13cbfb" },
  ];

  return (
    <div
      aria-hidden="true"
      className="relative mx-auto aspect-[16/10] w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-ink-950 via-ink-900 to-ink-800 shadow-2xl"
    >
      {/* Connection lines */}
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 62"
        preserveAspectRatio="none"
      >
        <path
          d="M18 12 Q 45 20 70 30 M18 12 Q 30 40 30 55 M70 30 Q 66 50 62 68 M30 55 Q 45 62 62 68 M45 20 Q 57 25 70 30 M12 78 Q 20 66 30 55"
          fill="none"
          stroke="url(#line-grad)"
          strokeWidth="0.35"
          strokeDasharray="1.2 1.2"
        />
        <defs>
          <linearGradient id="line-grad" x1="0" y1="0" x2="100" y2="62" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0aa8fd" />
            <stop offset="1" stopColor="#7a53ed" />
          </linearGradient>
        </defs>
      </svg>

      {/* Team member nodes */}
      {nodes.map((n, i) => (
        <div
          key={i}
          className="absolute flex items-center justify-center rounded-full border border-white/20"
          style={{
            top: n.top,
            left: n.left,
            width: n.size,
            height: n.size,
            background: `radial-gradient(circle at 30% 30%, ${n.color}, #032dc5)`,
            boxShadow: `0 0 24px ${n.color}55`,
          }}
        >
          <svg viewBox="0 0 24 24" fill="rgba(255,255,255,0.9)" className="h-1/2 w-1/2">
            <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z" />
          </svg>
        </div>
      ))}

      {/* Floating mini-cards: conversation + file */}
      <div className="absolute top-[8%] right-[8%] w-[26%] rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-md">
        <div className="space-y-1.5">
          <div className="h-1.5 w-4/5 rounded-full bg-white/35" />
          <div className="h-1.5 w-3/5 rounded-full bg-brand-400/70" />
        </div>
      </div>
      <div className="absolute bottom-[10%] right-[20%] w-[22%] rounded-xl border border-white/10 bg-white/10 p-3 backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-4 rounded bg-violet-brand/70" />
          <div className="h-1.5 flex-1 rounded-full bg-white/35" />
        </div>
      </div>
    </div>
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
          <CollaborationVisual />
        </Reveal>
      </div>
    </section>
  );
}
