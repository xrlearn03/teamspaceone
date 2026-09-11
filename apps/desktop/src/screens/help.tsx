import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Mail,
  MessageCircle,
  Search,
  Send,
  User,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasAnyPermission, ADMIN_PERMISSIONS } from "@teamspace-one/authorization";
import { Button } from "@teamspace-one/ui/button";
import { Card } from "@teamspace-one/ui/card";
import { Input } from "@teamspace-one/ui/input";
import { UserAvatar } from "../components/user-avatar";
import { useMe } from "../hooks/api";
import { useUIStore } from "../stores/ui";
import { cn } from "../lib/utils";

type Tab = "tutorials" | "faqs" | "chat" | "contact";

interface Tutorial {
  id: string;
  title: string;
  description: string;
  steps: string[];
}

interface Faq {
  id: string;
  question: string;
  answer: string;
}

interface ChatMessage {
  id: string;
  role: "bot" | "user" | "agent";
  text: string;
}

const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "tutorials", label: "Tutorials", icon: BookOpen },
  { id: "faqs", label: "FAQs", icon: HelpCircle },
  { id: "chat", label: "Live Chat", icon: MessageCircle },
  { id: "contact", label: "Contact us", icon: Mail },
];

const tutorials: Tutorial[] = [
  {
    id: "get-started",
    title: "Get started with Teamspace One",
    description: "Set up your workspace and invite your team in minutes.",
    steps: [
      "Create your organisation from the workspace switcher or sign-up flow.",
      "Invite members by email and assign them a role (admin, member, guest, etc.).",
      "Create workspaces to separate teams, projects, or departments.",
      "Pin important channels and configure notifications in Settings.",
    ],
  },
  {
    id: "channels",
    title: "Channels and messaging",
    description: "Keep conversations organised with public, private, and direct channels.",
    steps: [
      "Create a channel from the sidebar (+) or Quick action menu.",
      "Send messages, mention colleagues with @name, and react with emoji.",
      "Start a thread by replying to a specific message.",
      "Use direct messages for one-to-one or small-group private chats.",
    ],
  },
  {
    id: "meetings",
    title: "Meetings and voice calls",
    description: "Start or schedule secure audio/video meetings.",
    steps: [
      "Click the microphone icon in a channel to start an instant voice room.",
      "Schedule a meeting from the calendar and invite participants.",
      "Join from the Meetings list or from a channel message.",
      "Share your screen, mute/unmute, and manage participants from the call UI.",
    ],
  },
  {
    id: "projects",
    title: "Projects",
    description: "Plan work, assign tasks, and track progress.",
    steps: [
      "Create a project from the Projects section or Quick action menu.",
      "Add members and define project status and due dates.",
      "Upload files, create tasks, and discuss progress in one place.",
      "Switch between list and board views as the project evolves.",
    ],
  },
  {
    id: "files",
    title: "Files and storage",
    description: "Upload, preview, and share files safely.",
    steps: [
      "Upload files from any channel, project, or the Files view.",
      "Preview images, documents, audio, and video without leaving the app.",
      "Share files by copying the link or mentioning them in messages.",
      "Check storage usage in Settings > Storage.",
    ],
  },
  {
    id: "hrms",
    title: "HRMS",
    description: "Manage people operations from onboarding to payroll.",
    steps: [
      "Open the HRMS view to see employees, attendance, and leave.",
      "Run onboarding and offboarding workflows from the lifecycle tabs.",
      "Process payroll drafts, approvals, and exports.",
      "Review performance and analytics dashboards for your team.",
    ],
  },
  {
    id: "interview",
    title: "AI Interviews",
    description: "Hire faster with structured interviews and candidate tracking.",
    steps: [
      "Create a job opening from the Interview view.",
      "Add candidates and schedule AI or manual interviews.",
      "Collect feedback and move candidates through hiring stages.",
      "An approved hire automatically triggers HRMS onboarding.",
    ],
  },
  {
    id: "ai",
    title: "AI Assistant",
    description: "Get answers and complete tasks with the built-in AI.",
    steps: [
      "Open the AI Assistant from the app rail.",
      "Ask questions about your organisation, projects, or HR data.",
      "Approve or reject AI-suggested actions from the Pending actions panel.",
      "Use natural language to generate summaries or find information.",
    ],
  },
  {
    id: "permissions",
    title: "Roles and permissions",
    description: "Control who can see and do what.",
    steps: [
      "Admins manage roles from Settings > Organisation > Roles.",
      "Create custom roles with specific permissions and data scopes.",
      "Invite users with a role that matches their responsibilities.",
      "Guests and external roles are limited to assigned channels/projects.",
    ],
  },
];

