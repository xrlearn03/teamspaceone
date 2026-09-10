const columns = [
  {
    heading: "Product",
    links: [
      { label: "Features", href: "#features" },
      { label: "Download", href: "#download" },
      { label: "Pricing", href: "#download" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "#top" },
      { label: "Contact", href: "mailto:hello@teamspaceone.in" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy Policy", href: "#privacy" },
      { label: "Terms of Service", href: "#terms" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-ink-950">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          {/* Brand */}
          <div>
            <a href="#top" className="flex items-center gap-2.5">
              <img
                src="/assets/Teamspace-dark-logo.svg"
                alt="Teamspace One"
                className="h-20 w-auto"
              />
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-400">
              One workspace. Every team.
            </p>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h3 className="text-sm font-semibold tracking-wide text-white uppercase">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-sm text-slate-400 transition-colors hover:text-white"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 border-t border-white/10 pt-8">
          <p className="text-center text-sm text-slate-500">
            © 2026 Teamspace One. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
