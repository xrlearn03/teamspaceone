import { Layers, Users, Building2 } from "lucide-react";
import { Reveal } from "./Reveal";

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
    <section id="why" className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Less switching. More doing.
            </h2>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-10 md:grid-cols-3">
          {points.map((point, i) => (
            <Reveal key={point.title} delay={i * 120}>
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-600/25">
                  <point.icon className="h-6 w-6" strokeWidth={1.8} />
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
