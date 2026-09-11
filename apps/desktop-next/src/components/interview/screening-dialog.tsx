import { useState } from "react";
import { Sparkles, RefreshCw, AlertTriangle, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { Badge } from "@teamspace-one/ui/badge";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@teamspace-one/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { useRunApplicationScreening, useReviewApplicationScreening } from "@/hooks/api";

function ScoreBar({ value, color = "bg-primary" }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
      <div
        className={`h-2 rounded-full ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function RunScreeningButton({
  applicationId,
  hasResume,
}: {
  applicationId: string;
  hasResume?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { can } = usePermissions();
  const { data: result, isPending, error, mutate: run, reset } = useRunApplicationScreening();
  const { mutate: review, isPending: reviewing } = useReviewApplicationScreening();

  function handleOpen() {
    setOpen(true);
    reset();
    run({ applicationId });
  }

  function handleRetry() {
    reset();
    run({ applicationId });
  }

  const canReview = can("interview.interview.approve");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        disabled={isPending || hasResume === false}
        title={hasResume === false ? "Upload a resume for this candidate first" : undefined}
        className="h-7 gap-1 text-xs"
      >
        {isPending && open ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        Screen
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI screening
          </DialogTitle>
          <DialogDescription>
            AI-generated match analysis for this application.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4 pt-2">
          {isPending && !result && (
            <div className="space-y-2">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          )}
          {error && !result && (
            <EmptyState
              icon={AlertTriangle}
              title="Screening failed"
              description={error instanceof Error ? error.message : "Could not run AI screening."}
              action={
                <Button size="sm" onClick={handleRetry}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Retry
                </Button>
              }
            />
          )}
          {result && (
            <div className="space-y-4 text-sm">
              {result.status === "ai_generated" ? (
                <Badge variant="warning" className="w-fit">
                  AI-generated — requires human review
                </Badge>
              ) : (
                <Badge variant="success" className="w-fit">
                  <CheckCircle className="mr-1 h-3 w-3" />
                  Reviewed
                </Badge>
              )}

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-text">Match score</span>
                  <Badge variant="default">{result.matchScore != null ? `${Math.round(result.matchScore)}%` : "—"}</Badge>
                </div>
                <ScoreBar value={result.matchScore ?? 0} />
              </div>

              <div>
                <span className="font-medium text-text">Skills found</span>
                {result.skillsFound.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {result.skillsFound.map((s, i) => (
                      <Badge key={i} variant="success" className="font-normal">
                        {s}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-text-muted">None identified</p>
                )}
              </div>

              <div>
                <span className="font-medium text-text">Missing requirements</span>
                {result.missingRequirements.length > 0 ? (
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {result.missingRequirements.map((m, i) => (
                      <Badge key={i} variant="error" className="font-normal">
                        {m}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-text-muted">None</p>
                )}
              </div>

              <div>
                <span className="font-medium text-text">Summary</span>
                <p className="mt-1 leading-relaxed text-text-secondary">{result.summary}</p>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="font-medium text-text">Confidence</span>
                  <span className="text-text-muted capitalize">{result.confidence}</span>
                </div>
                <ScoreBar
                  value={
                    ({ low: 33, medium: 66, high: 100 } as Record<string, number>)[result.confidence] ?? 0
                  }
                />
              </div>

              {result.status === "ai_generated" && canReview && (
                <div className="flex justify-end pt-2">
                  <Button
                    size="sm"
                    disabled={reviewing}
                    onClick={() => review(applicationId)}
                  >
                    {reviewing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                    Mark reviewed
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
