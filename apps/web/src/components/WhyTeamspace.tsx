import { Layers, Users, Building2 } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

const points = [
  {
    icon: Layers,
    title: "One workspace",
    description:
      "Keep your team's conversations, collaboration, and shared resources connected.",
  },
  {
    icon: Users,
    title: "Built for teams",
    description:
      "Create an organized environment where people can work together efficiently.",
  },
  {
    icon: Building2,
    title: "Ready for your organization",
    description:
      "Designed to support multiple teams and the way modern organizations work.",
  },
];

export function WhyTeamspace() {
  return (
    <section id="why" className="relative overflow-hidden bg-slate-50 py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute left-0 bottom-0 h-[500px] w-[500px] -translate-x-1/3 rounded-full bg-violet-brand/5 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center" direction="up">
          <SectionBadge>Why Teamspace One</SectionBadge>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Less switching. More doing.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            A workspace designed to remove friction and keep your organization moving.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {points.map((point, i) => (
            <Reveal key={point.title} direction="up" delay={i * 120}>
              <div className="group text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/25 transition-transform duration-200 group-hover:-translate-y-1">
                  <point.icon className="h-7 w-7" strokeWidth={1.6} />
                </div>
                <h3 className="mt-6 text-xl font-semibold text-slate-900">
                  {point.title}
                </h3>
                <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-slate-600">
                  {point.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
