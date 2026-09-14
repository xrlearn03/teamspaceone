import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import {
  useAcknowledgePerformanceReview,
  useCreateGoal,
  useGoals,
  useMe,
  useMyEmployee,
  usePerformanceReviews,
  useReviewCycles,
  useUpdateGoal,
} from "@/hooks/api";
import { usePermissions } from "@/hooks/usePermissions";
import { useUIStore } from "@/stores/ui";
import type { Goal, PerformanceReview, ReviewCycle } from "@/lib/api";
import { Button } from "@teamspace-one/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Input } from "@teamspace-one/ui/input";
import { SectionError, SectionSkeleton, formatDate } from "./hrms/common";

type Tab = "overview" | "goals" | "reviews";

const labelCls = "text-xs font-medium text-text-secondary";
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm text-text";
const cardCls = "rounded-xl border border-border bg-surface p-5";

const GOAL_STATUS_META: Record<string, { label: string; pill: string; dot: string; bar: string }> = {
  on_track: { label: "On track", pill: "bg-success/10 text-success", dot: "bg-success", bar: "bg-success" },
  in_progress: { label: "In progress", pill: "bg-info/10 text-info", dot: "bg-info", bar: "bg-info" },
  completed: { label: "Completed", pill: "bg-success/10 text-success", dot: "bg-success", bar: "bg-success" },
  at_risk: { label: "At risk", pill: "bg-error/10 text-error", dot: "bg-error", bar: "bg-error" },
  cancelled: { label: "Cancelled", pill: "bg-surface-elevated text-text-muted", dot: "bg-text-muted", bar: "bg-text-muted" },
};

function goalStatusMeta(status?: string | null) {
  return GOAL_STATUS_META[status ?? ""] ?? GOAL_STATUS_META.on_track;
}

const GOAL_ICONS = [Zap, Target, Users, Trophy];
const GOAL_ICON_CLASSES = [
  "bg-mention/10 text-mention",
  "bg-info/10 text-info",
  "bg-success/10 text-success",
  "bg-primary-subtle text-primary",
];

