import { Quote } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

const testimonials = [
  {
    quote:
      "Teamspace One replaced three separate tools for us. Everything from messaging to file sharing lives in one place, and the team actually enjoys using it.",
    name: "Sarah Chen",
    role: "VP of Operations, TechFlow",
    initials: "SC",
    color: "bg-emerald-500",
  },
  {
    quote:
      "The voice and video quality is noticeably better than our old stack, and onboarding new hires takes minutes instead of days.",
    name: "Marcus Adeyemi",
    role: "IT Director, GlobalSync",
    initials: "MA",
    color: "bg-violet-500",
  },
  {
    quote:
      "Finally a workspace that scales with our organization without forcing us into a rigid structure. The permissions and HRMS integration are a huge win.",
    name: "Elena Rostova",
    role: "Head of People, BuildScale",
    initials: "ER",
    color: "bg-rose-500",
  },
];

export function Testimonials() {
  return (
    <section className="hidden relative overflow-hidden bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center" direction="up">
          <SectionBadge>Testimonials</SectionBadge>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Loved by the teams that use it every day.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} direction="up" delay={i * 100}>
              <div className="relative flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-600/5">
                <Quote className="h-8 w-8 text-brand-200" strokeWidth={1.5} />
                <p className="mt-4 flex-1 text-base leading-relaxed text-slate-600">
                  “{t.quote}”
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white ${t.color}`}
                  >
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {t.name}
                    </p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
