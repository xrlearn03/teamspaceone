import { useState } from "react";
import { Bell, Check, Filter } from "lucide-react";
import { notifications } from "../lib/data";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { cn } from "../lib/utils";

const categories = [
  { id: "all", label: "All" },
  { id: "mentions", label: "Mentions" },
  { id: "messages", label: "Messages" },
  { id: "tasks", label: "Tasks" },
  { id: "meetings", label: "Meetings" },
  { id: "approvals", label: "Approvals" },
];

export function InboxScreen() {
  const [active, setActive] = useState("all");
  const [items, setItems] = useState(notifications);

  const filtered =
    active === "all" ? items : items.filter((n) => n.type === active);

  function markRead(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
  }

  function markAllRead() {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <Bell className="h-5 w-5 text-text" />
          <h1 className="text-lg font-semibold text-text">Inbox</h1>
          <Badge variant="secondary">{filtered.filter((n) => !n.read).length}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            <Check className="mr-1.5 h-4 w-4" />
            Mark all read
          </Button>
          <Button variant="ghost" size="icon">
            <Filter className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b px-6 py-2">
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
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications"
            description="You're all caught up."
          />
        ) : (
          <div className="mx-auto max-w-3xl space-y-1">
            {filtered.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => markRead(n.id)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-surface-elevated",
                  !n.read && "border-l-4 border-l-primary bg-surface",
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-primary">
                  {n.actor.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-text">{n.title}</span>
                    <span className="text-xs text-text-muted">{n.time}</span>
                  </div>
                  <p className="text-sm text-text-secondary">{n.body}</p>
                </div>
                {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-unread" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