function GoalStatusPill({ status }: { status?: string | null }) {
  const meta = goalStatusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium ${meta.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function MetricCard({
  icon,
  title,
  value,
  subtitle,
  progress,
  iconClass,
  progressClass,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  progress: number;
  iconClass: string;
  progressClass: string;
}) {
  return (
    <div className={cardCls}>
      <div className="flex items-start gap-4">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconClass}`}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-text-muted">{title}</p>
          <p className="mt-1 text-[22px] font-semibold tracking-tight text-text">{value}</p>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-elevated">
        <div className={`h-full rounded-full ${progressClass}`} style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-[11px] text-text-muted">{subtitle}</p>
    </div>
  );
}

function TabButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex h-12 items-center gap-2 px-5 text-sm transition ${
        active ? "font-medium text-primary" : "text-text-secondary hover:text-text"
      }`}
    >
      {icon}
      {label}
      {active ? <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-primary" /> : null}
    </button>
  );
}

function OverallPerformance({ rating, reviewCount }: { rating: number | null; reviewCount: number }) {
  const circumference = 2 * Math.PI * 57;
  const percentage = rating == null ? 0 : (rating / 5) * 100;
  const onTrack = rating == null || rating >= 3;

  return (
    <div className={`${cardCls} p-6`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-text">Overall Performance</h2>
          <CircleHelp size={15} className="text-text-muted" />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-7">
        <div className="relative h-[135px] w-[135px] shrink-0">
          <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
            <circle cx="70" cy="70" r="57" fill="none" stroke="currentColor" strokeWidth="12" className="text-surface-elevated" />
            {rating != null ? (
              <circle
                cx="70"
                cy="70"
                r="57"
                fill="none"
                stroke="currentColor"
                strokeWidth="12"
                strokeLinecap="round"
                className={onTrack ? "text-success" : "text-warning"}
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - percentage / 100)}
              />
            ) : null}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[34px] font-semibold text-text">{rating != null ? rating.toFixed(1) : "—"}</span>
            <span className="text-[11px] text-text-muted">out of 5</span>
          </div>
        </div>

        <div>
          <span
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium ${
              rating == null
                ? "bg-surface-elevated text-text-muted"
                : onTrack
                  ? "bg-success/10 text-success"
                  : "bg-warning/10 text-warning"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${rating == null ? "bg-text-muted" : onTrack ? "bg-success" : "bg-warning"}`} />
            {rating == null ? "No rating yet" : onTrack ? "On Track" : "Needs Focus"}
          </span>
          <p className="mt-4 max-w-[290px] text-sm leading-6 text-text-muted">
            {rating == null
              ? "Your overall rating appears once a review is submitted."
              : `Average of ${reviewCount} rated ${reviewCount === 1 ? "review" : "reviews"} in this cycle.`}
          </p>
        </div>
      </div>
    </div>
  );
}

function WelcomeBanner({ name, goalProgress }: { name: string; goalProgress: number }) {
  return (
    <div className="relative min-h-[185px] overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary-subtle via-surface to-info/10 p-7">
      <div className="relative z-10 max-w-[65%]">
        <h2 className="text-[22px] font-semibold tracking-tight text-text">Keep Going, {name}!</h2>
        <p className="mt-2 text-sm text-text-secondary">
          {goalProgress >= 75
            ? "You're making strong progress this cycle."
            : goalProgress >= 40
              ? "You're steadily moving towards your goals."
              : "Every small step counts — keep at it."}
        </p>
        <p className="mt-5 text-sm italic leading-6 text-text-muted">
          “Great things are done by a series of small things brought together.”
        </p>
      </div>

      {/* Decorative mountain */}
      <div className="absolute bottom-0 right-0 h-full w-[43%] overflow-hidden opacity-70">
        <div className="absolute bottom-0 right-[12%] h-28 w-28 rotate-45 bg-info/10" />
        <div className="absolute bottom-0 right-[28%] h-40 w-40 rotate-45 bg-info/20" />
        <div className="absolute bottom-0 right-[-3%] h-48 w-48 rotate-45 bg-info/10" />
        <div className="absolute right-[20%] top-7">
          <div className="h-9 w-1 bg-primary" />
          <div className="absolute left-0 top-0 h-6 w-8 bg-primary [clip-path:polygon(0_0,100%_0,75%_50%,100%_100%,0_100%)]" />
        </div>
        <div className="absolute bottom-20 right-[22%]">
          <div className="h-8 w-8 rounded-full bg-primary" />
          <div className="mx-auto h-8 w-14 rounded-t-full bg-primary" />
        </div>
      </div>
    </div>
  );
}

function GoalsCard({ goalsData, onViewAll }: { goalsData: Goal[]; onViewAll: () => void }) {
  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-mention/10 text-mention">
            <Target size={18} />
          </div>
          <h2 className="text-base font-semibold text-text">Goals</h2>
        </div>
        <button type="button" onClick={onViewAll} className="text-xs font-medium text-primary">
          View All
        </button>
      </div>

      {goalsData.length === 0 ? (
        <EmptyState icon={Target} title="No goals" description="Create a goal to track progress through the review cycle." />
      ) : (
        <div className="mt-4 space-y-4">
          {goalsData.map((goal, index) => {
            const Icon = GOAL_ICONS[index % GOAL_ICONS.length];
            const meta = goalStatusMeta(goal.status);
            const progress = Math.max(0, Math.min(100, goal.progress ?? 0));
            return (
              <div key={goal.id} className="flex gap-3">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${GOAL_ICON_CLASSES[index % GOAL_ICON_CLASSES.length]}`}
                >
                  <Icon size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-text">{goal.title}</p>
                      {goal.description ? (
                        <p className="mt-1 truncate text-[10px] text-text-muted">{goal.description}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[10px] font-semibold text-text-muted">{progress}%</span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-elevated">
                      <div className={`h-full rounded-full ${meta.bar}`} style={{ width: `${progress}%` }} />
                    </div>
                    <GoalStatusPill status={goal.status} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PerformanceTrend({ reviews }: { reviews: PerformanceReview[] }) {
  const points = useMemo(() => {
    const rated = reviews
      .filter((r) => r.overallRating != null)
      .sort((a, b) => new Date(a.submittedAt ?? 0).getTime() - new Date(b.submittedAt ?? 0).getTime());
    const width = 410;
    const height = 210;
    return rated.map((r, index) => {
      const x = rated.length === 1 ? width / 2 : 25 + (index * (width - 50)) / (rated.length - 1);
      const y = height - 35 - (((r.overallRating ?? 1) - 1) / 4) * (height - 65);
      return { review: r, x, y, label: r.cycle?.name ?? `Review ${index + 1}` };
    });
  }, [reviews]);

  if (points.length === 0) return null;

  const width = 410;
  const height = 210;
  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = [
    `${points[0].x},${height - 35}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${points[points.length - 1].x},${height - 35}`,
  ].join(" ");

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
            <TrendingUp size={18} />
          </div>
          <h2 className="text-base font-semibold text-text">Performance Trend</h2>
        </div>
      </div>

      <div className="mt-5">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
          {[1, 2, 3, 4, 5].map((value) => {
            const y = height - 35 - ((value - 1) / 4) * (height - 65);
            return (
              <g key={value}>
                <line x1="25" x2={width - 15} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
                <text x="5" y={y + 4} fontSize="10" fill="var(--text-muted)">
                  {value}
                </text>
              </g>
            );
          })}
          {points.map((p) => (
            <line key={`v-${p.review.id}`} x1={p.x} x2={p.x} y1="20" y2={height - 35} stroke="var(--border)" strokeWidth="1" opacity="0.5" />
          ))}
          {points.length > 1 ? <polygon points={area} fill="var(--info)" opacity="0.1" /> : null}
          {points.length > 1 ? (
            <polyline points={polyline} fill="none" stroke="var(--info)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ) : null}
          {points.map((p) => (
            <circle key={p.review.id} cx={p.x} cy={p.y} r="4" fill="var(--info)" />
          ))}
          {points.map((p) => (
            <text
              key={`${p.review.id}-label`}
              x={p.x}
              y={height - 10}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-muted)"
            >
              {p.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

const RATING_LABELS: Record<string, string> = {
  quality: "Quality",
  productivity: "Productivity",
  communication: "Communication",
  teamwork: "Teamwork",
  initiative: "Initiative",
};
const RATING_BAR_CLASSES = ["bg-primary", "bg-info", "bg-success", "bg-warning", "bg-mention"];

function RatingsBreakdown({ review }: { review: PerformanceReview | null }) {
  const entries = Object.entries(review?.ratings ?? {}).filter(([, v]) => typeof v === "number" && v > 0);
  if (!review || entries.length === 0) return null;

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
            <BarChart3 size={18} />
          </div>
          <h2 className="text-base font-semibold text-text">Rating Breakdown</h2>
        </div>
        {review.cycle ? <span className="text-xs text-text-muted">{review.cycle.name}</span> : null}
      </div>

      <div className="mt-5 space-y-5">
        {entries.map(([key, value], index) => (
          <div key={key}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">{RATING_LABELS[key] ?? key}</span>
              <span className="text-[10px] text-text-muted">{value}/5</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-elevated">
              <div
                className={`h-full rounded-full ${RATING_BAR_CLASSES[index % RATING_BAR_CLASSES.length]}`}
                style={{ width: `${(value / 5) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NextReview({ cycle, pendingAck }: { cycle: ReviewCycle | null; pendingAck: PerformanceReview | null }) {
  if (pendingAck) {
    return (
      <div className={cardCls}>
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
            <CalendarDays size={18} />
          </div>
          <h2 className="text-base font-semibold text-text">Action Needed</h2>
        </div>
        <p className="mt-5 text-[18px] font-semibold text-text">Review ready to acknowledge</p>
        <p className="mt-1 text-xs font-medium text-text-secondary">{pendingAck.cycle?.name ?? "Performance review"}</p>
        <p className="mt-1 text-[10px] leading-5 text-text-muted">
          Your review has been submitted. Open it and acknowledge to complete the cycle.
        </p>
      </div>
    );
  }

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-info/10 text-info">
          <CalendarDays size={18} />
        </div>
        <h2 className="text-base font-semibold text-text">Current Cycle</h2>
      </div>
      {cycle ? (
        <>
          <p className="mt-5 text-[21px] font-semibold text-text">{formatDate(cycle.endDate)}</p>
          <p className="mt-1 text-xs font-medium text-text-secondary">{cycle.name}</p>
          <p className="mt-1 text-[10px] leading-5 text-text-muted">
            Prepare your self-assessment and goals before the cycle ends.
          </p>
        </>
      ) : (
        <p className="mt-5 text-xs leading-5 text-text-muted">No active review cycle right now.</p>
      )}
    </div>
  );
}

function QuickActions({
  onAddGoal,
  onGoals,
  onReviews,
  onManage,
}: {
  onAddGoal: () => void;
  onGoals: () => void;
  onReviews: () => void;
  onManage: (() => void) | null;
}) {
  const actions = [
    { title: "Add a Goal", subtitle: "Set a new goal for this cycle", icon: <Plus size={17} />, onClick: onAddGoal },
    { title: "Update Goals", subtitle: "Set or modify your goals", icon: <Target size={17} />, onClick: onGoals },
    { title: "View Past Reviews", subtitle: "Check your previous performance reports", icon: <FileText size={17} />, onClick: onReviews },
    ...(onManage
      ? [{ title: "Manage Performance", subtitle: "Cycles, reviews and team goals", icon: <BarChart3 size={17} />, onClick: onManage }]
      : []),
  ];

  return (
    <div className={cardCls}>
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <Zap size={18} />
        </div>
        <h2 className="text-base font-semibold text-text">Quick Actions</h2>
      </div>

      <div className="mt-2">
        {actions.map((action) => (
          <button
            key={action.title}
            type="button"
            onClick={action.onClick}
            className="group flex w-full items-center gap-3 border-b border-border py-3 text-left last:border-0"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-subtle text-primary">
              {action.icon}
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-text-secondary">{action.title}</p>
              <p className="mt-0.5 text-[10px] text-text-muted">{action.subtitle}</p>
            </div>
            <ChevronRight size={15} className="text-text-muted transition group-hover:translate-x-1 group-hover:text-primary" />
          </button>
        ))}
      </div>
    </div>
  );
}

function GoalsPage({ goalsData, onAdd }: { goalsData: Goal[]; onAdd: () => void }) {
  const update = useUpdateGoal();

  return (
    <div className={`${cardCls} p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">My Goals</h2>
          <p className="mt-1 text-xs text-text-muted">Track your goals and progress for the current performance cycle.</p>
        </div>
        <Button onClick={onAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add Goal
        </Button>
      </div>

      {goalsData.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Target} title="No goals" description="Create a goal to track progress through the review cycle." />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {goalsData.map((goal, index) => {
            const Icon = GOAL_ICONS[index % GOAL_ICONS.length];
            const progress = Math.max(0, Math.min(100, goal.progress ?? 0));
            return (
              <div key={goal.id} className="rounded-xl border border-border p-5 transition hover:border-primary/40">
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${GOAL_ICON_CLASSES[index % GOAL_ICON_CLASSES.length]}`}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3">
                      <h3 className="text-sm font-semibold text-text">{goal.title}</h3>
                      <GoalStatusPill status={goal.status} />
                    </div>
                    {goal.description ? (
                      <p className="mt-2 text-xs leading-5 text-text-muted">{goal.description}</p>
                    ) : null}
                    {goal.targetDate ? (
                      <p className="mt-1 text-[10px] text-text-muted">Due {formatDate(goal.targetDate)}</p>
                    ) : null}

                    <div className="mt-5 flex items-center justify-between text-xs">
                      <span className="text-text-muted">Progress</span>
                      <span className="font-semibold text-text">{progress}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={progress}
                      aria-label="Progress"
                      className="mt-2 w-full accent-primary"
                      disabled={update.isPending}
                      onChange={(e) => update.mutate({ id: goal.id, body: { progress: Number(e.target.value) } })}
                    />
                    <div className="mt-2 flex justify-end">
                      <select
                        className="h-7 rounded-md border bg-background px-1 text-xs text-text"
                        value={goal.status}
                        disabled={update.isPending}
                        onChange={(e) => update.mutate({ id: goal.id, body: { status: e.target.value } })}
                      >
                        <option value="on_track">On track</option>
                        <option value="at_risk">At risk</option>
                        <option value="completed">Completed</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function reviewStatusPill(status?: string | null) {
  switch (status) {
    case "acknowledged":
      return "bg-success/10 text-success";
    case "submitted":
      return "bg-info/10 text-info";
    case "in_progress":
    case "pending":
      return "bg-warning/10 text-warning";
    default:
      return "bg-surface-elevated text-text-muted";
  }
}

function ReviewsPage({ reviews, onView }: { reviews: PerformanceReview[]; onView: (r: PerformanceReview) => void }) {
  return (
    <div className={`${cardCls} p-6`}>
      <div>
        <h2 className="text-lg font-semibold text-text">Performance Reviews</h2>
        <p className="mt-1 text-xs text-text-muted">Your previous performance review history.</p>
      </div>

      {reviews.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={TrendingUp}
            title="No reviews"
            description="Reviews appear once a cycle is created and reviews are assigned."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="flex items-center gap-5 rounded-xl border border-border p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                <FileText size={20} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-text">{review.cycle?.name ?? "Performance review"}</h3>
                <p className="mt-1 text-[10px] text-text-muted">
                  {review.submittedAt ? `Reviewed on ${formatDate(review.submittedAt)}` : "Not submitted yet"}
                </p>
              </div>
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-sm font-semibold text-text">
                  {review.overallRating != null ? (
                    <>
                      <Star className="h-3.5 w-3.5 text-warning" fill="currentColor" />
                      {review.overallRating}/5
                    </>
                  ) : (
                    "—"
                  )}
                </p>
                <span
                  className={`mt-1 inline-block rounded-full px-3 py-1 text-[10px] font-medium capitalize ${reviewStatusPill(review.status)}`}
                >
                  {(review.status ?? "draft").replace(/_/g, " ")}
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => onView(review)}>
                View
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GoalDialog({
  open,
  onOpenChange,
  cycles,
  employeeId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cycles: ReviewCycle[];
  employeeId?: string;
}) {
  const create = useCreateGoal();
  const [cycleId, setCycleId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add performance goal</DialogTitle>
          <DialogDescription>Define a measurable goal for the current performance cycle.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Goal title *</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Improve design delivery" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Description</span>
            <textarea
              className="min-h-24 resize-none rounded-md border bg-background px-2 py-1.5 text-sm text-text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the expected outcome..."
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Cycle</span>
              <select className={selectCls} value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                <option value="">None</option>
                {cycles.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Target completion</span>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={create.isPending || !title.trim() || !employeeId}
            onClick={() =>
              create.mutate(
                {
                  employeeId,
                  cycleId: cycleId || undefined,
                  title: title.trim(),
                  description: description || undefined,
                  targetDate: targetDate || undefined,
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            <Check className="mr-1 h-4 w-4" /> Create goal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  review,
  open,
  onOpenChange,
}: {
  review: PerformanceReview | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const acknowledge = useAcknowledgePerformanceReview();
  const entries = Object.entries(review?.ratings ?? {}).filter(([, v]) => typeof v === "number" && v > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Performance Review</DialogTitle>
          <DialogDescription>{review?.cycle?.name ?? "Review details"}</DialogDescription>
        </DialogHeader>
        {review ? (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto p-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-primary-subtle p-4">
                <p className="text-xs text-text-muted">Overall rating</p>
                <p className="mt-2 text-3xl font-semibold text-primary">
                  {review.overallRating != null ? review.overallRating : "—"}
                </p>
                <p className="mt-1 text-[10px] text-text-muted">out of 5</p>
              </div>
              <div className="rounded-xl bg-surface-elevated p-4">
                <p className="text-xs text-text-muted">Status</p>
                <p className="mt-2 text-sm font-semibold capitalize text-text">{(review.status ?? "draft").replace(/_/g, " ")}</p>
                {review.submittedAt ? (
                  <p className="mt-1 text-[10px] text-text-muted">Submitted {formatDate(review.submittedAt)}</p>
                ) : null}
              </div>
            </div>

            {entries.length > 0 ? (
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold text-text">Criteria</p>
                <div className="mt-3 space-y-2">
                  {entries.map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between text-xs">
                      <span className="capitalize text-text-secondary">{RATING_LABELS[key] ?? key}</span>
                      <span className="flex items-center gap-1 text-text">
                        <Star className="h-3 w-3 text-warning" fill="currentColor" />
                        {value}/5
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {review.strengths ? (
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold text-text">Strengths</p>
                <p className="mt-2 text-xs leading-5 text-text-muted">{review.strengths}</p>
              </div>
            ) : null}
            {review.improvements ? (
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold text-text">Areas for improvement</p>
                <p className="mt-2 text-xs leading-5 text-text-muted">{review.improvements}</p>
              </div>
            ) : null}
            {review.comments ? (
              <div className="rounded-xl border border-border p-4">
                <p className="text-xs font-semibold text-text">Manager comments</p>
                <p className="mt-2 text-xs leading-5 text-text-muted">{review.comments}</p>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 p-4 pt-0">
          {review?.status === "submitted" ? (
            <Button
              disabled={acknowledge.isPending}
              onClick={() => acknowledge.mutate(review.id, { onSuccess: () => onOpenChange(false) })}
            >
              <Check className="mr-1 h-4 w-4" /> Acknowledge
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MyPerformanceScreen() {
  const { can } = usePermissions();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const me = useMe();
  const myEmployee = useMyEmployee();
  const cycles = useReviewCycles();
  const reviews = usePerformanceReviews();
  const goals = useGoals(myEmployee.data?.id);

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [cycleFilter, setCycleFilter] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);
  const [viewing, setViewing] = useState<PerformanceReview | null>(null);

  const myEmployeeId = myEmployee.data?.id;

  const myReviews = useMemo(
    () => (myEmployeeId ? (reviews.data ?? []).filter((r) => r.employee.id === myEmployeeId) : []),
    [reviews.data, myEmployeeId],
  );
  const myGoals = useMemo(
    () => (myEmployeeId ? (goals.data ?? []).filter((g) => g.employee.id === myEmployeeId) : []),
    [goals.data, myEmployeeId],
  );
  const cycleReviews = useMemo(
    () => (cycleFilter ? myReviews.filter((r) => r.cycle?.id === cycleFilter) : myReviews),
    [myReviews, cycleFilter],
  );

  const ratedReviews = cycleReviews.filter((r) => r.overallRating != null);
  const overallRating =
    ratedReviews.length > 0
      ? Math.round((ratedReviews.reduce((s, r) => s + (r.overallRating ?? 0), 0) / ratedReviews.length) * 10) / 10
      : null;
  const latestRated = [...ratedReviews].sort(
    (a, b) => new Date(b.submittedAt ?? 0).getTime() - new Date(a.submittedAt ?? 0).getTime(),
  )[0] ?? null;

  const activeGoals = myGoals.filter((g) => g.status !== "cancelled");
  const completedGoals = activeGoals.filter((g) => g.status === "completed").length;
  const onTrackGoals = activeGoals.filter((g) => g.status === "on_track").length;
  const goalProgress = activeGoals.length
    ? Math.round(activeGoals.reduce((s, g) => s + Math.max(0, Math.min(100, g.progress ?? 0)), 0) / activeGoals.length)
    : 0;
  const reviewedCount = myReviews.filter((r) => r.status === "submitted" || r.status === "acknowledged").length;
  const pendingAck = myReviews.find((r) => r.status === "submitted") ?? null;
  const activeCycle = (cycles.data ?? []).find((c) => c.status === "active") ?? null;

  if (!can("hrms.performance.view") && !can("hrms.access")) {
    return (
      <div className="p-4 sm:p-6">
        <div className={cardCls}>
          <EmptyState
            icon={ShieldAlert}
            title="You don't have access to performance"
            description="Performance reviews require the hrms.performance.view permission."
          />
        </div>
      </div>
    );
  }

  if (reviews.isLoading && goals.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <SectionSkeleton />
      </div>
    );
  }
  if (reviews.isError) {
    return (
      <div className="p-4 sm:p-6">
        <div className={cardCls}>
          <SectionError onRetry={() => reviews.refetch()} />
        </div>
      </div>
    );
  }

  const firstName = me.data?.firstName || myEmployee.data?.firstName || "there";

  return (
    <div className="p-4 sm:p-6">
      <div className="mx-auto max-w-[1500px]">
        {/* Header */}
        <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-white shadow-md">
              <BarChart3 size={27} />
            </div>
            <div>
              <h1 className="text-[27px] font-semibold tracking-tight text-text">My Performance</h1>
              <p className="mt-1 text-sm text-text-muted">Track your progress, goals and feedback to grow further</p>
            </div>
          </div>

          <div className="relative">
            <div className="absolute left-4 top-3 text-[10px] text-text-muted">Performance Cycle</div>
            <select
              value={cycleFilter}
              onChange={(e) => setCycleFilter(e.target.value)}
              className="h-[62px] w-[235px] appearance-none rounded-xl border border-border bg-surface px-4 pb-2 pt-6 text-sm font-medium text-text outline-none"
            >
              <option value="">All cycles</option>
              {(cycles.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-4 top-1/2 translate-y-1 text-text-muted" />
          </div>
        </header>

        {/* Tabs */}
        <nav className="mt-6 flex overflow-x-auto border-b border-border">
          <TabButton label="Overview" icon={<BarChart3 size={16} />} active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
          <TabButton label="Goals" icon={<Target size={16} />} active={activeTab === "goals"} onClick={() => setActiveTab("goals")} />
          <TabButton label="Reviews" icon={<FileText size={16} />} active={activeTab === "reviews"} onClick={() => setActiveTab("reviews")} />
        </nav>

        {activeTab === "overview" && (
          <>
            <section className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
              <WelcomeBanner name={firstName} goalProgress={goalProgress} />
              <OverallPerformance rating={overallRating} reviewCount={ratedReviews.length} />
            </section>

            <section className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={<Target size={21} />}
                iconClass="bg-success/10 text-success"
                title="Goals Progress"
                value={`${goalProgress}%`}
                subtitle={`${completedGoals} of ${activeGoals.length} goals completed`}
                progress={goalProgress}
                progressClass="bg-success"
              />
              <MetricCard
                icon={<Star size={21} />}
                iconClass="bg-warning/10 text-warning"
                title="Overall Rating"
                value={overallRating != null ? `${overallRating} / 5` : "—"}
                subtitle={`Based on ${ratedReviews.length} rated ${ratedReviews.length === 1 ? "review" : "reviews"}`}
                progress={overallRating != null ? (overallRating / 5) * 100 : 0}
                progressClass="bg-warning"
              />
              <MetricCard
                icon={<TrendingUp size={21} />}
                iconClass="bg-info/10 text-info"
                title="Goals On Track"
                value={String(onTrackGoals)}
                subtitle="Currently on track"
                progress={activeGoals.length ? (onTrackGoals / activeGoals.length) * 100 : 0}
                progressClass="bg-info"
              />
              <MetricCard
                icon={<FileText size={21} />}
                iconClass="bg-primary-subtle text-primary"
                title="Reviews"
                value={String(reviewedCount)}
                subtitle={`${myReviews.length} total across cycles`}
                progress={myReviews.length ? (reviewedCount / myReviews.length) * 100 : 0}
                progressClass="bg-primary"
              />
            </section>

            <section className="mt-4 grid gap-4 xl:grid-cols-3">
              <GoalsCard goalsData={activeGoals.slice(0, 4)} onViewAll={() => setActiveTab("goals")} />
              <PerformanceTrend reviews={cycleReviews} />
              <RatingsBreakdown review={latestRated} />
            </section>

            <section className="mt-4 grid gap-4 md:grid-cols-2">
              <NextReview cycle={activeCycle} pendingAck={pendingAck} />
              <QuickActions
                onAddGoal={() => setGoalOpen(true)}
                onGoals={() => setActiveTab("goals")}
                onReviews={() => setActiveTab("reviews")}
                onManage={
                  can("hrms.performance.manage")
                    ? () => setActiveView("hrms", { hrmsTab: "performance" })
                    : null
                }
              />
            </section>
          </>
        )}

        {activeTab === "goals" && <main className="mt-5"><GoalsPage goalsData={activeGoals} onAdd={() => setGoalOpen(true)} /></main>}
        {activeTab === "reviews" && (
          <main className="mt-5">
            <ReviewsPage reviews={cycleReviews} onView={setViewing} />
          </main>
        )}

        {/* Footer */}
        <footer className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <ShieldCheck size={15} className="text-success" />
            Performance information is visible only to authorized employees and managers.
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <Clock3 size={14} />
            Last updated {formatDate(new Date().toISOString())}
          </div>
        </footer>
      </div>

      <GoalDialog open={goalOpen} onOpenChange={setGoalOpen} cycles={cycles.data ?? []} employeeId={myEmployeeId} />
      <ReviewDialog review={viewing} open={Boolean(viewing)} onOpenChange={(o) => { if (!o) setViewing(null); }} />
    </div>
  );
}
