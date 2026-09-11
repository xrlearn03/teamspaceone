import { useState } from "react";
import { Bookmark, Check, MessageCircle, Pencil, Pin, Smile, Trash2, X } from "lucide-react";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { MessageAttachment } from "@/components/ui/message-attachment";
import { MessageContent } from "./message-content";
import { isSaved, toggleSavedMessage } from "@/lib/message-local";
import { useToggleReaction } from "@/hooks/api";
import { cn, getUserDisplayName } from "@/lib/utils";
import type { Message as MessageType, UserDto } from "@/lib/api";

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🙏", "✅", "🔥"];

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export interface MessageItemProps {
  message: MessageType;
  user?: UserDto | null;
  userMap?: Map<string, UserDto>;
  showReplyButton?: boolean;
  onReply?: () => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  onPin?: (message: MessageType) => void;
  /** Grouped under the previous message — hides avatar and author name. */
  compact?: boolean;
}

export function MessageItem({
  message,
  user,
  userMap,
  showReplyButton = true,
  onReply,
  onEdit,
  onDelete,
  onPin,
  compact,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [reactionPicker, setReactionPicker] = useState(false);
  const toggleReaction = useToggleReaction();
  const [saved, setSaved] = useState(() => isSaved(message.id));
  const isMe = message.senderId === user?.id;
  const sender = userMap?.get(message.senderId);
  const author = isMe ? "You" : getUserDisplayName(sender);
  const mentionName = user ? getUserDisplayName(user, "") || null : null;

  function saveEdit() {
    if (onEdit && editDraft.trim() && editDraft.trim() !== message.content) {
      onEdit(message.id, editDraft.trim());
    }
    setEditing(false);
  }

  function react(emoji: string) {
    if (!user || message.pending) return;
    toggleReaction.mutate({ messageId: message.id, channelId: message.channelId, emoji });
    setReactionPicker(false);
  }

  function toggleSaved() {
    if (message.pending) return;
    setSaved(
      toggleSavedMessage({
        id: message.id,
        channelId: message.channelId,
        content: message.content,
        senderId: message.senderId,
        createdAt: message.createdAt,
      }),
    );
  }

  const replyCount = message._count?.replies ?? 0;
  const reactions: Record<string, string[]> = {};
  for (const reaction of message.reactions ?? []) {
    (reactions[reaction.emoji] ??= []).push(reaction.userId);
  }
  const reactionEntries = Object.entries(reactions);

  return (
    <div className={cn("flex gap-3", isMe && !compact && "flex-row-reverse")}>
      {compact ? (
        <span className="w-8 shrink-0" />
      ) : (
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback>{author.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      )}
      <div className={cn("flex max-w-[80%] flex-col", isMe && !compact && "items-end")}>
        {!compact && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-text">{author}</span>
            <span className="text-xs text-text-muted">{formatTime(message.createdAt)}</span>
            {message.pending ? <span className="text-[10px] text-warning">Sending when online…</span> : null}
            {saved ? <Bookmark className="h-3 w-3 fill-warning text-warning" aria-label="Saved" /> : null}
          </div>
        )}
        {editing ? (
          <div className="mt-1 flex items-center gap-1">
            <Input
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") {
                  setEditDraft(message.content);
                  setEditing(false);
                }
              }}
              className="h-9"
              autoFocus
            />
            <Button size="icon" variant="ghost" onClick={saveEdit} aria-label="Save message">
              <Check className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => { setEditDraft(message.content); setEditing(false); }} aria-label="Cancel edit">
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="group flex items-start gap-1">
            <div
              className={cn(
                "mt-0.5 rounded-lg px-3 py-2 text-sm",
                isMe && !compact ? "bg-primary text-white" : "bg-surface-elevated text-text",
                message.deletedAt && "italic opacity-60",
                message.pending && "opacity-70",
              )}
            >
              {message.deletedAt ? (
                "Message deleted"
              ) : (
                <MessageContent content={message.content} mentionName={mentionName} />
              )}
              {message.editedAt && !message.deletedAt ? <span className="ml-1 text-[10px] opacity-70">(edited)</span> : null}
              {message.attachments.map((attachment) => <MessageAttachment key={attachment.id} fileId={attachment.fileId} />)}
            </div>
            {!message.deletedAt && !message.pending && (isMe || onEdit || onDelete || onReply || onPin || user) ? (
              <div className="relative flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                {user ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setReactionPicker((open) => !open)}
                    aria-label="Add reaction"
                  >
                    <Smile className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {showReplyButton && onReply ? (
                  <Button size="icon" variant="ghost" onClick={onReply} aria-label="Reply in thread">
                    <MessageCircle className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {user ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={toggleSaved}
                    aria-label={saved ? "Remove from saved items" : "Save message"}
                  >
                    <Bookmark className={cn("h-3.5 w-3.5", saved && "fill-warning text-warning")} />
                  </Button>
                ) : null}
                {isMe && onEdit ? (
                  <Button size="icon" variant="ghost" onClick={() => setEditing(true)} aria-label="Edit message">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {isMe && onDelete ? (
                  <Button size="icon" variant="ghost" onClick={() => onDelete(message.id)} aria-label="Delete message">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
                {onPin ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => onPin(message)}
                    aria-label={message.pinnedAt ? "Unpin message" : "Pin message"}
                  >
                    <Pin className={cn("h-3.5 w-3.5", message.pinnedAt && "fill-warning text-warning")} />
                  </Button>
                ) : null}
                {reactionPicker ? (
                  <div className="absolute bottom-full left-0 z-10 mb-1 flex gap-0.5 rounded-md border bg-surface p-1 shadow-lg">
                    {QUICK_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => react(emoji)}
                        className="rounded p-1 text-base hover:bg-surface-elevated"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
        {reactionEntries.length > 0 && !message.deletedAt ? (
          <div className={cn("mt-1 flex flex-wrap gap-1", isMe && !compact && "justify-end")}>
            {reactionEntries.map(([emoji, users]) => {
              const mine = user ? users.includes(user.id) : false;
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => react(emoji)}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                    mine ? "border-primary bg-primary-subtle text-primary" : "bg-surface text-text-secondary hover:bg-surface-elevated",
                  )}
                >
                  <span>{emoji}</span>
                  <span>{users.length}</span>
                </button>
              );
            })}
          </div>
        ) : null}
        {!message.deletedAt && replyCount > 0 && showReplyButton ? (
          <button
            type="button"
            onClick={onReply}
            className="mt-1 text-xs text-primary hover:underline"
          >
            {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
