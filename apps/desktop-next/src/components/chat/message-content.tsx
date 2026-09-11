import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight markdown renderer for chat messages.
 * Supports: fenced code blocks, inline code, bold, italic, strikethrough,
 * links, and @mention highlighting.
 */

const INLINE_RE =
  /(`[^`\n]+`)|(\*\*[^*]+\*\*)|(\*[^*\n]+\*)|(~[^~\n]+~)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s)]+)|(@[A-Za-z0-9_.-]+)/g;

function renderInline(text: string, mentionName: string | null, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    const token = match[0];
    const key = `${keyBase}-${i++}`;
    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("~~")) {
      nodes.push(<del key={key}>{token.slice(2, -2)}</del>);
    } else if (token.startsWith("~")) {
      nodes.push(<del key={key}>{token.slice(1, -1)}</del>);
    } else if (token.startsWith("[")) {
      const label = token.slice(1, token.indexOf("]"));
      const url = match[6];
      nodes.push(
        <a key={key} href={url} target="_blank" rel="noreferrer" className="text-info underline">
          {label}
        </a>,
      );
    } else if (token.startsWith("http")) {
      nodes.push(
        <a key={key} href={token} target="_blank" rel="noreferrer" className="text-info underline">
          {token}
        </a>,
      );
    } else if (token.startsWith("@")) {
      const isSelf = mentionName !== null && token.slice(1).toLowerCase() === mentionName.toLowerCase();
      nodes.push(
        <span
          key={key}
          className={cn(
            "rounded px-0.5 font-medium",
            isSelf ? "bg-mention/20 text-mention" : "bg-primary-subtle text-primary",
          )}
        >
          {token}
        </span>,
      );
    } else {
      nodes.push(token);
    }
    last = index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function MessageContent({
  content,
  mentionName,
  className,
}: {
  content: string;
  /** Name/id used to highlight mentions of the current user. */
  mentionName?: string | null;
  className?: string;
}) {
  const blocks: ReactNode[] = [];
  const parts = content.split(/```/);
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      blocks.push(
        <pre key={`code-${i}`} className="my-1 overflow-x-auto rounded-md bg-black/80 p-2 font-mono text-xs text-white">
          <code>{part.replace(/^\w+\n/, "")}</code>
        </pre>,
      );
    } else if (part) {
      blocks.push(
        <span key={`text-${i}`} className="whitespace-pre-wrap break-words">
          {renderInline(part, mentionName ?? null, `in-${i}`)}
        </span>,
      );
    }
  });
  return <span className={className}>{blocks}</span>;
}
