import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Code,
  Code2,
  Italic,
  Link2,
  List,
  Mic,
  Paperclip,
  Send,
  Smile,
  Strikethrough,
  Clock,
} from "lucide-react";
import { Button } from "../ui/button";
import { getDraft, setDraft } from "../../lib/message-local";
import { useRealtime } from "../../hooks/useRealtime";
import { cn } from "../../lib/utils";

const EMOJIS = [
  "😀", "😂", "😊", "😍", "🤔", "😅", "😢", "😡",
  "👍", "👎", "👏", "🙌", "🎉", "🔥", "❤️", "💯",
  "✅", "❌", "⚠️", "🚀", "👀", "🙏", "💡", "📌",
];

const SLASH_COMMANDS = [
  { command: "/task", description: "Create a task from this message" },
  { command: "/remind", description: "Set a reminder" },
  { command: "/meeting", description: "Schedule a meeting" },
  { command: "/poll", description: "Create a poll" },
];

export interface ComposerMember {
  id: string;
  name: string;
}

interface ComposerProps {
  placeholder?: string;
  /** Persists an unsent draft per key (e.g. channel id). */
  draftKey?: string;
  /** Emits typing indicators to this channel's realtime room. */
  channelId?: string;
  members?: ComposerMember[];
  sending?: boolean;
  disabled?: boolean;
  onSend: (content: string) => void;
  onAttach?: (file: File) => void;
}

