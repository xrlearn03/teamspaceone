import { useEffect, useRef, useState } from "react";
import { CheckSquare, Link2, MoreHorizontal, X } from "lucide-react";
import { useThreadMessages, useSendMessageOrQueue, useMe, useProjects, useCreateTask } from "../../hooks/api";
import { Button } from "../ui/button";
import { MessageItem } from "./message";
import { Composer } from "./composer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import type { Message, UserDto } from "../../lib/api";

interface ThreadPanelProps {
  channelId: string;
  parentMessage: Message;
  userMap?: Map<string, UserDto>;
  onClose: () => void;
}

export function ThreadPanel({ channelId, parentMessage, userMap, onClose }: ThreadPanelProps) {
  const { data: replies, fetchNextPage, hasNextPage, isFetchingNextPage } = useThreadMessages(parentMessage.id);
  const { sendOrQueue, isPending: sending } = useSendMessageOrQueue();
  const { data: user } = useMe();
  const { data: projects } = useProjects();
  const createTask = useCreateTask();
  const [convertOpen, setConvertOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies]);

  function send(content: string) {
    void sendOrQueue({ channelId, content, parentMessageId: parentMessage.id, senderId: user?.id });
  }

  function copyLink() {
    void navigator.clipboard.writeText(`teamspace-one://channel/${channelId}/message/${parentMessage.id}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const targetProject = projects?.[0];
  const taskTitle = parentMessage.content.split("\n").find(Boolean)?.slice(0, 300) || "Task from thread";

  return (
    <div className="absolute inset-y-0 right-0 z-20 flex h-full w-full flex-col border-l bg-surface sm:static sm:w-80">
      <div className="flex h-12 items-center justify-between border-b px-4">
        <span className="text-sm font-semibold text-text">Thread</span>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Thread actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setConvertOpen(true)} disabled={!targetProject}>
                <CheckSquare className="mr-2 h-4 w-4" />
                Convert to task
              </DropdownMenuItem>
              <DropdownMenuItem onClick={copyLink}>
                <Link2 className="mr-2 h-4 w-4" />
                {copied ? "Link copied" : "Copy link"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close thread">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="mb-4 border-b pb-4">
          <MessageItem message={parentMessage} user={user} userMap={userMap} showReplyButton={false} />
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
            replies.map((reply) => <MessageItem key={reply.id} message={reply} user={user} userMap={userMap} showReplyButton={false} />)
          ) : (
            <p className="py-4 text-center text-sm text-text-muted">No replies yet.</p>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <div className="border-t p-3">
        <Composer
          placeholder="Reply in thread"
          draftKey={`thread:${channelId}:${parentMessage.id}`}
          channelId={channelId}
          sending={sending}
          onSend={send}
        />
      </div>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader>
            <DialogTitle>Convert thread to task</DialogTitle>
            <DialogDescription>A task will be created from the parent message of this thread.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-4">
            <div className="rounded-md border bg-surface-elevated p-3 text-sm">
              <div className="flex justify-between gap-4 py-1">
                <span className="text-text-muted">Project</span>
                <span className="font-medium text-text">{targetProject?.name ?? "—"}</span>
              </div>
              <div className="border-t pt-2">
                <span className="text-text-muted">Title</span>
                <p className="mt-0.5 font-medium text-text">{taskTitle}</p>
              </div>
              <div className="pt-2">
                <span className="text-text-muted">Description</span>
                <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-text-secondary">{parentMessage.content}</p>
              </div>
            </div>
            {createTask.error ? <p className="text-sm text-error">{createTask.error.message}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConvertOpen(false)} disabled={createTask.isPending}>Cancel</Button>
              <Button
                disabled={!targetProject || createTask.isPending}
                onClick={() => {
                  if (!targetProject) return;
                  createTask.mutate(
                    { projectId: targetProject.id, title: taskTitle, description: parentMessage.content },
                    { onSettled: () => setConvertOpen(false) },
                  );
                }}
              >
                {createTask.isPending ? "Creating…" : "Create task"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
