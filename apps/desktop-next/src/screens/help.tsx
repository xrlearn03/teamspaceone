import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  FileText,
  Film,
  HelpCircle,
  Image,
  Paperclip,
  Search,
  Send,
  Ticket,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { usePermissionContext } from "@teamspace-one/authorization/react";
import { hasAnyPermission, ADMIN_PERMISSIONS } from "@teamspace-one/authorization";
import { Button } from "@teamspace-one/ui/button";
import { Card } from "@teamspace-one/ui/card";
import { Input } from "@teamspace-one/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { useCreateTicket, useMe, useRoles, useTickets } from "@/hooks/api";
import { downloadFile, uploadFile, type TicketPriority } from "@/lib/api";
import { useUIStore } from "@/stores/ui";
import { toast, toastError } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Tab = "tutorials" | "faqs" | "tickets" | "chat" | "contact";

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

const tabs: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "tutorials", label: "Tutorials", icon: BookOpen },
  { id: "faqs", label: "FAQs", icon: HelpCircle },
  { id: "tickets", label: "Support Tickets", icon: Ticket },
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
      "Use the Support Tickets tab to submit an issue, attach relevant files, and track its status with your support team.",
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
    window.open(mailto, "_blank");
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

const TICKET_PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

/** Internal tickets can only be routed to these system roles (enforced server-side too). */
const TICKET_ASSIGNEE_ROLE_NAMES = ["owner", "org_admin", "hr_admin", "hr_manager"];

const ticketSelectClass =
  "flex h-9 w-full rounded-md border bg-surface px-3 py-1 text-sm text-text shadow-sm focus-visible:border-primary disabled:opacity-50";

const TICKET_ATTACHMENT_ACCEPT =
  "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.zip";

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function attachmentIcon(file: File) {
  if (file.type.startsWith("image/")) return Image;
  if (file.type.startsWith("video/")) return Film;
  return FileText;
}

function ticketStatusClass(status: string) {
  switch (status) {
    case "solved":
      return "bg-success/10 text-success";
    case "open":
      return "bg-mention/10 text-mention";
    case "pending":
      return "bg-warning/10 text-warning";
    default:
      return "bg-info/10 text-info";
  }
}

function ticketPriorityClass(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-error/10 text-error";
    case "high":
      return "bg-warning/10 text-warning";
    case "low":
      return "bg-surface-elevated text-text-muted";
    default:
      return "bg-info/10 text-info";
  }
}