export function Composer({
  placeholder = "Message",
  draftKey,
  channelId,
  members = [],
  sending,
  disabled,
  onSend,
  onAttach,
}: ComposerProps) {
  const [value, setValue] = useState(() => (draftKey ? getDraft(draftKey) : ""));
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendTyping } = useRealtime();
  const typingSent = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emitTyping = useCallback(
    (next: string) => {
      if (!channelId) return;
      if (next.trim()) {
        if (!typingSent.current) {
          sendTyping(channelId, true);
          typingSent.current = true;
        }
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => {
          sendTyping(channelId, false);
          typingSent.current = false;
        }, 2500);
      } else if (typingSent.current) {
        sendTyping(channelId, false);
        typingSent.current = false;
        if (typingTimer.current) clearTimeout(typingTimer.current);
      }
    },
    [channelId, sendTyping],
  );

  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (channelId && typingSent.current) sendTyping(channelId, false);
  }, [channelId, sendTyping]);

  useEffect(() => {
    setValue(draftKey ? getDraft(draftKey) : "");
    setEmojiOpen(false);
  }, [draftKey]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }, [value]);

  const update = useCallback(
    (next: string) => {
      setValue(next);
      if (draftKey) setDraft(draftKey, next);
      emitTyping(next);
    },
    [draftKey, emitTyping],
  );

  // Mention autocomplete: detect a trailing "@query" before the caret.
  const caret = textareaRef.current?.selectionStart ?? value.length;
  const mentionMatch = value.slice(0, caret).match(/(^|\s)@([A-Za-z0-9_.-]*)$/);
  const mentionSuggestions = mentionMatch
    ? members
        .filter((m) => m.name.toLowerCase().includes(mentionMatch[2].toLowerCase()))
        .slice(0, 6)
    : [];

  const slashQuery = value.startsWith("/") && !value.includes(" ") ? value.slice(1).toLowerCase() : null;
  const slashSuggestions =
    slashQuery !== null ? SLASH_COMMANDS.filter((c) => c.command.slice(1).startsWith(slashQuery)) : [];

  function insertMention(member: ComposerMember) {
    const start = caret - (mentionMatch?.[2].length ?? 0) - 1;
    const next = `${value.slice(0, start)}@${member.name} ${value.slice(caret)}`;
    update(next);
    textareaRef.current?.focus();
  }

  function wrapSelection(prefix: string, suffix = prefix) {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const selected = value.slice(s, e) || "text";
    update(`${value.slice(0, s)}${prefix}${selected}${suffix}${value.slice(e)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + prefix.length, s + prefix.length + selected.length);
    });
  }

  function insertAtCaret(text: string) {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? value.length;
    update(`${value.slice(0, pos)}${text}${value.slice(pos)}`);
    el?.focus();
  }

  function send() {
    const content = value.trim();
    if (!content) return;
    onSend(content);
    if (channelId && typingSent.current) {
      sendTyping(channelId, false);
      typingSent.current = false;
      if (typingTimer.current) clearTimeout(typingTimer.current);
    }
    update("");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % mentionSuggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionSuggestions[Math.min(mentionIndex, mentionSuggestions.length - 1)]);
        return;
      }
      if (e.key === "Escape") {
        setMentionIndex(0);
        update(`${value.slice(0, caret)} ${value.slice(caret)}`);
        return;
      }
    }
    if (slashSuggestions.length > 0 && e.key === "Escape") {
      e.preventDefault();
      update(` ${value}`);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
    if (e.key === "Escape") {
      setEmojiOpen(false);
    }
  }

  const toolbar = [
    { icon: Bold, label: "Bold", action: () => wrapSelection("**") },
    { icon: Italic, label: "Italic", action: () => wrapSelection("*") },
    { icon: Strikethrough, label: "Strikethrough", action: () => wrapSelection("~~") },
    { icon: Code, label: "Inline code", action: () => wrapSelection("`") },
    { icon: Code2, label: "Code block", action: () => wrapSelection("```\n", "\n```") },
    { icon: Link2, label: "Link", action: () => wrapSelection("[", "](https://)") },
    { icon: List, label: "List", action: () => insertAtCaret("\n- ") },
  ];

  const hasDraft = Boolean(draftKey && value.trim());

  return (
    <div className="relative">
      {mentionSuggestions.length > 0 ? (
        <div className="absolute bottom-full left-0 mb-1 w-64 overflow-hidden rounded-md border bg-surface shadow-lg">
          {mentionSuggestions.map((member, i) => (
            <button
              key={member.id}
              type="button"
              onClick={() => insertMention(member)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                i === mentionIndex ? "bg-primary-subtle text-primary" : "text-text hover:bg-surface-elevated",
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-[10px] font-medium">
                {member.name.slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1 truncate">{member.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {slashSuggestions.length > 0 ? (
        <div className="absolute bottom-full left-0 mb-1 w-72 overflow-hidden rounded-md border bg-surface shadow-lg">
          <p className="border-b px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Slash commands (coming soon)
          </p>
          {slashSuggestions.map((cmd) => (
            <div key={cmd.command} className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted">
              <span className="font-mono text-primary">{cmd.command}</span>
              <span className="flex-1 truncate">{cmd.description}</span>
            </div>
          ))}
        </div>
      ) : null}

      {emojiOpen ? (
        <div className="absolute bottom-full right-0 mb-1 w-64 rounded-md border bg-surface p-2 shadow-lg">
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  insertAtCaret(emoji);
                  setEmojiOpen(false);
                }}
                className="rounded p-1 text-lg hover:bg-surface-elevated"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border bg-surface">
        <div className="flex items-center gap-0.5 overflow-x-auto border-b px-2 py-1">
          {toolbar.map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              size="icon"
              className="h-9 w-9 sm:h-8 sm:w-8"
              onClick={item.action}
              aria-label={item.label}
              title={item.label}
            >
              <item.icon className="h-4 w-4" />
            </Button>
          ))}
          <div className="ml-auto flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" disabled title="Voice message (coming soon)" aria-label="Voice message (coming soon)">
              <Mic className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 sm:h-8 sm:w-8" disabled title="Schedule message (coming soon)" aria-label="Schedule message (coming soon)">
              <Clock className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-end gap-2 p-2">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder={placeholder}
            value={value}
            disabled={disabled}
            onChange={(e) => update(e.target.value)}
            onKeyDown={onKeyDown}
            className="flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-sm text-text outline-none placeholder:text-text-muted"
          />
          <div className="flex items-center gap-1">
            <Button
              variant={emojiOpen ? "secondary" : "ghost"}
              size="icon"
              onClick={() => setEmojiOpen((open) => !open)}
              aria-label="Insert emoji"
            >
              <Smile className="h-4 w-4" />
            </Button>
            {onAttach ? (
              <Button variant="ghost" size="icon" asChild>
                <label aria-label="Attach file" className="cursor-pointer">
                  <Paperclip className="h-4 w-4" />
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onAttach(file);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </Button>
            ) : null}
            <Button size="icon" onClick={send} disabled={disabled || sending || !value.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <p className="mt-1.5 flex items-center gap-2 px-1 text-[11px] text-text-muted">
        <span>Enter to send · Shift + Enter for new line · @ to mention · / for commands</span>
        {hasDraft ? <span className="text-warning">Draft saved</span> : null}
      </p>
    </div>
  );
}
