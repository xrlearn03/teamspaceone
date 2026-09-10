import {
  ArrowRight,
  Building2,
  Folder,
  MessagesSquare,
  Users,
  Video,
  LayoutGrid,
} from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

const features = [
  {
    icon: MessagesSquare,
    title: "Team Communication",
    description:
      "Keep conversations organized and connected in one shared workspace.",
  },
  {
    icon: Users,
    title: "Shared Workspaces",
    description:
      "Give every team and organization a dedicated place to collaborate.",
  },
  {
    icon: Folder,
    title: "File Sharing",
    description:
      "Share important files and resources without losing track of what matters.",
  },
  {
    icon: Video,
    title: "Voice & Video",
    description:
      "Connect with your team through seamless voice and video communication.",
  },
  {
    icon: LayoutGrid,
    title: "Organized Collaboration",
    description:
      "Keep projects, conversations, and shared work easy to find.",
  },
  {
    icon: Building2,
    title: "Built for Organizations",
    description:
      "Support multiple teams and organizations with a workspace designed to scale.",
  },
];

export function Features() {
  return (
    <section id="features" className="relative overflow-hidden bg-slate-50 py-20 sm:py-28">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute right-0 top-0 h-[500px] w-[500px] translate-x-1/3 rounded-full bg-brand-100/30 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center" direction="up">
          <SectionBadge>Core features</SectionBadge>
          <h2 className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Built for the way modern teams work.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            A complete toolkit that replaces scattered apps with one coherent workspace.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <Reveal key={feature.title} direction="up" delay={i * 80}>
              <div className="group h-full rounded-2xl border border-slate-200 bg-white p-7 transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-600/5">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                  <feature.icon className="h-6 w-6" strokeWidth={1.6} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {feature.description}
                </p>
                <div className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 opacity-0 transition-all group-hover:opacity-100">
                  Learn more
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
