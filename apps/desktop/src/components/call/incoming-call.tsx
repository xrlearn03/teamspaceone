import { useEffect, useRef, useState } from "react";
import {
  CameraOff,
  Check,
  Copy,
  Ellipsis,
  Expand,
  Lightbulb,
  Link2,
  Lock,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  PhoneCall,
  PhoneOff,
  UserRound,
  Video,
  Volume2,
} from "lucide-react";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { useRealtime, type RealtimeEventPayloads } from "../../hooks/useRealtime";
import { useUIStore } from "../../stores/ui";
import { useChannels, useMe, useUsers } from "../../hooks/api";
import { UserAvatar } from "../user-avatar";
import { Button } from "@teamspace-one/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { SOUNDS, loopSound } from "../../lib/sounds";
import { getUserDisplayName } from "../../lib/utils";
import { getMeetingShareLink } from "../../lib/api";

type IncomingCall = RealtimeEventPayloads["call.incoming"];

const RING_TIMEOUT_MS = 30_000;

const CALL_STEPS = [
  { icon: <Volume2 size={21} />, title: "Ringing" },
  { icon: <PhoneCall size={21} />, title: "Calling" },
  { icon: <UserRound size={21} />, title: "Waiting" },
  { icon: <Ellipsis size={21} />, title: "They'll join soon" },
];

function CallControl({
  icon,
  label,
  danger = false,
  active = true,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="group flex min-w-[70px] flex-col items-center gap-2">
      <span
        className={`flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.05] transition ${
          danger
            ? "bg-red-500 text-white shadow-lg shadow-red-950/40 hover:bg-red-400"
            : active
              ? "bg-[#132237] text-white hover:bg-[#1b2e47]"
              : "bg-red-500/20 text-red-400"
        }`}
      >
        {icon}
      </span>
      <span className="text-[11px] font-medium text-slate-300">{label}</span>
    </button>
  );
}

