import {
  Building2,
  Folder,
  MessagesSquare,
  Users,
  Video,
  LayoutGrid,
} from "lucide-react";
import { Reveal } from "./Reveal";

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
    <section id="features" className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Built for the way modern teams work.
            </h2>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 80}>
              <div className="group h-full rounded-2xl border border-slate-200 bg-white p-7 transition-all duration-200 hover:-translate-y-1 hover:border-brand-300 hover:shadow-lg hover:shadow-brand-600/5">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                  <feature.icon className="h-5.5 w-5.5" strokeWidth={1.8} />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {feature.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
