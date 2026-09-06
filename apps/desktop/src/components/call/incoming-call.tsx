import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { useRealtime, type RealtimeEventPayloads } from "../../hooks/useRealtime";
import { useUIStore } from "../../stores/ui";
import { useMe, useUsers } from "../../hooks/api";
import { UserAvatar } from "../user-avatar";
import { Button } from "../ui/button";
import { SOUNDS, loopSound } from "../../lib/sounds";

type IncomingCall = RealtimeEventPayloads["call.incoming"];

const RING_TIMEOUT_MS = 30_000;

export function IncomingCallOverlay() {
  const { onRealtimeEvent, sendCallResponse } = useRealtime();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: user } = useMe();
  const [call, setCall] = useState<IncomingCall | null>(null);

  const myName = user
    ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email
    : undefined;

  useEffect(() => {
    const unsubscribeIncoming = onRealtimeEvent("call.incoming", (payload) => {
      setCall(payload);
      try {
        void sendNotification({
          title: `Incoming ${payload.kind === "video" ? "video" : "audio"} call`,
          body: `${payload.callerName ?? "Someone"} is calling${payload.title ? ` · ${payload.title}` : ""}`,
        });
      } catch {
        // Notifications not available in browser/dev.
      }
    });
    const unsubscribeEnded = onRealtimeEvent("call.ended", (payload) => {
      setCall((prev) => (prev && prev.meetingId === payload.meetingId ? null : prev));
    });
    const unsubscribeResponse = onRealtimeEvent("call.response", (payload) => {
      if (payload.response === "declined") {
        try {
          void sendNotification({
            title: "Call declined",
            body: `${payload.userName ?? "The participant"} declined the call`,
          });
        } catch {
          // Notifications not available in browser/dev.
        }
      }
    });
    return () => {
      unsubscribeIncoming();
      unsubscribeEnded();
      unsubscribeResponse();
    };
  }, [onRealtimeEvent]);

  // Play the ringtone while the incoming call is ringing, and
  // auto-dismiss the ring after a timeout.
  useEffect(() => {
    if (!call) return;
    const stopRingtone = loopSound(SOUNDS.incomingCall);
    const timer = setTimeout(() => setCall(null), RING_TIMEOUT_MS);
    return () => {
      stopRingtone();
      clearTimeout(timer);
    };
  }, [call]);

  const callerUserIds = call ? [call.callerId] : [];
  const { data: callerUsers } = useUsers(callerUserIds);

  if (!call) return null;

  const callerLabel = call.callerName ?? "Someone";
  const callerUser = callerUsers?.[0];

  function accept() {
    if (!call) return;
    sendCallResponse({ meetingId: call.meetingId, callerId: call.callerId, response: "accepted", userName: myName });
    setActiveView(call.kind === "video" ? "meeting" : "voice", { meetingId: call.meetingId });
    setCall(null);
  }

  function decline() {
    if (!call) return;
    sendCallResponse({ meetingId: call.meetingId, callerId: call.callerId, response: "declined", userName: myName });
    setCall(null);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-4 rounded-xl border border-border bg-surface-elevated px-5 py-4 shadow-2xl">
        <div className="relative">
          <UserAvatar
            user={callerUser ?? { firstName: callerLabel, email: "" }}
            className="h-11 w-11"
            fallbackClassName="text-sm"
          />
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
            {call.kind === "video" ? (
              <Video className="h-2.5 w-2.5 text-white" />
            ) : (
              <Phone className="h-2.5 w-2.5 text-white" />
            )}
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text">{callerLabel}</p>
          <p className="animate-pulse truncate text-xs text-text-muted">
            Incoming {call.kind === "video" ? "video" : "audio"} call
            {call.title ? ` · ${call.title}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            className="h-9 w-9 rounded-full bg-error text-white hover:bg-error/90"
            onClick={decline}
            title="Decline"
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            className="h-9 w-9 rounded-full bg-success text-white hover:bg-success/90"
            onClick={accept}
            title="Accept"
          >
            {call.kind === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
