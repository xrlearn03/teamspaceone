import { useState } from "react";
import { Gavel, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { Badge } from "@teamspace-one/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@teamspace-one/ui/dialog";
import { useMakeHiringDecision } from "../../hooks/api";
import { cn } from "../../lib/utils";

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

const DECISION_OPTIONS = [
  { value: "offer", label: "Offer" },
  { value: "hire", label: "Hire" },
  { value: "reject", label: "Reject" },
  { value: "hold", label: "Hold" },
];

export function HiringDecisionButton({
  applicationId,
  candidateName,
}: {
  applicationId: string;
  candidateName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState("");
  const [rationale, setRationale] = useState("");
  const [saved, setSaved] = useState(false);
  const { mutate, isPending } = useMakeHiringDecision();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision) return;
    setSaved(false);
    mutate(
      { applicationId, decision: decision as "offer" | "hire" | "reject" | "hold", rationale },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setOpen(false), 600);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isPending}
        className="h-7 gap-1 text-xs"
      >
        <Gavel className="h-3.5 w-3.5" />
        Decide
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Gavel className="h-4 w-4 text-primary" />
            Hiring decision{candidateName ? ` — ${candidateName}` : ""}
          </DialogTitle>
          <DialogDescription>
            Record the final hiring decision for this application.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 p-4 pt-2">
          <Field label="Decision">
            <select
              className="flex h-9 w-full rounded-md border bg-surface px-3 py-1 text-sm shadow-sm focus-visible:border-primary"
              value={decision}
              onChange={(e) => {
                setDecision(e.target.value);
                setSaved(false);
              }}
              required
            >
              <option value="">—</option>
              {DECISION_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rationale">
            <TextArea
              value={rationale}
              onChange={(e) => {
                setRationale(e.target.value);
                setSaved(false);
              }}
              placeholder="Reasoning for this decision..."
              rows={4}
            />
          </Field>
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !decision}
            >
              {isPending ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Record decision
            </Button>
            {saved && (
              <Badge variant="success" className="font-normal">
                <CheckCircle className="mr-1 h-3 w-3" />
                Saved
              </Badge>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
