import { downloadLinks, platformMeta } from "../config/downloads";

function WindowsIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M0 3.449 9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
    </svg>
  );
}

function AppleIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  );
}

interface DownloadButtonsProps {
  /** "dark" for dark backgrounds, "light" for light backgrounds */
  variant?: "dark" | "light";
  className?: string;
}

/** Windows + macOS installer download buttons. */
export function DownloadButtons({ variant = "dark", className = "" }: DownloadButtonsProps) {
  const base =
    "group inline-flex items-center gap-3 rounded-xl px-5 py-3 text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2";
  const styles =
    variant === "dark"
      ? "border border-white/20 bg-white/5 text-white hover:border-white/40 hover:bg-white/10 focus-visible:ring-offset-ink-950"
      : "border border-slate-300 bg-white text-slate-900 shadow-sm hover:border-brand-400 hover:shadow-md focus-visible:ring-offset-white";

  const sub = variant === "dark" ? "text-slate-400" : "text-slate-500";

  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${className}`}>
      <a href={downloadLinks.windows} download className={`${base} ${styles}`}>
        <WindowsIcon className="h-5 w-5 shrink-0" />
        <span>
          <span className="block text-sm font-semibold">{platformMeta.windows.label}</span>
          <span className={`block text-xs ${sub}`}>{platformMeta.windows.sublabel}</span>
        </span>
      </a>
      <a href={downloadLinks.macos} download className={`${base} ${styles}`}>
        <AppleIcon className="h-5 w-5 shrink-0" />
        <span>
          <span className="block text-sm font-semibold">{platformMeta.macos.label}</span>
          <span className={`block text-xs ${sub}`}>{platformMeta.macos.sublabel}</span>
        </span>
      </a>
    </div>
  );
}