const faqs: Faq[] = [
  {
    id: "reset-password",
    question: "How do I reset my password?",
    answer:
      "If you can still sign in, change your password in Settings > Privacy & security. If you're locked out, use the Forgot password link on the sign-in screen or ask an organisation admin to reset it.",
  },
  {
    id: "invite-member",
    question: "How do I invite a teammate?",
    answer:
      "Go to Settings > Organisation > Members or use the workspace switcher to invite by email. Choose the right role and optional workspace so they land with the correct permissions.",
  },
  {
    id: "create-workspace",
    question: "How do I create a workspace?",
    answer:
      "Open Settings > Organisation > Workspaces and click Create workspace. Workspaces let you group channels, projects, and meetings separately from other parts of the organisation.",
  },
  {
    id: "guest-access",
    question: "Can guests access channels and projects?",
    answer:
      "Yes. Guest and external roles can only access the channels, projects, and meetings they are explicitly added to. Their visibility is scoped per resource.",
  },
  {
    id: "permissions",
    question: "How are permissions decided?",
    answer:
      "Teamspace One uses role-based access control. The owner has full access, while other members receive permissions from their assigned roles. Custom roles can be scoped to specific organisations, workspaces, or data.",
  },
  {
    id: "recordings",
    question: "Where are meeting recordings stored?",
    answer:
      "Recordings are saved to the organisation's file storage after a call ends. You can find them in the Files view or in the meeting's detail panel.",
  },
  {
    id: "supported-platforms",
    question: "What platforms are supported?",
    answer:
      "Teamspace One runs as a desktop app on macOS and Windows. A web experience and mobile apps are also available depending on your deployment.",
  },
  {
    id: "switch-org",
    question: "How do I switch organisations?",
    answer:
      "Click the organisation switcher (the people icon or current name) in the app rail to jump between organisations you belong to.",
  },
  {
    id: "contact-support",
    question: "How do I contact support?",
    answer:
      "Use the Contact us tab to send an email, or start a Live Chat to talk with the AI assistant and, if needed, be transferred to a real support agent.",
  },
];

const CHAT_CATEGORIES = ["Account", "Billing", "Technical issue", "Feature request", "Other"];

const SUPPORT_EMAIL = "support@teamspaceone.in";

