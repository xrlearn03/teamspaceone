import { useState } from "react";
import { Check, Plus, ShieldAlert, Star, Target, TrendingUp } from "lucide-react";
import {
  useAcknowledgePerformanceReview,
  useCreateGoal,
  useCreatePerformanceReview,
  useCreateReviewCycle,
  useEmployees,
  useGoals,
  useMe,
  useMyEmployee,
  usePerformanceReviews,
  useReviewCycles,
  useUpdateGoal,
  useUpdatePerformanceReview,
  useUpdateReviewCycle,
} from "../../hooks/api";
import { usePermissions } from "../../hooks/usePermissions";
import type { Goal, PerformanceReview } from "../../lib/api";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { Input } from "../../components/ui/input";
import { SectionError, SectionSkeleton, StatusBadge, formatDate } from "./common";

const labelCls = "text-xs font-medium text-text-secondary";
const selectCls = "h-9 rounded-md border bg-background px-2 text-sm text-text";

const RATING_CRITERIA = ["quality", "productivity", "communication", "teamwork", "initiative"] as const;

function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-label={`${n} of 5`}
          onClick={() => onChange(n)}
          className="p-0.5"
        >
          <Star
            className={n <= value ? "h-4 w-4 text-warning" : "h-4 w-4 text-text-muted"}
            fill={n <= value ? "currentColor" : "none"}
          />
        </button>
      ))}
    </div>
  );
}

function CycleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateReviewCycle();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New review cycle</DialogTitle>
          <DialogDescription>Create a performance review cycle.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Name *</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. H1 2025" />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Start date</span>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>End date</span>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={create.isPending || !name.trim()}
            onClick={() =>
              create.mutate(
                { name: name.trim(), startDate: startDate || undefined, endDate: endDate || undefined },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            Create cycle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateReviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const cycles = useReviewCycles();
  const employees = useEmployees({});
  const create = useCreatePerformanceReview();
  const [cycleId, setCycleId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [reviewerId, setReviewerId] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign review</DialogTitle>
          <DialogDescription>Create a performance review for an employee in a cycle.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Cycle *</span>
            <select className={selectCls} value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              <option value="">Select…</option>
              {(cycles.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Employee *</span>
            <select className={selectCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select…</option>
              {(employees.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Reviewer</span>
            <select className={selectCls} value={reviewerId} onChange={(e) => setReviewerId(e.target.value)}>
              <option value="">Default (manager)</option>
              {(employees.data ?? []).map((e) => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={create.isPending || !cycleId || !employeeId}
            onClick={() =>
              create.mutate(
                { cycleId, employeeId, reviewerId: reviewerId || undefined },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            Assign
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SubmitReviewDialog({
  review,
  open,
  onOpenChange,
}: {
  review: PerformanceReview;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdatePerformanceReview();
  const [overallRating, setOverallRating] = useState(review.overallRating ?? 0);
  const [ratings, setRatings] = useState<Record<string, number>>(() => ({ ...(review.ratings ?? {}) }));
  const [strengths, setStrengths] = useState(review.strengths ?? "");
  const [improvements, setImprovements] = useState(review.improvements ?? "");
  const [comments, setComments] = useState(review.comments ?? "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit review</DialogTitle>
          <DialogDescription>
            Review for {review.employee.firstName} {review.employee.lastName}
            {review.cycle ? ` · ${review.cycle.name}` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto p-4 pt-2">
          <div className="flex items-center gap-3">
            <span className={labelCls}>Overall rating</span>
            <RatingInput value={overallRating} onChange={setOverallRating} />
          </div>
          {RATING_CRITERIA.map((c) => (
            <div key={c} className="flex items-center justify-between gap-3">
              <span className="text-xs capitalize text-text-secondary">{c}</span>
              <RatingInput
                value={ratings[c] ?? 0}
                onChange={(v) => setRatings((r) => ({ ...r, [c]: v }))}
              />
            </div>
          ))}
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Strengths</span>
            <textarea
              className="min-h-16 rounded-md border bg-background px-2 py-1.5 text-sm text-text"
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Areas for improvement</span>
            <textarea
              className="min-h-16 rounded-md border bg-background px-2 py-1.5 text-sm text-text"
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Comments</span>
            <textarea
              className="min-h-16 rounded-md border bg-background px-2 py-1.5 text-sm text-text"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={update.isPending}
            onClick={() =>
              update.mutate(
                {
                  id: review.id,
                  body: {
                    overallRating: overallRating || null,
                    ratings,
                    strengths: strengths || null,
                    improvements: improvements || null,
                    comments: comments || null,
                  },
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            Submit review
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GoalDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { can } = usePermissions();
  const employees = useEmployees(can("hrms.performance.manage") ? {} : undefined);
  const cycles = useReviewCycles();
  const create = useCreateGoal();
  const [employeeId, setEmployeeId] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
          <DialogDescription>Set a goal for yourself or a team member.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4 pt-2">
          {can("hrms.performance.manage") ? (
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Employee</span>
              <select className={selectCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">Myself</option>
                {(employees.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Cycle</span>
            <select className={selectCls} value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
              <option value="">None</option>
              {(cycles.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Title *</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Description</span>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Target date</span>
            <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={create.isPending || !title.trim()}
            onClick={() =>
              create.mutate(
                {
                  employeeId: employeeId || undefined,
                  cycleId: cycleId || undefined,
                  title: title.trim(),
                  description: description || undefined,
                  targetDate: targetDate || undefined,
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            Create goal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GoalRow({ goal }: { goal: Goal }) {
  const update = useUpdateGoal();
  const progress = Math.max(0, Math.min(100, goal.progress ?? 0));
  return (
    <li className="flex flex-col gap-1.5 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 truncate text-sm font-medium text-text">{goal.title}</span>
        <StatusBadge status={goal.status} />
      </div>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-elevated">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
        <span className="text-xs text-text-muted">{progress}%</span>
      </div>
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>
          {goal.employee.firstName} {goal.employee.lastName}
          {goal.targetDate ? ` · due ${formatDate(goal.targetDate)}` : ""}
        </span>
        <span className="flex items-center gap-1">
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            aria-label="Progress"
            className="h-1 w-24"
            disabled={update.isPending}
            onChange={(e) => update.mutate({ id: goal.id, body: { progress: Number(e.target.value) } })}
          />
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
        </span>
      </div>
    </li>
  );
}

export function PerformanceSection() {
  const { can } = usePermissions();
  const canView = can("hrms.performance.view");
  const canManage = can("hrms.performance.manage");
  const me = useMe();
  const myEmployee = useMyEmployee();
  const cycles = useReviewCycles();
  const reviews = usePerformanceReviews();
  const goals = useGoals();
  const updateCycle = useUpdateReviewCycle();
  const acknowledge = useAcknowledgePerformanceReview();
  const [cycleDialogOpen, setCycleDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState<PerformanceReview | null>(null);

  if (!canView) {
    return (
      <Card>
        <EmptyState
          icon={ShieldAlert}
          title="You don't have access to performance"
          description="Performance reviews require the hrms.performance.view permission."
        />
      </Card>
    );
  }

  if (reviews.isLoading && cycles.isLoading) return <SectionSkeleton />;
  if (reviews.isError) return <SectionError onRetry={() => reviews.refetch()} />;

  const myUserId = me.data?.id;
  const myEmployeeId = myEmployee.data?.id;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Review cycles</CardTitle>
          {canManage ? (
            <Button size="sm" variant="secondary" onClick={() => setCycleDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New cycle
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {cycles.isLoading ? (
            <div className="p-4"><SectionSkeleton rows={2} /></div>
          ) : (cycles.data ?? []).length === 0 ? (
            <p className="p-4 text-xs text-text-muted">No review cycles yet.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(cycles.data ?? []).map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5 text-text">{c.name}</td>
                    <td className="px-4 py-2.5 text-text-secondary">
                      {formatDate(c.startDate)} – {formatDate(c.endDate)}
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={c.status} /></td>
                    <td className="px-4 py-2.5 text-right">
                      {canManage ? (
                        <div className="flex justify-end gap-1">
                          {c.status !== "active" && c.status !== "closed" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={updateCycle.isPending}
                              onClick={() => updateCycle.mutate({ id: c.id, body: { status: "active" } })}
                            >
                              Activate
                            </Button>
                          ) : null}
                          {c.status === "active" ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={updateCycle.isPending}
                              onClick={() => {
                                if (window.confirm(`Close cycle "${c.name}"?`)) {
                                  updateCycle.mutate({ id: c.id, body: { status: "closed" } });
                                }
                              }}
                            >
                              Close
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Reviews</CardTitle>
          {canManage ? (
            <Button size="sm" variant="secondary" onClick={() => setReviewDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Assign review
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="p-0">
          {(reviews.data ?? []).length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No reviews"
              description="Reviews appear once a cycle is created and reviews are assigned."
            />
          ) : (
            <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-text-muted">
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-4 py-2 font-medium">Cycle</th>
                  <th className="px-4 py-2 font-medium">Rating</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {(reviews.data ?? []).map((r) => {
                  const isReviewer =
                    Boolean(r.reviewerId) && (r.reviewerId === myUserId || r.reviewerId === myEmployeeId);
                  const isReviewee = Boolean(myEmployeeId) && r.employee.id === myEmployeeId;
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-4 py-2.5 text-text">
                        {r.employee.firstName} {r.employee.lastName}
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{r.cycle?.name ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {r.overallRating != null ? (
                          <span className="flex items-center gap-1 text-text-secondary">
                            <Star className="h-3.5 w-3.5 text-warning" fill="currentColor" />
                            {r.overallRating}/5
                          </span>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {(canManage || isReviewer) && r.status !== "submitted" && r.status !== "acknowledged" ? (
                            <Button size="sm" variant="secondary" onClick={() => setSubmitting(r)}>
                              Submit review
                            </Button>
                          ) : null}
                          {isReviewee && r.status === "submitted" ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={acknowledge.isPending}
                              onClick={() => acknowledge.mutate(r.id)}
                            >
                              <Check className="mr-1 h-3.5 w-3.5" /> Acknowledge
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Goals</CardTitle>
          <Button size="sm" variant="secondary" onClick={() => setGoalDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New goal
          </Button>
        </CardHeader>
        <CardContent>
          {goals.isLoading ? (
            <SectionSkeleton rows={2} />
          ) : (goals.data ?? []).length === 0 ? (
            <EmptyState
              icon={Target}
              title="No goals"
              description="Create a goal to track progress through the review cycle."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {(goals.data ?? []).map((g) => (
                <GoalRow key={g.id} goal={g} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <CycleDialog open={cycleDialogOpen} onOpenChange={setCycleDialogOpen} />
      <CreateReviewDialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen} />
      <GoalDialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen} />
      {submitting ? (
        <SubmitReviewDialog
          review={submitting}
          open={Boolean(submitting)}
          onOpenChange={(o) => { if (!o) setSubmitting(null); }}
        />
      ) : null}
    </div>
  );
}
