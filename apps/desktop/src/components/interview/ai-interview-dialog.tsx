import { useState } from "react";
import { Bot, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { Badge } from "@teamspace-one/ui/badge";
import { Input } from "@teamspace-one/ui/input";
import { useUIStore } from "../../stores/ui";
import { useReviewEvaluation } from "../../hooks/api";
import { cn } from "../../lib/utils";
import type { InterviewEvaluation } from "../../lib/api";

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

/** Human review / override form for an AI-generated interview evaluation. */
export function EvaluationReviewForm({ evaluation }: { evaluation: InterviewEvaluation }) {
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

/** Opens the full AI interview call screen for a session. */
export function AiInterviewButton({
  sessionId,
}: {
  sessionId: string;
  candidateName?: string;
}) {
  const setActiveView = useUIStore((s) => s.setActiveView);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setActiveView("ai-interview", { interviewSessionId: sessionId })}
      className="h-7 gap-1 text-xs"
    >
      <Bot className="h-3.5 w-3.5" />
      AI interview
    </Button>
  );
}
