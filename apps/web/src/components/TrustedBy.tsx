import { Building2, Boxes, Globe2, Landmark, Rocket, Shield } from "lucide-react";
import { Reveal } from "./Reveal";

const brands = [
  { name: "TechFlow", icon: Rocket },
  { name: "GlobalSync", icon: Globe2 },
  { name: "BuildScale", icon: Building2 },
  { name: "SecureBase", icon: Shield },
  { name: "ModularAI", icon: Boxes },
  { name: "CivicStack", icon: Landmark },
];

export function TrustedBy() {
  return (
    <section className="hidden relative overflow-hidden border-y border-slate-100 bg-slate-50/50 py-10 sm:py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal direction="scale">
          <p className="text-center text-sm font-semibold uppercase tracking-wide text-slate-500">
            Trusted by fast-moving teams everywhere
          </p>
        </Reveal>
      </div>

      <Reveal className="mt-6" direction="up" delay={100}>
        <div className="relative flex overflow-hidden">
          <div className="animate-marquee flex shrink-0 items-center gap-10 pr-10 sm:gap-16 sm:pr-16">
            {[...brands, ...brands].map((brand, i) => (
              <div
                key={`${brand.name}-${i}`}
                className="flex items-center gap-2.5 text-slate-400"
              >
                <brand.icon className="h-6 w-6" strokeWidth={1.5} />
                <span className="whitespace-nowrap text-base font-semibold">
                  {brand.name}
                </span>
              </div>
            ))}
          </div>
          <div className="animate-marquee flex shrink-0 items-center gap-10 pr-10 sm:gap-16 sm:pr-16" aria-hidden="true">
            {[...brands, ...brands].map((brand, i) => (
              <div
                key={`${brand.name}-dup-${i}`}
                className="flex items-center gap-2.5 text-slate-400"
              >
                <brand.icon className="h-6 w-6" strokeWidth={1.5} />
                <span className="whitespace-nowrap text-base font-semibold">
                  {brand.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