function TicketsPanel() {
  const organisationId = useUIStore((s) => s.organisationId) ?? undefined;
  const { data: me } = useMe();
  const { data: roles, isLoading: rolesLoading, error: rolesError } = useRoles(organisationId);
  const { data: tickets } = useTickets(organisationId);
  const createTicket = useCreateTicket();
  const assignableRoles = (roles ?? []).filter((role) =>
    TICKET_ASSIGNEE_ROLE_NAMES.includes(role.name),
  );
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState(CHAT_CATEGORIES[0]);
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [roleId, setRoleId] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const myTickets = (tickets ?? []).filter((t) => t.requesterId === me?.id);

  function addAttachments(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    setAttachments((current) => [
      ...current,
      ...incoming.filter(
        (file) => !current.some((c) => c.name === file.name && c.size === file.size),
      ),
    ]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organisationId || !subject.trim() || !roleId || !description.trim() || submitting) return;
    setSubmitting(true);
    try {
      const uploaded = await Promise.all(
        attachments.map(async (file) => {
          const record = await uploadFile(file);
          return {
            fileId: record.id,
            name: record.originalName,
            size: record.size,
            mimeType: record.mimeType,
          };
        }),
      );
      await createTicket.mutateAsync({
        organisationId,
        subject: subject.trim(),
        description: description.trim(),
        category,
        priority,
        assigneeRoleId: roleId,
        attachments: uploaded,
      });
      toast.success("Ticket submitted.");
      setSubject("");
      setDescription("");
      setRoleId("");
      setAttachments([]);
      setPriority("medium");
    } catch (err) {
      toastError(err, "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4 sm:p-6">
        <h2 className="text-base font-semibold text-text">Raise a ticket</h2>
        <p className="text-sm text-text-secondary">
          Submit an internal support ticket and choose which role it should be assigned to.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary" htmlFor="ticket-subject">
              Subject
            </label>
            <Input
              id="ticket-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of the issue"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary" htmlFor="ticket-category">
                Category
              </label>
              <select
                id="ticket-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={ticketSelectClass}
              >
                {CHAT_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-secondary" htmlFor="ticket-priority">
                Priority
              </label>
              <select
                id="ticket-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as TicketPriority)}
                className={ticketSelectClass}
              >
                {TICKET_PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary" htmlFor="ticket-role">
              Assign to role
            </label>
            <select
              id="ticket-role"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              className={ticketSelectClass}
              disabled={rolesLoading || !organisationId}
              required
            >
              <option value="">
                {rolesLoading ? "Loading roles…" : "Select a role"}
              </option>
              {assignableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.description || role.name}
                </option>
              ))}
            </select>
            {rolesError ? (
              <p className="text-xs text-error">Failed to load roles: {rolesError.message}</p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-secondary" htmlFor="ticket-description">
              Description
            </label>
            <textarea
              id="ticket-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in detail..."
              required
              className="min-h-[120px] w-full rounded-md border bg-surface px-3 py-2 text-sm text-text shadow-sm placeholder:text-text-muted focus-visible:border-primary disabled:opacity-50"
            />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-text-secondary">Attachments</span>
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-border bg-surface px-3 py-4 text-xs text-text-secondary transition-colors hover:border-primary hover:text-text">
              <Paperclip className="h-3.5 w-3.5" />
              Attach images, videos, or documents
              <input
                type="file"
                multiple
                accept={TICKET_ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  addAttachments(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {attachments.length > 0 ? (
              <ul className="space-y-1">
                {attachments.map((file, index) => {
                  const AttachmentIcon = attachmentIcon(file);
                  return (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center gap-2 rounded-md border border-border bg-surface-elevated px-2.5 py-1.5 text-xs"
                    >
                      <AttachmentIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                      <span className="flex-1 truncate text-text">{file.name}</span>
                      <span className="shrink-0 text-text-muted">{formatBytes(file.size)}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments((current) => current.filter((_, i) => i !== index))
                        }
                        aria-label={`Remove ${file.name}`}
                        className="shrink-0 text-text-muted transition-colors hover:text-error"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
          <Button
            type="submit"
            disabled={submitting || !subject.trim() || !roleId || !description.trim()}
            className="w-full sm:w-auto"
          >
            {submitting ? "Submitting…" : "Submit ticket"}
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col p-0">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold text-text">My tickets</h2>
        </div>
        {myTickets.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
              <Ticket className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-text">No tickets yet</p>
            <p className="max-w-xs text-xs text-text-muted">
              Tickets you raise will appear here, along with their status.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {myTickets.map((ticket) => (
              <li key={ticket.id} className="px-4 py-3 sm:px-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{ticket.subject}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">
                      {ticket.description}
                    </p>
                    <p className="mt-1.5 text-[11px] text-text-muted">
                      Assigned to {ticket.assigneeRole?.description || ticket.assigneeRole?.name || "—"}
                      {" · "}
                      {new Date(ticket.createdAt).toLocaleDateString([], {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                    {ticket.attachments.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {ticket.attachments.map((a) => (
                          <button
                            key={a.fileId}
                            type="button"
                            title={`Download ${a.name}`}
                            onClick={() => {
                              void (async () => {
                                try {
                                  const blob = await downloadFile(a.fileId);
                                  const url = URL.createObjectURL(blob);
                                  const link = document.createElement("a");
                                  link.href = url;
                                  link.download = a.name;
                                  link.click();
                                  URL.revokeObjectURL(url);
                                } catch (err) {
                                  toastError(err, "Couldn't download attachment");
                                }
                              })();
                            }}
                            className="flex max-w-44 items-center gap-1 rounded bg-surface-elevated px-1.5 py-0.5 text-[11px] font-medium text-text-secondary transition-colors hover:text-text"
                          >
                            <Paperclip className="h-3 w-3 shrink-0" />
                            <span className="truncate">{a.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
                        ticketStatusClass(ticket.status),
                      )}
                    >
                      {ticket.status}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
                        ticketPriorityClass(ticket.priority),
                      )}
                    >
                      {ticket.priority}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
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
  const requestedTab = useUIStore((s) => s.helpTab);
  const setHelpTab = useUIStore((s) => s.setHelpTab);
  const visibleTabs = tabs.filter((tab) =>
    adminOnlyTabs.includes(tab.id) ? isAdmin : true,
  );
  const [activeTab, setActiveTab] = useState<Tab>(
    () => (tabs.some((t) => t.id === requestedTab) ? (requestedTab as Tab) : "tutorials"),
  );

  useEffect(() => {
    if (!visibleTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id ?? "tutorials");
    }
  }, [visibleTabs, activeTab]);

  // The tickets workspace deep-links here via the store ("Add New Ticket" → tickets).
  useEffect(() => {
    if (requestedTab && tabs.some((t) => t.id === requestedTab)) {
      setActiveTab(requestedTab as Tab);
    }
  }, [requestedTab]);

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
                onClick={() => {
                  setActiveTab(tab.id);
                  setHelpTab(tab.id);
                }}
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
          {activeTab === "tickets" ? <TicketsPanel /> : null}
          {activeTab === "chat" && isAdmin ? <ChatPanel /> : null}
          {activeTab === "contact" && isAdmin ? <ContactPanel /> : null}
        </main>
      </div>
    </div>
  );
}
