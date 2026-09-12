import { useEffect, useMemo, useRef, useState } from "react";
import { Video, X } from "lucide-react";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { useMeetings, useMe } from "../../hooks/api";
import { useUIStore } from "../../stores/ui";
import { Button } from "@teamspace-one/ui/button";
import { SOUNDS, playSound } from "../../lib/sounds";
import type { Meeting } from "../../lib/api";

const TICK_MS = 15_000;
const JOINABLE_WINDOW_MS = 30 * 60 * 1000;

function isDue(meeting: Meeting, now: number, meId: string | undefined, dismissed: Set<string>, activeMeetingId: string | null) {
  if (meeting.type !== "meeting" || !meeting.scheduledAt) return false;
  if (dismissed.has(meeting.id) || meeting.id === activeMeetingId) return false;
  const at = new Date(meeting.scheduledAt).getTime();
  if (Number.isNaN(at) || at > now || now - at > JOINABLE_WINDOW_MS) return false;
  if (meeting.status === "scheduled") return true;
  if (meeting.status === "started") {
    return !(meeting.participants ?? []).some((p) => p.userId === meId && !p.leftAt);
  }
  return false;
}

/**
 * Watches the meetings list and surfaces a join card when a scheduled meeting
 * reaches its start time. The backend sweeper flips scheduled -> started at
 * scheduledAt and notifies invitees; this prompt is the in-app fallback so the
 * join affordance is visible even if notification delivery is off.
 */
export function ScheduledMeetingPrompt() {
  const { data: meetings } = useMeetings();
  const { data: me } = useMe();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const activeMeetingId = useUIStore((s) => s.activeMeetingId);
  const [now, setNow] = useState(() => Date.now());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const alertedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const due = useMemo(
    () => (meetings ?? []).filter((m) => isDue(m, now, me?.id, dismissed, activeMeetingId)),
    [meetings, now, me?.id, dismissed, activeMeetingId],
  );

  useEffect(() => {
    for (const meeting of due) {
      if (alertedRef.current.has(meeting.id)) continue;
      alertedRef.current.add(meeting.id);
      playSound(SOUNDS.notification);
      try {
        void sendNotification({
          title: "Meeting starting",
          body: `"${meeting.title}" is ready to join.`,
        });
      } catch {
        // Notifications not available in browser/dev.
      }
    }
  }, [due]);

  if (due.length === 0) return null;

  function join(meeting: Meeting) {
    setDismissed((prev) => new Set(prev).add(meeting.id));
    setActiveView("meeting", { meetingId: meeting.id });
  }

  function dismiss(meeting: Meeting) {
    setDismissed((prev) => new Set(prev).add(meeting.id));
  }

  return (
    <div className="fixed right-4 top-4 z-50 flex w-80 flex-col gap-2">
      {due.map((meeting) => (
        <div
          key={meeting.id}
          className="flex items-center gap-3 rounded-lg border bg-surface-elevated p-3 shadow-lg"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Video className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-text">{meeting.title}</p>
            <p className="text-xs text-text-secondary">
              {meeting.status === "started" ? "In progress — tap to join" : "Scheduled for now"}
            </p>
          </div>
          <Button size="sm" onClick={() => join(meeting)}>
            Join
          </Button>
          <button
            type="button"
            onClick={() => dismiss(meeting)}
            className="text-text-muted hover:text-text"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
