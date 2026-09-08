import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video } from "lucide-react";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { useRealtime, type RealtimeEventPayloads } from "../../hooks/useRealtime";
import { useUIStore } from "../../stores/ui";
import { useMe, useUsers } from "../../hooks/api";
import { UserAvatar } from "../user-avatar";
import { Button } from "../ui/button";
import { SOUNDS, loopSound } from "../../lib/sounds";
import { getUserDisplayName } from "../../lib/utils";

type IncomingCall = RealtimeEventPayloads["call.incoming"];

const RING_TIMEOUT_MS = 30_000;

export function IncomingCallOverlay() {
  const { onRealtimeEvent, sendCallResponse, sendCallCancel, outgoingCall } = useRealtime();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: user } = useMe();
  const [call, setCall] = useState<IncomingCall | null>(null);

  const myName = user ? getUserDisplayName(user) : undefined;

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

  const userIds = call ? [call.callerId] : outgoingCall?.userIds ?? [];
  const { data: callUsers } = useUsers(userIds);

  if (!call && !outgoingCall) return null;

  const incoming = Boolean(call);
  const kind = call?.kind ?? outgoingCall!.kind;
  const callerLabel = call?.callerName ?? "Someone";
  const visibleUsers = callUsers?.slice(0, 3) ?? [];
  const outgoingNames = (callUsers ?? []).map((callUser) =>
    getUserDisplayName(callUser),
  );
  const outgoingLabel = outgoingNames.length === 0
    ? outgoingCall?.title ?? "participants"
    : outgoingNames.length === 1
      ? outgoingNames[0]
      : `${outgoingNames[0]} and ${outgoingNames.length - 1} ${outgoingNames.length === 2 ? "other" : "others"}`;

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

  function cancel() {
    if (!outgoingCall) return;
    sendCallCancel(outgoingCall.meetingId);
    setActiveView("home");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#020817]"
      style={{
        backgroundImage: "radial-gradient(ellipse 70% 85% at 100% 72%, rgba(75, 73, 255, 0.95) 0%, rgba(31, 42, 164, 0.62) 31%, transparent 70%), radial-gradient(ellipse 60% 55% at 0% 0%, rgba(0, 102, 255, 0.9) 0%, rgba(0, 52, 126, 0.58) 38%, transparent 72%), linear-gradient(135deg, #03142d 0%, #020817 48%, #07123d 100%)",
      }}
    >
      <img
        src="/calling-background-mobile.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover sm:hidden"
      />
      <div className="absolute inset-0 bg-black/10" />
      <div className="relative flex w-full max-w-lg flex-col items-center px-8 py-12 text-center">
        <div className="mb-6 min-h-14">
          <p className="text-lg font-semibold text-white">
            {incoming ? callerLabel : `Calling ${outgoingLabel}`}
          </p>
          <p className="mt-1 animate-pulse text-sm text-white/75">
            {incoming ? "is calling you" : "Ringing…"}
          </p>
          {(call?.title || (outgoingCall?.title && outgoingNames.length > 0)) && (
            <p className="mt-2 text-xs text-white/55">{call?.title ?? outgoingCall?.title}</p>
          )}
        </div>

        <div className="mb-12 flex h-24 items-center justify-center -space-x-4">
          {visibleUsers.length > 0 ? visibleUsers.map((callUser) => (
            <UserAvatar
              key={callUser.id}
              user={callUser}
              className="h-20 w-20 border-4 border-white/15 shadow-xl"
              fallbackClassName="text-2xl"
            />
          )) : (
            <UserAvatar
              user={{ firstName: incoming ? callerLabel : outgoingLabel, email: "" }}
              className="h-20 w-20 border-4 border-white/15 shadow-xl"
              fallbackClassName="text-2xl"
            />
          )}
          {!incoming && userIds.length > 3 && (
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-4 border-white/15 bg-white/15 text-sm font-semibold text-white shadow-xl">
              +{userIds.length - 3}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-6">
          {incoming && (
            <>
              <Button
                size="icon"
                className="h-14 w-14 rounded-full bg-primary text-white shadow-lg hover:bg-primary-hover"
                onClick={accept}
                title={`Answer ${kind} call`}
                aria-label={`Answer ${kind} call`}
              >
                <Video className="h-6 w-6" />
              </Button>
              <Button
                size="icon"
                className="h-14 w-14 rounded-full bg-primary text-white shadow-lg hover:bg-primary-hover"
                onClick={accept}
                title="Answer call"
                aria-label="Answer call"
              >
                <Phone className="h-6 w-6" />
              </Button>
            </>
          )}
          <Button
            size="icon"
            className="h-14 w-14 rounded-full bg-error text-white shadow-lg hover:brightness-90"
            onClick={incoming ? decline : cancel}
            title={incoming ? "Decline call" : "Cancel call"}
            aria-label={incoming ? "Decline call" : "Cancel call"}
          >
            <PhoneOff className="h-6 w-6" />
          </Button>
        </div>
      </div>
    </div>
  );
}
