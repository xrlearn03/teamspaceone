import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { useDailyDigest } from "../hooks/api";
import { type DailyDigestResult } from "../lib/api";
import { normalizeDigest } from "../features/dashboard/widgets";
import { cn } from "../lib/utils";

const BRIEF_DOT_COLORS = ["bg-rose-400", "bg-amber-300", "bg-sky-400", "bg-emerald-400", "bg-indigo-300"];

export function AiDailyBrief({
  fallbackPoints = [],
  recommendation,
  footerAction,
  title = "AI Daily Brief",
  subtitle = "Key updates and actions for today",
  maxItems = 5,
  className,
}: {
  /** Shown when the AI digest has no usable items yet. */
  fallbackPoints?: string[];
  /** Optional "AI recommendation" line shown in the expanded details panel. */
  recommendation?: string;
  /** Optional node rendered at the right of the footer row (e.g. a link to the AI view). */
  footerAction?: ReactNode;
  title?: string;
  subtitle?: string;
  maxItems?: number;
  className?: string;
}) {
  const dailyDigest = useDailyDigest();
  const [digest, setDigest] = useState<DailyDigestResult | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (digest || failed) return;
    dailyDigest
      .mutateAsync({ hours: 24 })
      .then((result) => setDigest(normalizeDigest(result)))
      .catch(() => {
        setFailed(true);
        setDigest(normalizeDigest(null));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digest, failed]);

  const digestPoints = useMemo(
    () => (digest?.sections ?? []).flatMap((s) => s.items).filter(Boolean).slice(0, maxItems),
    [digest, maxItems],
  );
  const usableDigest = digestPoints.filter((p) => !/failed to load|no activity to summarize/i.test(p));
  const points = usableDigest.length > 0 ? usableDigest : fallbackPoints;
  const hasDetails = Boolean(digest) || Boolean(recommendation);

  return (
    <div
      className={cn(
        "relative min-h-[310px] overflow-hidden rounded-xl border border-white/10 bg-[#020b19] p-6",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0">
        <img
          src="/about-background-image.png"
          alt=""
          className="h-full w-full object-cover object-right"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#020b19]/90 via-[#020b19]/60 to-[#020b19]/20" />
      </div>
      <div className="pointer-events-none absolute -right-20 -top-16 h-64 w-64 rounded-full bg-info/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 right-[-40px] h-56 w-96 rotate-[-18deg] rounded-[50%] bg-primary/10 blur-2xl" />

      <div className="relative z-10">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 text-indigo-300">
            <Sparkles size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[21px] font-semibold text-white">{title}</h2>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-indigo-200">
                Beta
              </span>
            </div>
            <p className="mt-1 text-xs text-white/70">{subtitle}</p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {dailyDigest.isPending && points.length === 0 ? (
            <p className="text-[13px] leading-5 text-white/70">Generating daily brief…</p>
          ) : points.length > 0 ? (
            points.map((point, index) => (
              <div key={index} className="flex items-start gap-4">
                <span
                  className={cn(
                    "mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full",
                    BRIEF_DOT_COLORS[index % BRIEF_DOT_COLORS.length],
                  )}
                />
                <p className="text-[13px] leading-5 text-white/75">{point}</p>
              </div>
            ))
          ) : (
            <p className="text-[13px] leading-5 text-white/70">
              No activity to summarize. You're all caught up.
            </p>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-3 rounded-lg border border-primary/30 bg-surface/80 px-5 py-2.5 text-xs font-medium text-primary transition hover:bg-surface"
          >
            {expanded ? "Hide Details" : "View Details"}
            {expanded ? <X size={14} /> : <ArrowRight size={14} />}
          </button>
          {footerAction}
        </div>

        {expanded && hasDetails && (
          <div className="mt-4 max-h-44 space-y-3 overflow-y-auto rounded-xl border border-primary/15 bg-surface/80 p-4 text-xs leading-5 text-text-secondary">
            {recommendation && (
              <p>
                <strong className="text-text">AI recommendation:</strong> {recommendation}
              </p>
            )}
            {digest?.sections.map((section) => (
              <div key={section.title}>
                <p className="text-xs font-semibold text-text">{section.title}</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {section.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
