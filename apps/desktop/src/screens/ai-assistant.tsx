import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, ThumbsUp, RotateCcw, Save, CheckSquare } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { useAskAI, useCreateTask, useMe, useProjects } from "../hooks/api";
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

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function AIAssistantScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [helpful, setHelpful] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>(savedResponses);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { data: user } = useMe();
  const askAI = useAskAI();
  const createTask = useCreateTask();
  const { data: projects } = useProjects();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function ask(prompt: string) {
    if (!prompt.trim()) return;
    const userMessage = { id: Date.now().toString(), role: "user" as const, content: prompt };
    setMessages((prev) => [...prev, userMessage]);
    setDraft("");
    setStreaming(true);
    try {
      const result = await askAI.mutateAsync({ question: prompt });
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: result.answer,
        },
      ]);
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

  function createTaskFrom(content: string) {
    const project = projects?.[0];
    if (!project) return;
    const title = content.split("\n").find(Boolean)?.replace(/^[-*#\s]+/, "").slice(0, 300) || "AI-generated task";
    createTask.mutate({ projectId: project.id, title, description: content });
  }

  const userName =
    user?.firstName
      ? `${user.firstName} ${user.lastName ?? ""}`.trim()
      : user?.email ?? "You";
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center gap-3 border-b px-6">
        <Sparkles className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold text-text">AI Assistant</h1>
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
                {m.role === "assistant" && (
                  <div className="mt-3 flex items-center gap-1">
                    <Button variant={helpful.includes(m.id) ? "secondary" : "ghost"} size="icon" onClick={() => setHelpful((items) => items.includes(m.id) ? items.filter((id) => id !== m.id) : [...items, m.id])} aria-label="Mark response helpful">
                      <ThumbsUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => regenerate(m.id)} disabled={streaming} aria-label="Regenerate response">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant={saved.includes(m.content) ? "secondary" : "ghost"} size="icon" onClick={() => saveResponse(m.content)} aria-label="Save response">
                      <Save className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => createTaskFrom(m.content)} disabled={!projects?.length || createTask.isPending} aria-label="Create task from response">
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
    </div>
  );
}
