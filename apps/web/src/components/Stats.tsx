import { Globe2, Headphones, Users, Zap } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

const stats = [
  { value: "10k+", label: "Active teams", icon: Users },
  { value: "99.9%", label: "Uptime SLA", icon: Zap },
  { value: "50+", label: "Countries", icon: Globe2 },
  { value: "24/7", label: "Support", icon: Headphones },
];

export function Stats() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-brand-50/50 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center" direction="up">
          <SectionBadge>By the numbers</SectionBadge>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Built for teams that move fast.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} direction="up" delay={i * 80}>
              <div className="group rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-600/5">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                  <stat.icon className="h-6 w-6" strokeWidth={1.6} />
                </div>
                <p className="mt-5 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                  {stat.value}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {stat.label}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