function TutorialsPanel() {
  const [query, setQuery] = useState("");
  const filtered = tutorials.filter(
    (t) =>
      t.title.toLowerCase().includes(query.toLowerCase()) ||
      t.description.toLowerCase().includes(query.toLowerCase()) ||
      t.steps.some((s) => s.toLowerCase().includes(query.toLowerCase())),
  );

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <Input
          placeholder="Search tutorials"
          className="pl-8"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-text-muted">No tutorials match your search.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((tutorial) => (
            <Card key={tutorial.id} className="p-4">
              <h3 className="text-sm font-semibold text-text">{tutorial.title}</h3>
              <p className="mt-1 text-xs text-text-secondary">{tutorial.description}</p>
              <ol className="mt-3 list-decimal space-y-1 pl-4 text-xs text-text-secondary">
                {tutorial.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function FaqsPanel() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {faqs.map((faq) => {
        const open = openId === faq.id;
        return (
          <Card key={faq.id} className="p-0">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : faq.id)}
              className="flex w-full items-center justify-between gap-2 p-4 text-left"
            >
              <span className="text-sm font-medium text-text">{faq.question}</span>
              {open ? (
                <ChevronUp className="h-4 w-4 shrink-0 text-text-muted" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
              )}
            </button>
            {open ? (
              <div className="border-t px-4 pb-4 pt-2">
                <p className="text-sm text-text-secondary">{faq.answer}</p>
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}

function ChatPanel() {
  const { data: me } = useMe();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stage, setStage] = useState<"category" | "details" | "escalated">("category");
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addBot(text: string) {
    setTyping(true);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.setTimeout(() => {
      setMessages((m) => [...m, { id, role: "bot", text }]);
      setTyping(false);
    }, 600);
  }

  useEffect(() => {
    addBot("Hi! I'm your AI support assistant. What can I help you with today?");
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing]);

  function addUserMessage(text: string) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setMessages((m) => [...m, { id, role: "user", text }]);
  }

  function pickCategory(category: string) {
    setStage("details");
    window.setTimeout(() => {
      addBot(`Got it — ${category}. Please describe the issue in a few sentences so I can pass it to the right team.`);
    }, 400);
  }

  function handleCategory(category: string) {
    addUserMessage(category);
    pickCategory(category);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || stage === "escalated") return;
    addUserMessage(text);
    setInput("");

    if (stage === "category") {
      pickCategory(text);
    } else if (stage === "details") {
      setStage("escalated");
      window.setTimeout(() => {
        addBot("Thank you for the details. I'm connecting you with a live support agent now.");
      }, 400);
      window.setTimeout(() => {
        const agentId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setMessages((m) => [
          ...m,
          { id: agentId, role: "agent", text: "A support agent will be with you shortly. Average wait time is under 2 minutes." },
        ]);
      }, 2500);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex items-start gap-2",
              msg.role === "user" ? "justify-end" : "justify-start",
            )}
          >
            {msg.role !== "user" ? (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
                {msg.role === "agent" ? (
                  <User className="h-4 w-4" />
                ) : (
                  <HelpCircle className="h-4 w-4" />
                )}
              </div>
            ) : null}
            <div
              className={cn(
                "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                msg.role === "user"
                  ? "bg-primary text-white"
                  : msg.role === "agent"
                    ? "bg-success/10 text-success"
                    : "bg-surface-elevated text-text",
              )}
            >
              {msg.text}
            </div>
            {msg.role === "user" ? (
              <UserAvatar user={me ?? undefined} className="h-8 w-8" />
            ) : null}
          </div>
        ))}
        {typing ? (
          <div className="flex items-start gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <HelpCircle className="h-4 w-4" />
            </div>
            <div className="rounded-lg bg-surface-elevated px-3 py-2 text-sm text-text-muted">
              AI is typing
              <span className="inline-block w-6 animate-pulse">...</span>
            </div>
          </div>
        ) : null}
      </div>

      {stage === "category" && !typing && messages.length === 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {CHAT_CATEGORIES.map((category) => (
            <Button
              key={category}
              variant="secondary"
              size="sm"
              onClick={() => handleCategory(category)}
            >
              {category}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-end gap-2 border-t pt-3">
        <Input
          ref={inputRef}
          placeholder={
            stage === "escalated"
              ? "A support agent will reply shortly..."
              : "Type a message..."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={stage === "escalated"}
          className="flex-1"
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!input.trim() || stage === "escalated"}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ContactPanel() {
  const { data: me } = useMe();
  const addToast = useUIStore((s) => s.addNotificationToast);
  const [email, setEmail] = useState(me?.email ?? "");
  const [category, setCategory] = useState("Account access");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (me?.email && !email) setEmail(me.email);
  }, [me, email]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !subject.trim() || !message.trim()) return;
    const body = `Category: ${category}\nFrom: ${email}\n\n${message}`;
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    void openUrl(mailto);
    addToast({
      title: "Message ready",
      body: "Your default mail app was opened with the issue details.",
    });
    setSent(true);
    window.setTimeout(() => {
      setSubject("");
      setMessage("");
      setSent(false);
    }, 2000);
  }

  return (
    <Card className="max-w-xl p-4 sm:p-6">
      <h2 className="text-base font-semibold text-text">Contact support</h2>
      <p className="text-sm text-text-secondary">
        Send an email to {SUPPORT_EMAIL} and we will get back to you as soon as possible.
      </p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary" htmlFor="contact-email">
            Your email
          </label>
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary" htmlFor="contact-category">
            Category
          </label>
          <select
            id="contact-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex h-9 w-full rounded-md border bg-surface px-3 py-1 text-sm text-text shadow-sm focus-visible:border-primary disabled:opacity-50"
          >
            <option>Account access</option>
            <option>Billing</option>
            <option>Bug report</option>
            <option>Feature request</option>
            <option>HRMS</option>
            <option>Interview</option>
            <option>Other</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary" htmlFor="contact-subject">
            Subject
          </label>
          <Input
            id="contact-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Brief summary of the issue"
            required
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-secondary" htmlFor="contact-message">
            Message
          </label>
          <textarea
            id="contact-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe the issue in detail..."
            required
            className="min-h-[120px] w-full rounded-md border bg-surface px-3 py-2 text-sm text-text shadow-sm placeholder:text-text-muted focus-visible:border-primary disabled:opacity-50"
          />
        </div>
        <Button type="submit" disabled={sent} className="w-full sm:w-auto">
          {sent ? "Sent" : "Send email"}
        </Button>
      </form>
    </Card>
  );
}

const adminOnlyTabs: Tab[] = ["chat", "contact"];

function useCanAccessSupport() {
  const { user } = usePermissionContext();
  if (!user) return false;
  return hasAnyPermission(user, Object.values(ADMIN_PERMISSIONS));
}

export function HelpScreen() {
  const isAdmin = useCanAccessSupport();
  const visibleTabs = tabs.filter((tab) =>
    adminOnlyTabs.includes(tab.id) ? isAdmin : true,
  );
  const [activeTab, setActiveTab] = useState<Tab>("tutorials");

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? "tutorials");
    }
  }, [visibleTabs, activeTab]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b px-3 sm:px-6">
        <h1 className="text-lg font-semibold text-text">Help Center</h1>
      </header>
      <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
        <nav className="flex w-full shrink-0 gap-1 overflow-x-auto border-b bg-surface p-2 sm:w-56 sm:flex-col sm:border-b-0 sm:border-r">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-primary-subtle text-primary"
                    : "text-text-secondary hover:bg-surface-elevated hover:text-text",
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {activeTab === "tutorials" ? <TutorialsPanel /> : null}
          {activeTab === "faqs" ? <FaqsPanel /> : null}
          {activeTab === "chat" && isAdmin ? <ChatPanel /> : null}
          {activeTab === "contact" && isAdmin ? <ContactPanel /> : null}
        </main>
      </div>
    </div>
  );
}
