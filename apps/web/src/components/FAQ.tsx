import { Reveal } from "./Reveal";
import { SectionBadge } from "./SectionBadge";

const faqs = [
  {
    question: "What platforms does Teamspace One support?",
    answer:
      "We offer native desktop apps for macOS and Windows, with web access available for quick collaboration from any modern browser. Mobile apps are on the roadmap.",
  },
  {
    question: "Can I invite people outside my organization?",
    answer:
      "Yes. You can invite clients, contractors, and guests with limited permissions while keeping internal workspaces private and secure.",
  },
  {
    question: "Is my data secure and compliant?",
    answer:
      "All traffic is encrypted in transit and data is stored in isolated organization spaces with role-based access controls. We are pursuing SOC 2 Type II certification.",
  },
  {
    question: "Do you offer a free trial or free tier?",
    answer:
      "Teamspace One is free to try for small teams. Paid plans unlock advanced HRMS, analytics, larger file storage, and admin controls as you scale.",
  },
  {
    question: "How does the HRMS integration work?",
    answer:
      "Employee records, onboarding, and offboarding are synchronized with your organization membership. Role changes and lifecycle events flow through a secure event bus.",
  },
];

export function FAQ() {
  return (
    <section className="relative overflow-hidden bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center" direction="up">
          <SectionBadge>FAQ</SectionBadge>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
            Everything you need to know before bringing your team onto Teamspace One.
          </p>
        </Reveal>

        <Reveal className="mt-12 space-y-4" direction="up" delay={100}>
          {faqs.map((faq) => (
            <details
              key={faq.question}
              className="group rounded-2xl border border-slate-200 bg-white p-1 shadow-sm transition-colors open:border-brand-300 open:ring-1 open:ring-brand-300/20"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl p-4 font-semibold text-slate-900 transition-colors hover:bg-slate-50 sm:p-5">
                {faq.question}
                <span className="ml-4 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-colors group-open:bg-brand-600 group-open:text-white">
                  <svg
                    className="h-3.5 w-3.5 transition-transform group-open:rotate-45"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                  </svg>
                </span>
              </summary>
              <div className="px-4 pb-4 text-sm leading-relaxed text-slate-600 sm:px-5 sm:pb-5">
                {faq.answer}
              </div>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
