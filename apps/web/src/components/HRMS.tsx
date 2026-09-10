import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

const points = [
  "Payroll, attendance, and leave in one place",
  "Automated onboarding and offboarding workflows",
  "Performance reviews and org-wide analytics",
  "Direct sync with workspace roles and permissions",
];

const slides = [
  {
    id: "analytics",
    src: "/assets/teamspaceone-hrms-analytics.png",
    alt: "Teamspace One HRMS analytics",
  },
  {
    id: "departments",
    src: "/assets/teamspaceone-hrms-department.png",
    alt: "Teamspace One HRMS departments",
  },
  {
    id: "employees",
    src: "/assets/teamspaceone-hrms-employee.png",
    alt: "Teamspace One HRMS employees",
  },
];

function AutoImageCarousel() {
  const [active, setActive] = useState(0);
  const [errored, setErrored] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const id = setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const current = slides[active];
  const isError = errored[current.id] || !current.src;

  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden">
      {isError ? (
        <div className="flex aspect-[5/3] w-full items-center justify-center text-slate-500">
          <span className="text-lg font-semibold">{current.alt}</span>
        </div>
      ) : (
        <img
          src={current.src}
          alt={current.alt}
          onError={() =>
            setErrored((prev) => ({ ...prev, [current.id]: true }))
          }
          decoding="async"
          className="w-full aspect-[5/3] object-cover"
        />
      )}
    </div>
  );
}

export function HRMS() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal direction="right" className="order-2">
            <AutoImageCarousel />
          </Reveal>

          <Reveal direction="left" delay={150} className="order-1">
            <div>
              <SectionBadge>HRMS</SectionBadge>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
                Manage your people from hire to retire.
              </h2>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                Teamspace One’s built-in HRMS connects employee data, payroll,
                and performance with the workspace—so HR and operations stay in
                sync.
              </p>

              <ul className="mt-8 space-y-4">
                {points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-3 text-slate-700"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span className="text-base leading-7">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
