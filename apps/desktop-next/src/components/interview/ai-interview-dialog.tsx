import { useState } from "react";
import {
  Bot,
  CheckCircle,
  Sparkles,
  Send,
  RefreshCw,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { Badge } from "@teamspace-one/ui/badge";
import { Input } from "@teamspace-one/ui/input";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Card, CardContent } from "@teamspace-one/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@teamspace-one/ui/dialog";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useStartAiInterview,
  useSubmitAiAnswer,
  useAiTranscript,
  useEvaluateAiInterview,
  useReviewEvaluation,
} from "@/hooks/api";
import { cn } from "@/lib/utils";
import type { InterviewAnswer, InterviewEvaluation } from "@/lib/api";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {children}
    </label>
  );
}

function TextArea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border bg-surface px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-text-muted focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function ScoreBar({ value, color = "bg-primary" }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ScoreInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        min={0}
        max={100}
        value={value ?? ""}
        onChange={(e) => {
          const n = e.target.value === "" ? undefined : Number(e.target.value);
          onChange(n);
        }}
      />
    </Field>
  );
}

function ReviewForm({ evaluation }: { evaluation: InterviewEvaluation }) {
  const { mutate, isPending } = useReviewEvaluation();
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    technicalScore: evaluation.technicalScore,
    communicationScore: evaluation.communicationScore,
    problemSolvingScore: evaluation.problemSolvingScore,
    cultureFitScore: evaluation.cultureFitScore,
    overallScore: evaluation.overallScore,
    recommendation: evaluation.recommendation ?? "",
    comments: evaluation.comments ?? "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaved(false);
    mutate(
      { evaluationId: evaluation.id, body: form },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2">
      <p className="text-xs font-medium text-text-secondary">Human review / override</p>
      <div className="grid grid-cols-2 gap-3">
        <ScoreInput
          label="Technical"
          value={form.technicalScore}
          onChange={(v) => setForm((s) => ({ ...s, technicalScore: v }))}
        />
        <ScoreInput
          label="Communication"
          value={form.communicationScore}
          onChange={(v) => setForm((s) => ({ ...s, communicationScore: v }))}
        />
        <ScoreInput
          label="Problem solving"
          value={form.problemSolvingScore}
          onChange={(v) => setForm((s) => ({ ...s, problemSolvingScore: v }))}
        />
        <ScoreInput
          label="Culture fit"
          value={form.cultureFitScore}
          onChange={(v) => setForm((s) => ({ ...s, cultureFitScore: v }))}
        />
      </div>
      <ScoreInput
        label="Overall score"
        value={form.overallScore}
        onChange={(v) => setForm((s) => ({ ...s, overallScore: v }))}
      />
      <Field label="Recommendation">
        <Input
          value={form.recommendation}
          onChange={(e) => setForm((s) => ({ ...s, recommendation: e.target.value }))}
          placeholder="e.g. Strong hire, No hire, Hold"
        />
      </Field>
      <Field label="Comments">
        <TextArea
          value={form.comments}
          onChange={(e) => setForm((s) => ({ ...s, comments: e.target.value }))}
          placeholder="Add notes or overrides..."
        />
      </Field>
      <div className="flex items-center gap-2 pt-1">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Submit review
        </Button>
        {saved && (
          <Badge variant="success" className="font-normal">
            <CheckCircle className="mr-1 h-3 w-3" />
            Saved
          </Badge>
        )}
      </div>
    </form>
  );
}