export function IncomingCallOverlay() {
  const { onRealtimeEvent, sendCallResponse, sendCallCancel, outgoingCall } = useRealtime();
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { data: user } = useMe();
  const { data: channels } = useChannels();
  const [call, setCall] = useState<IncomingCall | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);

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

  // Reset local state whenever a new outgoing call starts.
  useEffect(() => {
    if (outgoingCall) {
      setMinimized(false);
      setMicOn(true);
      setCamOn(true);
      setCopiedLink(false);
    }
  }, [outgoingCall?.meetingId]);

  // Capture local media so the caller can preview themselves and control
  // mute/video while the call is ringing.
  const isOutgoing = !call && Boolean(outgoingCall);
  const wantsVideo = outgoingCall?.kind === "video";
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!isOutgoing) {
      setLocalStream(null);
      return;
    }
    let active = true;
    let stream: MediaStream | null = null;
    const acquire = async () => {
      // getUserMedia throws "The operation is insecure" outside a secure
      // context (Tauri WKWebView, plain-http origins) — skip the preview there.
      if (
        window.isSecureContext === false ||
        typeof navigator.mediaDevices?.getUserMedia !== "function"
      ) {
        return null;
      }
      try {
        return await navigator.mediaDevices.getUserMedia(
          wantsVideo ? { video: true, audio: true } : { audio: true },
        );
      } catch {
        if (wantsVideo) {
          try {
            return await navigator.mediaDevices.getUserMedia({ video: true });
          } catch {
            return null;
          }
        }
        return null;
      }
    };
    void acquire().then((s) => {
      if (!active) {
        s?.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      setLocalStream(s);
    });
    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setLocalStream(null);
    };
  }, [isOutgoing, wantsVideo]);

  useEffect(() => {
    localStream?.getAudioTracks().forEach((t) => {
      t.enabled = micOn;
    });
  }, [localStream, micOn]);

  useEffect(() => {
    localStream?.getVideoTracks().forEach((t) => {
      t.enabled = camOn;
    });
  }, [localStream, camOn]);

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream, camOn]);

  const userIds = call ? [call.callerId] : outgoingCall?.userIds ?? [];
  const { data: callUsers } = useUsers(userIds);

  if (!call && !outgoingCall) return null;

  const incoming = Boolean(call);
  const kind = call?.kind ?? outgoingCall!.kind;
  const callerLabel = call?.callerName ?? "Someone";
  const isGroupCall = !incoming && userIds.length > 1;
  const visibleUsers = (callUsers ?? []).slice(0, isGroupCall ? 8 : 3);
  const groupOverflow = isGroupCall ? Math.max(0, userIds.length - visibleUsers.length) : 0;
  const outgoingNames = (callUsers ?? []).map((callUser) => getUserDisplayName(callUser));
  const outgoingLabel =
    outgoingNames.length === 0
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

  async function copyInviteLink() {
    if (!outgoingCall) return;
    try {
      const { url } = await getMeetingShareLink(outgoingCall.meetingId);
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy invite link", err);
    }
  }

  function openChat() {
    if (!outgoingCall?.channelId) return;
    const channel = channels?.find((c) => c.id === outgoingCall.channelId);
    setMinimized(true);
    setActiveView(channel?.type === "direct" ? "dm" : "channel", { channelId: outgoingCall.channelId });
  }

  /* ============================ INCOMING ============================ */
  if (call) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#020817]"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 70% 85% at 100% 72%, rgba(75, 73, 255, 0.95) 0%, rgba(31, 42, 164, 0.62) 31%, transparent 70%), radial-gradient(ellipse 60% 55% at 0% 0%, rgba(0, 102, 255, 0.9) 0%, rgba(0, 52, 126, 0.58) 38%, transparent 72%), linear-gradient(135deg, #03142d 0%, #020817 48%, #07123d 100%)",
        }}
      >
        <img
          src="/calling-background-mobile.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover landscape:hidden"
        />
        <img
          src="/call-background.png"
          alt=""
          className="absolute inset-0 hidden h-full w-full object-cover landscape:block"
        />
        <div className="absolute inset-0 bg-black/10" />
        <div className="relative flex w-full max-w-lg flex-col items-center px-8 py-12 text-center">
          <div className="mb-6 min-h-14">
            <p className="text-lg font-semibold text-white">{callerLabel}</p>
            <p className="mt-1 animate-pulse text-sm text-white/75">is calling you</p>
            {call.title && <p className="mt-2 text-xs text-white/55">{call.title}</p>}
          </div>

          <div className="mb-12 flex h-24 items-center justify-center -space-x-4">
            {visibleUsers.length > 0 ? (
              visibleUsers.map((callUser) => (
                <UserAvatar
                  key={callUser.id}
                  user={callUser}
                  className="h-20 w-20 border-4 border-white/15 shadow-xl"
                  fallbackClassName="text-2xl"
                />
              ))
            ) : (
              <UserAvatar
                user={{ firstName: callerLabel, email: "" }}
                className="h-20 w-20 border-4 border-white/15 shadow-xl"
                fallbackClassName="text-2xl"
              />
            )}
          </div>

          <div className="flex items-center justify-center gap-6">
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
            <Button
              size="icon"
              className="h-14 w-14 rounded-full bg-error text-white shadow-lg hover:brightness-90"
              onClick={decline}
              title="Decline call"
              aria-label="Decline call"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ============================ OUTGOING ============================ */
  if (!outgoingCall) return null;

  if (minimized) {
    return (
      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-white/10 bg-[#0c1d30] px-4 py-3 text-white shadow-2xl">
        <UserAvatar user={callUsers?.[0] ?? null} className="h-10 w-10" />
        <div className="min-w-0">
          <p className="max-w-40 truncate text-sm font-medium">Calling {outgoingLabel}</p>
          <p className="animate-pulse text-xs text-slate-400">Ringing…</p>
        </div>
        <button
          onClick={() => setMinimized(false)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition hover:bg-white/10 hover:text-white"
          aria-label="Expand call"
        >
          <Expand size={16} />
        </button>
        <button
          onClick={cancel}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-400"
          aria-label="End call"
        >
          <PhoneOff size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#050b16] text-white">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-40 top-[20%] h-[500px] w-[600px] rounded-full bg-indigo-700/10 blur-[120px]" />
        <div className="absolute right-[-150px] top-[10%] h-[550px] w-[550px] rounded-full bg-blue-700/10 blur-[130px]" />
        <div className="absolute bottom-[-200px] right-[-100px] h-[500px] w-[500px] rounded-full bg-indigo-700/10 blur-[120px]" />
        <div className="absolute -left-[250px] top-[130px] h-[650px] w-[500px] rotate-[-20deg] rounded-[50%] border border-indigo-500/10" />
        <div className="absolute -left-[280px] top-[160px] h-[620px] w-[460px] rotate-[-20deg] rounded-[50%] border border-indigo-500/10" />
      </div>

      {/* Top bar */}
      <header className="relative flex h-[85px] shrink-0 items-center justify-between px-7">
        <div className="w-40" />
        <div className="text-center">
          <p className="text-sm font-medium text-white">
            {isGroupCall ? "Group Call" : "1:1 Call"}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-slate-300">
            <Lock size={12} />
            End-to-end encrypted
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-white/[0.07] bg-[#0c1d30] text-white transition hover:bg-[#12263e]"
                aria-label="Call options"
              >
                <Ellipsis size={20} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => void copyInviteLink()}>
                <Copy className="mr-2 h-4 w-4" /> Copy invite link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={cancel}>
                <PhoneOff className="mr-2 h-4 w-4" /> Cancel call
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="h-8 w-px bg-white/[0.10]" />
          <button
            onClick={() => setMinimized(true)}
            className="flex items-center gap-3 rounded-lg border border-indigo-400/40 bg-[#0c1d30] px-5 py-3 text-sm font-medium text-white transition hover:bg-indigo-500/10"
          >
            <Expand size={16} />
            Minimize
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="relative flex flex-1 items-center justify-center px-6 pb-[130px] lg:px-10">
        <div className="grid w-full max-w-[1280px] grid-cols-1 items-center gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:gap-16">
          {/* Local preview */}
          <section className="flex justify-center">
            <div className="relative aspect-[4/3] w-full max-w-[725px] overflow-hidden rounded-2xl border border-indigo-400/50 bg-[#111b2b] shadow-2xl shadow-black/30">
              {wantsVideo && camOn && (localStream?.getVideoTracks().length ?? 0) > 0 ? (
                <>
                  <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10" />
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3">
                  {wantsVideo ? (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full bg-slate-700">
                      <CameraOff size={32} className="text-slate-300" />
                    </div>
                  ) : (
                    <>
                      <UserAvatar user={user} className="h-24 w-24" fallbackClassName="text-3xl" />
                      {!micOn && <p className="text-xs text-red-400">Microphone off</p>}
                    </>
                  )}
                </div>
              )}
              <div className="absolute bottom-5 left-5">
                <p className="text-lg font-semibold text-white">You</p>
                <p className="mt-1 text-sm text-slate-300">{myName}</p>
              </div>
            </div>
          </section>

          {/* Status */}
          <section className="flex flex-col items-center">
            <div className="relative flex h-[230px] w-[230px] items-center justify-center">
              <div className="absolute h-[220px] w-[220px] animate-pulse rounded-full border border-indigo-500/10" />
              <div
                className="absolute h-[190px] w-[190px] rounded-full border border-indigo-500/20"
                style={{ animation: "callpulse 2.5s ease-in-out infinite" }}
              />
              <div
                className="absolute h-[160px] w-[160px] rounded-full border border-indigo-500/40"
                style={{ animation: "callpulse 2s ease-in-out infinite" }}
              />
              <div className="relative z-10 flex items-center justify-center -space-x-4">
                {visibleUsers.length > 0 ? (
                  visibleUsers
                    .slice(0, 3)
                    .map((callUser) => (
                      <UserAvatar
                        key={callUser.id}
                        user={callUser}
                        className={`${isGroupCall ? "h-20 w-20" : "h-28 w-28"} border-2 border-indigo-400/60 shadow-[0_0_35px_rgba(99,102,241,0.18)]`}
                        fallbackClassName={isGroupCall ? "text-2xl" : "text-4xl"}
                      />
                    ))
                ) : (
                  <UserAvatar
                    user={{ firstName: outgoingCall.title ?? "?", email: "" }}
                    className="h-28 w-28 border-2 border-indigo-400/60"
                    fallbackClassName="text-4xl"
                  />
                )}
                {groupOverflow > 0 && (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-indigo-400/60 bg-[#172542] text-lg font-semibold text-white shadow-[0_0_35px_rgba(99,102,241,0.18)]">
                    +{groupOverflow}
                  </div>
                )}
              </div>
            </div>

            <h2 className="mt-[-5px] text-[20px] font-semibold text-white">
              Calling {outgoingLabel}…
            </h2>
            <p className="mt-2 text-sm text-slate-300">Ringing…</p>

            {/* Progress */}
            <div className="mt-8 flex items-start justify-center gap-10">
              {CALL_STEPS.map((step, index) => (
                <div key={index} className="flex w-[80px] flex-col items-center text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#132237] text-white">
                    {step.icon}
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-slate-300">{step.title}</p>
                </div>
              ))}
            </div>

            {/* Tip */}
            <div className="mt-8 w-full max-w-[470px]">
              <div className="flex items-start gap-4 rounded-xl border border-indigo-500/40 bg-indigo-500/[0.05] px-5 py-4">
                <Lightbulb size={19} className="mt-0.5 shrink-0 text-yellow-400" />
                <p className="text-sm leading-6 text-slate-300">
                  <span className="font-semibold text-white">Tip:</span> You can chat, share files or
                  take notes while waiting.
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Controls */}
      <footer className="absolute bottom-0 left-0 right-0 flex h-[125px] items-center justify-center border-t border-white/[0.07] bg-[#081320]/95 backdrop-blur-xl">
        <div className="flex items-start gap-8">
          <CallControl
            icon={micOn ? <Mic size={23} /> : <MicOff size={23} />}
            label={micOn ? "Mute" : "Unmute"}
            active={micOn}
            onClick={() => setMicOn((v) => !v)}
          />
          {wantsVideo ? (
            <CallControl
              icon={camOn ? <Video size={23} /> : <CameraOff size={23} />}
              label={camOn ? "Stop Video" : "Start Video"}
              active={camOn}
              onClick={() => setCamOn((v) => !v)}
            />
          ) : null}
          <CallControl
            icon={copiedLink ? <Check size={22} /> : <Link2 size={22} />}
            label={copiedLink ? "Copied" : "Invite"}
            onClick={() => void copyInviteLink()}
          />
          {outgoingCall.channelId ? (
            <CallControl
              icon={<MessageSquare size={22} />}
              label="Chat"
              onClick={openChat}
            />
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="group flex min-w-[70px] flex-col items-center gap-2">
                <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.05] bg-[#132237] text-white transition hover:bg-[#1b2e47]">
                  <Ellipsis size={23} />
                </span>
                <span className="text-[11px] font-medium text-slate-300">More</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" sideOffset={8}>
              <DropdownMenuItem onSelect={() => void copyInviteLink()}>
                <Copy className="mr-2 h-4 w-4" /> Copy invite link
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setMinimized(true)}>
                <Expand className="mr-2 h-4 w-4" /> Minimize
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="mx-1 h-10 w-px bg-white/[0.08]" />
          <CallControl
            icon={<PhoneOff size={22} />}
            label="End Call"
            danger
            onClick={cancel}
          />
        </div>
      </footer>

      <style>{`
        @keyframes callpulse {
          0%, 100% { transform: scale(0.95); opacity: 0.45; }
          50% { transform: scale(1.05); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
