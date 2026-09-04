import { useState } from "react";
import { Check, MessageCircle, Pencil, Trash2, X } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { MessageAttachment } from "../ui/message-attachment";
import { cn } from "../../lib/utils";
import type { Message as MessageType, UserDto } from "../../lib/api";

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export interface MessageItemProps {
  message: MessageType;
  user?: UserDto | null;
  showReplyButton?: boolean;
  onReply?: () => void;
  onEdit?: (messageId: string, content: string) => void;
  onDelete?: (messageId: string) => void;
  compact?: boolean;
}

export function MessageItem({
  message,
  user,
  showReplyButton = true,
  onReply,
  onEdit,
  onDelete,
  compact,
}: MessageItemProps) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const isMe = message.senderId === user?.id;
  const author = isMe ? "You" : message.senderId.slice(0, 8);

  function saveEdit() {
    if (onEdit && editDraft.trim() && editDraft.trim() !== message.content) {
      onEdit(message.id, editDraft.trim());
    }
    setEditing(false);
  }

  const replyCount = message._count?.replies ?? 0;

  return (
    <div className={cn("flex gap-3", isMe && !compact && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback>{author.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className={cn("flex max-w-[80%] flex-col", isMe && !compact && "items-end")}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-text">{author}</span>
          <span className="text-xs text-text-muted">{formatTime(message.createdAt)}</span>
        </div>
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
              className="h-8"
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
          <div className="group flex items-center gap-1">
            <div
              className={cn(
                "mt-0.5 rounded-lg px-3 py-2 text-sm",
                isMe && !compact ? "bg-primary text-white" : "bg-surface-elevated text-text",
                message.deletedAt && "italic opacity-60",
              )}
            >
              {message.deletedAt ? "Message deleted" : message.content}
              {message.editedAt && !message.deletedAt ? <span className="ml-1 text-[10px] opacity-70">(edited)</span> : null}
              {message.attachments.map((attachment) => <MessageAttachment key={attachment.id} fileId={attachment.fileId} />)}
            </div>
            {!message.deletedAt && (isMe || onEdit || onDelete || onReply) ? (
              <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                {showReplyButton && onReply ? (
                  <Button size="icon" variant="ghost" onClick={onReply} aria-label="Reply in thread">
                    <MessageCircle className="h-3.5 w-3.5" />
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
              </div>
            ) : null}
          </div>
        )}
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
