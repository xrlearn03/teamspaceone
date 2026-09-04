import { useState, useRef, useEffect } from "react";
import { AlertCircle, Sparkles, Send, ThumbsUp, RotateCcw, Save, CheckSquare, Copy, Check, BookOpen } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAskAI, useConfirmAIAction, useCreateTask, useDeclineAIAction, useMe, useOrganisations, usePendingAIActions, useProjects } from "../hooks/api";
import { useUIStore } from "../stores/ui";
import { cn } from "../lib/utils";

const suggestions = [
  "Summarize what changed today.",
  "What decisions were made in this project?",
  "Which tasks are overdue?",
  "Find unanswered questions.",
  "Summarize this channel.",
  "Create tasks from this discussion.",
];

function savedResponses(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem("teamspace-one:savedAiResponses") ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

interface Source {
  resourceType: string;
  resourceId: string;
  title: string;
  text: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

interface PendingAction {
  kind: "create-task";
  title: string;
  description: string;
  projectId: string;
}

export function AIAssistantScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [helpful, setHelpful] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>(savedResponses);
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [pendingActionsDialogOpen, setPendingActionsDialogOpen] = useState(false);
  const [editingSummaries, setEditingSummaries] = useState<Record<string, string>>({});
  const hasAutoOpened = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: user } = useMe();
  const askAI = useAskAI();
  const createTask = useCreateTask();
  const { data: projects } = useProjects();
  const { data: organisations } = useOrganisations();
  const { data: pendingActions } = usePendingAIActions();
  const confirmAIAction = useConfirmAIAction();
  const declineAIAction = useDeclineAIAction();
  const organisationId = useUIStore((s) => s.organisationId);
  const organisation = organisations?.find((o) => o.id === organisationId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (pendingActions?.length && !hasAutoOpened.current && !pendingActionsDialogOpen) {
      hasAutoOpened.current = true;
      setPendingActionsDialogOpen(true);
    }
  }, [pendingActions, pendingActionsDialogOpen]);

  async function ask(prompt: string) {
    if (!prompt.trim()) return;
    const userMessage = { id: Date.now().toString(), role: "user" as const, content: prompt };
    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setStreaming(true);
    try {
      const result = await askAI.mutateAsync({ question: prompt });
      // Progressive reveal: the AI service returns the full answer (no SSE yet),
      // so we stream it to the UI in chunks for a streaming feel.
      const id = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id, role: "assistant", content: "", sources: result.sources }]);
      const full = result.answer;
      const chunk = Math.max(2, Math.ceil(full.length / 80));
      await new Promise<void>((resolve) => {
        let index = 0;
        const timer = setInterval(() => {
          index = Math.min(full.length, index + chunk);
          const text = full.slice(0, index);
          setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, content: text } : m)));
          if (index >= full.length) {
            clearInterval(timer);
            resolve();
          }
        }, 24);
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Sorry, I couldn't process that. Please try again.",
        },
      ]);
    } finally {
      setStreaming(false);
    }
  }

  function regenerate(messageId: string) {
    const index = messages.findIndex((message) => message.id === messageId);
    const prompt = messages.slice(0, index).reverse().find((message) => message.role === "user")?.content;
    if (prompt) void ask(prompt);
  }

  function saveResponse(content: string) {
    const next = saved.includes(content) ? saved.filter((item) => item !== content) : [...saved, content];
    setSaved(next);
    localStorage.setItem("teamspace-one:savedAiResponses", JSON.stringify(next));
  }

  function copyResponse(message: Message) {
    void navigator.clipboard.writeText(message.content).then(() => {
      setCopied(message.id);
      setTimeout(() => setCopied((current) => (current === message.id ? null : current)), 2000);
    });
  }

  // Modifying actions are never executed silently: open a confirmation
  // dialog that describes exactly what will change before mutating.
  function requestTaskFrom(content: string) {
    const project = projects?.[0];
    if (!project) return;
    const title = content.split("\n").find(Boolean)?.replace(/^[-*#\s]+/, "").slice(0, 300) || "AI-generated task";
    setPendingAction({ kind: "create-task", title, description: content, projectId: project.id });
  }

  function confirmPendingAction() {
    if (!pendingAction) return;
    createTask.mutate(
      { projectId: pendingAction.projectId, title: pendingAction.title, description: pendingAction.description },
      { onSettled: () => setPendingAction(null) },
    );
  }

  const pendingProject = projects?.find((p) => p.id === pendingAction?.projectId);

  const userName =
    user?.firstName
      ? `${user.firstName} ${user.lastName ?? ""}`.trim()
      : user?.email ?? "You";
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between gap-3 border-b px-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold text-text">AI Assistant</h1>
        </div>
        {pendingActions && pendingActions.length > 0 && (
          <Button variant="secondary" size="sm" onClick={() => setPendingActionsDialogOpen(true)}>
            <AlertCircle className="mr-1.5 h-4 w-4" />
            {pendingActions.length} pending action{pendingActions.length === 1 ? "" : "s"}
          </Button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 && !streaming && (
            <div className="text-center text-sm text-text-muted">
              Ask me anything about your workspace.
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex gap-3",
                m.role === "user" && "flex-row-reverse",
              )}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className={m.role === "user" ? "bg-primary-subtle text-primary" : "bg-primary text-white"}>
                  {m.role === "user" ? userInitial : "AI"}
                </AvatarFallback>
              </Avatar>
              <Card className={cn("max-w-xl p-3", m.role === "user" && "bg-primary-subtle")}>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
                  {m.content}
                </p>
                {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                  <div className="mt-3 border-t pt-2">
                    <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                      <BookOpen className="h-3 w-3" />
                      Sources
                    </p>
                    <div className="space-y-1">
                      {m.sources.map((source) => (
                        <div key={`${source.resourceType}:${source.resourceId}`} className="flex items-center gap-2 text-xs">
                          <Badge variant="secondary" className="capitalize">{source.resourceType}</Badge>
                          <span className="truncate text-text-secondary">{source.title || source.resourceId}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {m.role === "assistant" && (
                  <div className="mt-3 flex items-center gap-1">
                    <Button variant={helpful.includes(m.id) ? "secondary" : "ghost"} size="icon" onClick={() => setHelpful((items) => items.includes(m.id) ? items.filter((id) => id !== m.id) : [...items, m.id])} aria-label="Mark response helpful">
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => copyResponse(m)} aria-label="Copy response">
                      {copied === m.id ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => regenerate(m.id)} disabled={streaming} aria-label="Regenerate response">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant={saved.includes(m.content) ? "secondary" : "ghost"} size="icon" onClick={() => saveResponse(m.content)} aria-label="Save response">
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => requestTaskFrom(m.content)} disabled={!projects?.length || createTask.isPending} aria-label="Create task from response">
                      <CheckSquare className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          ))}
          {streaming && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Sparkles className="h-4 w-4 animate-pulse" />
              AI is thinking...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t p-4">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="rounded-full border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-primary"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2 rounded-lg border bg-surface p-2">
            <Input
              placeholder="Ask about anything in your workspace"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(draft);
                }
              }}
              className="flex-1 border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
            />
            <Button size="icon" onClick={() => ask(draft)} disabled={streaming || askAI.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={pendingAction !== null} onOpenChange={(open) => { if (!open) setPendingAction(null); }}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader>
            <DialogTitle>Confirm AI action</DialogTitle>
            <DialogDescription>The assistant wants to make a change in your workspace. Review it before anything is created.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-4">
            <div className="rounded-md border bg-surface-elevated p-3 text-sm">
              <div className="flex justify-between gap-4 py-1">
                <span className="text-text-muted">Action</span>
                <span className="font-medium text-text">Create task</span>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <span className="text-text-muted">Organisation</span>
                <span className="font-medium text-text">{organisation?.name ?? "Current organisation"}</span>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <span className="text-text-muted">Project</span>
                <span className="font-medium text-text">{pendingProject?.name ?? pendingAction?.projectId}</span>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <span className="text-text-muted">Status</span>
                <span className="font-medium text-text">Backlog</span>
              </div>
              <div className="border-t pt-2">
                <span className="text-text-muted">Title</span>
                <p className="mt-0.5 font-medium text-text">{pendingAction?.title}</p>
              </div>
              <div className="pt-2">
                <span className="text-text-muted">Description</span>
                <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-text-secondary">{pendingAction?.description}</p>
              </div>
            </div>
            {createTask.error ? <p className="text-sm text-error">{createTask.error.message}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingAction(null)} disabled={createTask.isPending}>Cancel</Button>
              <Button onClick={confirmPendingAction} disabled={createTask.isPending}>
                {createTask.isPending ? "Creating…" : "Confirm"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingActionsDialogOpen} onOpenChange={(open) => { if (!open) setPendingActionsDialogOpen(false); }}>
        <DialogContent className="max-w-lg p-0">
          <DialogHeader>
            <DialogTitle>Confirm AI actions</DialogTitle>
            <DialogDescription>Review and edit before the assistant creates or sends anything.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-3 overflow-y-auto px-4 pb-4">
            {pendingActions?.length === 0 && <p className="text-sm text-text-secondary">No pending actions.</p>}
            {pendingActions?.map((action) => (
              <div key={action.id} className="rounded-md border bg-surface-elevated p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="capitalize">{action.actionType.replace(/_/g, " ")}</Badge>
                  <span className="text-xs text-text-muted">{new Date(action.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 font-medium text-text">
                  {action.actionType === "create_task" ? (action.payload.title as string) ?? "Untitled task" : (action.payload.title as string) ?? "Meeting summary email"}
                </p>
                {action.actionType === "create_task" && action.payload.description ? (
                  <p className="mt-1 line-clamp-2 text-text-secondary">{action.payload.description as string}</p>
                ) : null}
                {action.actionType === "send_meeting_summary_email" && (
                  <div className="mt-2">
                    <label className="text-xs text-text-secondary">Summary email</label>
                    <textarea
                      className="mt-1 w-full min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm text-text outline-none focus:ring-2 focus:ring-primary"
                      value={editingSummaries[action.id] ?? (action.payload.summary as string) ?? ""}
                      onChange={(e) => setEditingSummaries((prev) => ({ ...prev, [action.id]: e.target.value }))}
                    />
                  </div>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => declineAIAction.mutate(action.id)} disabled={declineAIAction.isPending}>Decline</Button>
                  <Button size="sm" disabled={confirmAIAction.isPending} onClick={() => confirmAIAction.mutate({ id: action.id, edits: action.actionType === "send_meeting_summary_email" ? { summary: editingSummaries[action.id] ?? action.payload.summary } : undefined })}>
                    {confirmAIAction.isPending ? "Confirming…" : "Confirm"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
