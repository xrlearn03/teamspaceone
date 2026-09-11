import { useMemo, useState } from "react";
import { Bell, Check, Filter } from "lucide-react";
import { useMarkAllRead, useMarkRead, useNotifications, useNotificationCounts, useUsers } from "../hooks/api";
import type { UserDto } from "../lib/api";
import { Button } from "@teamspace-one/ui/button";
import { Badge } from "@teamspace-one/ui/badge";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { cn } from "../lib/utils";

const categories = [
  { id: "all", label: "All" },
  { id: "message", label: "Messages" },
  { id: "task", label: "Tasks" },
  { id: "meeting", label: "Meetings" },
  { id: "approval", label: "Approvals" },
];

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return d.toLocaleDateString();
}

export function InboxScreen() {
  const [active, setActive] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data: notifications, isLoading } = useNotifications(unreadOnly);
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const { data: counts } = useNotificationCounts();

  const filtered =
    active === "all"
      ? notifications ?? []
      : (notifications ?? []).filter((n) => n.resourceType === active);

  const unreadCount = counts?.total ?? 0;
  const typeCount = (id: string) => (id === "all" ? unreadCount : (counts?.counts[id] ?? 0));

  const actorIds = useMemo(
    () => [...new Set((notifications ?? []).map((n) => n.actorId).filter((id): id is string => typeof id === "string"))],
    [notifications],
  );
  const { data: actorUsers } = useUsers(actorIds);
  const actorMap = useMemo(() => new Map((actorUsers ?? []).map((u: UserDto) => [u.id, u])), [actorUsers]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-text" />
          <h1 className="text-lg font-semibold text-text">Inbox</h1>
          <Badge variant="secondary">{unreadCount}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            <Check className="mr-1.5 h-4 w-4" />
            Mark all read
          </Button>
          <Button variant={unreadOnly ? "secondary" : "ghost"} size="sm" onClick={() => setUnreadOnly((value) => !value)}>
            <Filter className="mr-1.5 h-4 w-4" />{unreadOnly ? "Unread" : "All states"}
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b px-3 sm:px-6 py-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActive(c.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              active === c.id
                ? "bg-primary-subtle text-primary"
                : "text-text-secondary hover:bg-surface-elevated",
            )}
          >
            {c.label}
            {typeCount(c.id) > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 justify-center px-1.5 text-[10px]">
                {typeCount(c.id)}
              </Badge>
            )}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="p-8 text-center text-sm text-text-muted">Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description="You're all caught up."
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-1">
            {filtered.map((n) => {
              const actor = n.actorId ? actorMap.get(n.actorId) : undefined;
              const actorName = actor
                ? `${actor.firstName ?? ""} ${actor.lastName ?? ""}`.trim() || actor.email
                : "?";
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => n.read || markRead.mutate(n.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-surface-elevated",
                    !n.read && "border-l-4 border-l-primary bg-surface",
                  )}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-primary">
                    {actorName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-text">{n.title}</span>
                      <span className="text-xs text-text-muted">{formatTime(n.createdAt)}</span>
                    </div>
                    <p className="text-sm text-text-secondary">{n.body}</p>
                  </div>
                  {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-unread" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