export function AiInterviewButton({
  sessionId,
  candidateName,
}: {
  sessionId: string;
  candidateName?: string;
}) {
  const [open, setOpen] = useState(false);
  const { can } = usePermissions();
  const [started, setStarted] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState<{ question: string; sortOrder?: number } | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [done, setDone] = useState(false);
  const [evaluation, setEvaluation] = useState<InterviewEvaluation | null>(null);

  const {
    data: transcript,
    isLoading: transcriptLoading,
    refetch,
  } = useAiTranscript(open ? sessionId : undefined);
  const start = useStartAiInterview();
  const submit = useSubmitAiAnswer();
  const evaluate = useEvaluateAiInterview();

  function reset() {
    setStarted(false);
    setCurrentQuestion(null);
    setQuestionIndex(0);
    setAnswer("");
    setDone(false);
    setEvaluation(null);
  }

  function handleOpen() {
    setOpen(true);
    reset();
    start.mutate(
      { sessionId },
      {
        onSuccess: (res) => {
          setStarted(true);
          if (res.questions.length > 0) {
            setCurrentQuestion(res.questions[0]);
            setQuestionIndex(0);
          } else {
            setDone(true);
          }
        },
      },
    );
  }

  function handleNext(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    submit.mutate(
      { sessionId, questionIndex, answer: answer.trim() },
      {
        onSuccess: (res) => {
          setAnswer("");
          void refetch();
          if (res.next) {
            setCurrentQuestion(res.next);
            setQuestionIndex((i) => i + 1);
          } else {
            setCurrentQuestion(null);
            setDone(true);
          }
        },
      },
    );
  }

  function handleEvaluate() {
    evaluate.mutate(sessionId, {
      onSuccess: (data) => setEvaluation(data),
    });
  }

  const completedAnswers = (transcript ?? []).filter((a: InterviewAnswer) => a.answer);
  const isBusy = start.isPending || submit.isPending || evaluate.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleOpen}
        disabled={isBusy}
        className="h-7 gap-1 text-xs"
      >
        {start.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
        AI interview
      </Button>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            AI interview{candidateName ? ` — ${candidateName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Answer questions one at a time. Generate an AI evaluation when complete.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4 pt-2 text-sm">
          {start.isPending && !started && (
            <div className="space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}
          {start.error && !started && (
            <EmptyState
              icon={AlertTriangle}
              title="Could not start AI interview"
              description={start.error instanceof Error ? start.error.message : "Please try again."}
              action={
                <Button size="sm" onClick={handleOpen}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Retry
                </Button>
              }
            />
          )}

          {started && (
            <>
              {currentQuestion && !done && (
                <Card>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex items-start gap-2">
                      <Badge variant="secondary" className="shrink-0">
                        Q{questionIndex + 1}
                      </Badge>
                      <p className="font-medium text-text">{currentQuestion.question}</p>
                    </div>
                    <form onSubmit={handleNext} className="space-y-2">
                      <TextArea
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Type your answer here..."
                        rows={4}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={!answer.trim() || submit.isPending}
                        >
                          {submit.isPending ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="mr-1 h-3.5 w-3.5" />
                          )}
                          {questionIndex === 0 && !completedAnswers.length ? "Start" : "Next"}
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              )}

              <div>
                <p className="mb-1.5 text-xs font-medium text-text-secondary">Transcript</p>
                {transcriptLoading && !transcript ? (
                  <Skeleton className="h-16 w-full" />
                ) : completedAnswers.length > 0 ? (
                  <div className="space-y-2">
                    {completedAnswers.map((a: InterviewAnswer, i) => (
                      <Card key={i} className="bg-surface-elevated/50">
                        <CardContent className="p-3">
                          <p className="font-medium text-text">{a.question}</p>
                          <p className="mt-1 text-text-secondary">{a.answer}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-text-muted">No answers yet.</p>
                )}
              </div>

              {done && !evaluation && (
                <div className="flex justify-center pt-2">
                  <Button onClick={handleEvaluate} disabled={evaluate.isPending}>
                    {evaluate.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                    )}
                    Generate AI evaluation
                  </Button>
                </div>
              )}

              {evaluate.error && !evaluation && (
                <p className="text-center text-error">
                  {evaluate.error instanceof Error ? evaluate.error.message : "Evaluation failed"}
                </p>
              )}

              {evaluation && (
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-text">AI evaluation</h4>
                    <Badge variant="warning" className="font-normal">
                      <Sparkles className="mr-1 h-3 w-3" />
                      AI-generated
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    {[
                      { label: "Technical", value: evaluation.technicalScore },
                      { label: "Communication", value: evaluation.communicationScore },
                      { label: "Problem solving", value: evaluation.problemSolvingScore },
                      { label: "Culture fit", value: evaluation.cultureFitScore },
                      { label: "Overall", value: evaluation.overallScore },
                    ].map((s) => (
                      <div key={s.label}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-text-secondary">{s.label}</span>
                          <span className="text-text">
                            {s.value === undefined ? "—" : Math.round(s.value)}
                          </span>
                        </div>
                        <ScoreBar value={s.value ?? 0} />
                      </div>
                    ))}
                  </div>

                  {evaluation.recommendation && (
                    <div>
                      <span className="font-medium text-text">Recommendation</span>
                      <p className="mt-0.5 text-text-secondary">{evaluation.recommendation}</p>
                    </div>
                  )}

                  {evaluation.aiMetadata?.suggestedFollowUps &&
                    evaluation.aiMetadata.suggestedFollowUps.length > 0 && (
                      <div>
                        <span className="font-medium text-text">Suggested follow-ups</span>
                        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-text-secondary">
                          {evaluation.aiMetadata.suggestedFollowUps.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {can("interview.interview.edit-evaluation") && (
                    <ReviewForm evaluation={evaluation} />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
