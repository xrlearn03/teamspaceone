import { useEffect, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { useThreadMessages, useSendMessage, useMe } from "../../hooks/api";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { MessageItem } from "./message";
import type { Message } from "../../lib/api";

interface ThreadPanelProps {
  channelId: string;
  parentMessage: Message;
  onClose: () => void;
}

export function ThreadPanel({ channelId, parentMessage, onClose }: ThreadPanelProps) {
  const { data: replies, fetchNextPage, hasNextPage, isFetchingNextPage } = useThreadMessages(parentMessage.id);
  const sendMessage = useSendMessage();
  const { data: user } = useMe();
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies]);

  function send() {
    if (!draft.trim()) return;
    sendMessage.mutate({ channelId, content: draft.trim(), parentMessageId: parentMessage.id });
    setDraft("");
  }

  return (
    <div className="flex h-full w-80 flex-col border-l bg-surface">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold text-text">Thread</span>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close thread">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 border-b pb-4">
          <MessageItem message={parentMessage} user={user} showReplyButton={false} />
        </div>
        <div className="space-y-4">
          {hasNextPage ? (
            <div className="mb-3 text-center">
              <Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                {isFetchingNextPage ? "Loading…" : "Load older replies"}
              </Button>
            </div>
          ) : null}
          {replies && replies.length > 0 ? (
            replies.map((reply) => <MessageItem key={reply.id} message={reply} user={user} showReplyButton={false} />)
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">No replies yet.</p>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="border-t p-3">
        <div className="flex items-end gap-2 rounded-lg border bg-surface p-2">
          <Input
            placeholder="Reply in thread"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className="flex-1 border-0 bg-transparent shadow-none focus-visible:border-0 focus-visible:ring-0"
          />
          <Button size="icon" onClick={send} disabled={sendMessage.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
