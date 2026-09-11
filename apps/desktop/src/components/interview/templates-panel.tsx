import { useState } from "react";
import { FileText, Plus, Pencil, Trash2, Loader2, CheckCircle, X } from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { Badge } from "@teamspace-one/ui/badge";
import { Input } from "@teamspace-one/ui/input";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@teamspace-one/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@teamspace-one/ui/dialog";
import { usePermissions } from "../../hooks/usePermissions";
import {
  useInterviewTemplates,
  useCreateInterviewTemplate,
  useUpdateInterviewTemplate,
  useDeleteInterviewTemplate,
} from "../../hooks/api";
import { cn } from "../../lib/utils";
import type { InterviewTemplate, InterviewTemplateQuestion } from "../../lib/api";

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

function QuestionList({
  questions,
  onChange,
}: {
  questions: InterviewTemplateQuestion[];
  onChange: (q: InterviewTemplateQuestion[]) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">Questions</span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onChange([...questions, { question: "", category: "" }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add
        </Button>
      </div>
      <div className="space-y-2">
        {questions.map((q, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="grid flex-1 gap-2">
              <Input
                value={q.question}
                onChange={(e) => {
                  const next = [...questions];
                  next[i] = { ...next[i], question: e.target.value };
                  onChange(next);
                }}
                placeholder="Question"
              />
              <Input
                value={q.category ?? ""}
                onChange={(e) => {
                  const next = [...questions];
                  next[i] = { ...next[i], category: e.target.value };
                  onChange(next);
                }}
                placeholder="Category"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(questions.filter((_, idx) => idx !== i))}
              className="mt-0.5"
            >
              <Trash2 className="h-4 w-4 text-error" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TemplateDialog({
  template,
  open,
  onOpenChange,
}: {
  template?: InterviewTemplate;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const isEdit = Boolean(template);
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [difficulty, setDifficulty] = useState(template?.config?.difficulty ?? "medium");
  const [duration, setDuration] = useState(template?.config?.duration ?? 60);
  const [categories, setCategories] = useState((template?.config?.categories ?? []).join(", "));
  const [questions, setQuestions] = useState<InterviewTemplateQuestion[]>(
    template?.questions?.map((q) => ({ question: q.question, category: q.category ?? "" })) ?? [],
  );
  const [saved, setSaved] = useState(false);
  const create = useCreateInterviewTemplate();
  const update = useUpdateInterviewTemplate();
  const isPending = create.isPending || update.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const body = {
      name: name.trim(),
      description: description.trim() || undefined,
      config: {
        difficulty,
        duration: Number(duration) || 0,
        categories: categories
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
      },
      questions: questions.filter((q) => q.question.trim()).map((q, i) => ({
        question: q.question.trim(),
        category: q.category?.trim() || undefined,
        sortOrder: i,
      })),
    };
    setSaved(false);
    if (isEdit && template) {
      update.mutate(
        { id: template.id, body },
        {
          onSuccess: () => {
            setSaved(true);
            setTimeout(() => onOpenChange(false), 400);
          },
        },
      );
    } else {
      create.mutate(body, {
        onSuccess: () => {
          setSaved(true);
          setName("");
          setDescription("");
          setDifficulty("medium");
          setDuration(60);
          setCategories("");
          setQuestions([]);
          setTimeout(() => onOpenChange(false), 400);
        },
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-primary" />
            {isEdit ? "Edit template" : "New interview template"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this template and its questions."
              : "Create a reusable AI interview template."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto p-4 pt-2">
          <Field label="Name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Senior Frontend Screen"
              required
            />
          </Field>
          <Field label="Description">
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this template is for"
              rows={2}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Difficulty">
              <select
                className="flex h-9 w-full rounded-md border bg-surface px-3 py-1 text-sm shadow-sm focus-visible:border-primary"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </Field>
            <Field label="Duration (min)">
              <Input
                type="number"
                min={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Categories (comma-separated)">
            <Input
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="e.g. frontend, algorithms, leadership"
            />
          </Field>
          <QuestionList questions={questions} onChange={setQuestions} />
          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
              {isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {isEdit ? "Update" : "Create"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
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

export function TemplatesSection() {
  const { can } = usePermissions();
  const { data: templates, isLoading } = useInterviewTemplates();
  const [editing, setEditing] = useState<InterviewTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const remove = useDeleteInterviewTemplate();
  const canView = can("interview.template.view");
  const canCreate = can("interview.template.create");
  const canEdit = can("interview.template.edit");
  const canDelete = can("interview.template.delete");

  if (!canView) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={X}
          title="Templates hidden"
          description="You don't have permission to view interview templates."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Interview templates</CardTitle>
            <Badge variant="secondary">{templates?.length ?? 0}</Badge>
          </div>
          {canCreate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setCreating(true);
                setEditing(null);
              }}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              New template
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : templates && templates.length > 0 ? (
            <div className="divide-y">
              {templates.map((t) => (
                <div key={t.id} className="flex items-start justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{t.name}</p>
                    <p className="mt-0.5 truncate text-xs text-text-muted">
                      {t.description || "No description"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {t.config?.difficulty && (
                        <Badge variant="secondary" className="font-normal capitalize">
                          {t.config.difficulty}
                        </Badge>
                      )}
                      {t.config?.duration && (
                        <Badge variant="secondary" className="font-normal">
                          {t.config.duration} min
                        </Badge>
                      )}
                      {t.config?.categories?.map((c, i) => (
                        <Badge key={i} variant="default" className="font-normal">
                          {c}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="ml-2 flex gap-1">
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(t);
                          setCreating(false);
                        }}
                        className="h-7 gap-1 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`Delete the template "${t.name}"?`)) {
                            remove.mutate(t.id);
                          }
                        }}
                        className="h-7 gap-1 text-xs text-error"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={FileText} title="No templates" description="Create a template to reuse for AI interviews." />
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <TemplateDialog
          template={editing ?? undefined}
          open={creating || Boolean(editing)}
          onOpenChange={(v) => {
            if (!v) {
              setCreating(false);
              setEditing(null);
            }
          }}
        />
      )}
    </div>
  );
}
