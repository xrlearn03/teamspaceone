import { useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";

export type LegalDocumentId = "privacy" | "terms" | "licenses" | "acknowledgments";

interface LegalSection {
  title: string;
  body: React.ReactNode;
}

interface LegalDocument {
  title: string;
  lastUpdated: string;
  sections: LegalSection[];
}

const LICENSES: { name: string; license: string }[] = [
  { name: "React", license: "MIT" },
  { name: "Tauri", license: "MIT / Apache-2.0" },
  { name: "Tailwind CSS", license: "MIT" },
  { name: "Radix UI", license: "MIT" },
  { name: "TanStack Query", license: "MIT" },
  { name: "Zustand", license: "MIT" },
  { name: "Lucide", license: "ISC" },
  { name: "Socket.IO", license: "MIT" },
  { name: "clsx / tailwind-merge", license: "MIT" },
];

const LEGAL_DOCS: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    title: "Privacy Policy",
    lastUpdated: "September 1, 2025",
    sections: [
      {
        title: "Information We Collect",
        body: "We collect the information you provide when creating an account (name, email, organisation), the content you share in workspaces (messages, files, tasks), and technical data needed to operate the service, such as device, log, and usage information.",
      },
      {
        title: "How We Use Your Information",
        body: "We use your information to provide and improve Teamspace One, personalise your experience, deliver notifications and support, and keep the platform secure.",
      },
      {
        title: "Data Storage and Security",
        body: "Your data is stored securely and encrypted in transit. Access is limited to your organisation and to the authorised systems required to operate the service.",
      },
      {
        title: "Sharing and Disclosure",
        body: "We do not sell your personal information. We may share data with trusted service providers who help operate the platform, or when required to do so by law.",
      },
      {
        title: "Your Rights and Choices",
        body: "You can access, update, or delete your account information from Settings or by contacting us. Organisation administrators manage member access within their workspace.",
      },
      {
        title: "Changes to This Policy",
        body: "We may update this Privacy Policy from time to time. We will notify users of significant changes through the platform or via email at support@teamspaceone.in.",
      },
    ],
  },
  terms: {
    title: "Terms of Service",
    lastUpdated: "September 1, 2025",
    sections: [
      {
        title: "Acceptance of Terms",
        body: "By accessing or using Teamspace One, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.",
      },
      {
        title: "Description of Service",
        body: "Teamspace One is a cloud-based platform that helps teams collaborate, manage projects, and leverage intelligence to work more efficiently. We reserve the right to modify, suspend, or discontinue any part of the service at any time.",
      },
      {
        title: "User Responsibilities",
        body: (
          <ul className="mt-1 list-disc space-y-1 pl-6">
            <li>You are responsible for maintaining the security of your account.</li>
            <li>You agree not to use the service for any unlawful or prohibited activities.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
          </ul>
        ),
      },
      {
        title: "Intellectual Property",
        body: "All content, features, and functionality of Teamspace One are owned by or licensed to Teamspace One and are protected by intellectual property laws.",
      },
      {
        title: "Limitation of Liability",
        body: "Teamspace One shall not be liable for any indirect, incidental, or consequential damages arising out of or related to your use of the service.",
      },
      {
        title: "Changes to Terms",
        body: "We may update these Terms of Service from time to time. We will notify users of significant changes through the platform or via email.",
      },
    ],
  },
  licenses: {
    title: "Licenses",
    lastUpdated: "September 1, 2025",
    sections: [
      {
        title: "Open Source Software",
        body: "Teamspace One is built on open-source software. We are grateful to the maintainers and contributors of the projects below.",
      },
      {
        title: "Third-Party Licenses",
        body: (
          <ul className="mt-3 space-y-2">
            {LICENSES.map((item) => (
              <li
                key={item.name}
                className="flex items-center justify-between gap-4 rounded-lg border border-blue-900/40 bg-[#0a1a2c]/60 px-4 py-2.5 text-[15px] md:text-[16px]"
              >
                <span className="text-blue-50/90">{item.name}</span>
                <span className="shrink-0 text-blue-200/60">{item.license}</span>
              </li>
            ))}
          </ul>
        ),
      },
      {
        title: "License Texts",
        body: "Full license texts are distributed with the application and are available from each project's public repository.",
      },
    ],
  },
  acknowledgments: {
    title: "Acknowledgments",
    lastUpdated: "September 1, 2025",
    sections: [
      {
        title: "Open Source Community",
        body: "Teamspace One is built on the work of thousands of open-source contributors. Thank you for building the tools that make products like this possible.",
      },
      {
        title: "Design and Icons",
        body: "Interface icons are provided by Lucide. Styling is powered by Tailwind CSS. The desktop shell is built with Tauri and the Rust ecosystem.",
      },
      {
        title: "Our Users",
        body: "Thank you to the teams whose feedback shapes Teamspace One every day — this product exists because of you.",
      },
    ],
  },
};

export function LegalDocumentScreen({
  document,
  onBack,
}: {
  document: LegalDocumentId;
  onBack: () => void;
}) {
  const doc = LEGAL_DOCS[document];
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "start" });
  }, []);

  return (
    <div ref={rootRef} className="relative min-h-full bg-[#020b18] text-white">
      {/* Page background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-20 h-[500px] w-[500px] rounded-full bg-blue-700/10 blur-[150px]" />
        <div className="absolute right-0 top-[30%] h-[600px] w-[600px] rounded-full bg-indigo-700/10 blur-[180px]" />
        <div className="absolute bottom-0 left-[30%] h-[400px] w-[500px] rounded-full bg-cyan-500/5 blur-[160px]" />
      </div>

      <div className="relative mx-auto w-full max-w-[1180px] px-4 pb-16 sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 mt-6 flex items-center gap-2 text-[15px] font-medium text-blue-200/80 transition hover:text-white"
        >
          <ArrowLeft size={18} />
          Back to About
        </button>

        {/* Hero */}
        <section className="relative h-[225px] overflow-hidden rounded-t-[14px] border border-blue-900/50 bg-[#030b18]">
          <img
            src="/about-background-image.png"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-right"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#020b18]/85 via-[#020b18]/45 to-transparent" />

          <div className="relative z-10 px-6 pt-14 sm:px-12 sm:pt-16">
            <h1 className="text-[36px] font-bold tracking-[-1px] text-white md:text-[38px]">
              {doc.title}
            </h1>
            <p className="mt-2 text-[16px] text-blue-100/65">Last updated: {doc.lastUpdated}</p>
          </div>
        </section>

        {/* Document */}
        <section className="relative -mt-[1px] overflow-hidden rounded-b-[14px] border border-t-0 border-blue-900/50 bg-gradient-to-br from-[#0a1a2c]/98 via-[#071729]/98 to-[#041222]/98 shadow-[0_20px_80px_rgba(0,0,0,.35)]">
          <div className="pointer-events-none absolute -right-[180px] top-[20%] h-[500px] w-[500px] rounded-full bg-blue-600/5 blur-[120px]" />

          <div className="relative px-6 py-8 sm:px-11">
            {doc.sections.map((section, index) => (
              <article key={section.title} className={index === doc.sections.length - 1 ? "" : "mb-5"}>
                <h2 className="text-[22px] font-bold tracking-[-0.3px] text-white md:text-[23px]">
                  {index + 1}. {section.title}
                </h2>
                <div className="mt-2 text-[17px] leading-[1.55] text-blue-100/70 md:text-[18px]">
                  {section.body}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
