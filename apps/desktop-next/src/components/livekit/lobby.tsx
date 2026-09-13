import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Copy,
  Lightbulb,
  Mic,
  MicOff,
  Plus,
  Users,
  Video,
  VideoOff,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@teamspace-one/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { useMediaDevices } from "@/hooks/useMediaDevices";
import { useUsers } from "@/hooks/api";
import { getMeetingShareLink, type Meeting, type UserDto } from "@/lib/api";
import { getUserDisplayName } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { SOUNDS } from "@/lib/sounds";

interface MeetingLobbyProps {
  meeting: Meeting;
  user?: UserDto | null;
  onJoin: (opts: {
    audioEnabled: boolean;
    videoEnabled: boolean;
    audioInputId?: string;
    videoInputId?: string;
    audioOutputId?: string;
    stream?: MediaStream;
  }) => void;
  onCancel: () => void;
  nativeFrame?: string | null;
  nativeError?: string | null;
  nativeDevices?: { id: string; name: string }[];
  nativeCameraIndex?: number | null;
  setNativeCamera?: (index: number) => void;
  nativeVideoEnabled?: boolean;
  setNativeVideoEnabled?: (enabled: boolean) => void;
  nativeAudioDevices?: { id: string; name: string }[];
  nativeAudioIndex?: number | null;
  setNativeAudio?: (index: number) => void;
  nativeAudioEnabled?: boolean;
  setNativeAudioEnabled?: (enabled: boolean) => void;
  nativeAudioError?: string | null;
  nativeVideoStream?: MediaStream | null;
  nativeAudioStream?: MediaStream | null;
}

function DeviceSelector({
  icon,
  label,
  device,
  active = true,
  items,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  device: string;
  active?: boolean;
  items: { id: string; label: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="group flex w-full items-center gap-4 rounded-xl border border-white/[0.07] bg-[#111d2d] px-5 py-3.5 text-left transition hover:border-indigo-400/30 hover:bg-[#142237]">
          <span className="flex w-8 shrink-0 items-center justify-center text-white">{icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] text-slate-400">{label}</span>
            <span className="mt-1 block truncate text-sm font-medium text-slate-200">{device}</span>
          </span>
          <span className="flex items-center gap-2">
            {active && (
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/30" />
            )}
            <ChevronDown size={17} className="text-slate-400 transition group-hover:text-white" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {items.length === 0 ? (
          <DropdownMenuItem disabled>System default</DropdownMenuItem>
        ) : (
          items.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => onSelect(item.id)}>
              {item.label}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ControlButton({
  icon,
  label,
  active = true,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="group flex flex-col items-center gap-2">
      <span
        className={`relative flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.05] shadow-lg transition ${
          active
            ? "bg-[#142337] text-white hover:bg-[#1b2e46]"
            : "bg-red-500/15 text-red-400 hover:bg-red-500/25"
        }`}
      >
        {icon}
      </span>
      <span className="text-[11px] text-slate-300">{label}</span>
    </button>
  );
}

function MicLevelMeter({ stream }: { stream: MediaStream | null | undefined }) {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream) {
      setLevel(0);
      return;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
      setLevel(peak);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close().catch(() => {});
    };
  }, [stream]);

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-emerald-400 transition-[width] duration-75"
        style={{ width: `${Math.min(100, Math.round(level * 140))}%` }}
      />
    </div>
  );
}

export function MeetingLobby({
  meeting,
  user,
  onJoin,
  onCancel,
  nativeFrame,
  nativeError,
  nativeDevices = [],
  nativeCameraIndex,
  setNativeCamera,
  nativeVideoEnabled = false,
  setNativeVideoEnabled,
  nativeAudioDevices = [],
  nativeAudioIndex,
  setNativeAudio,
  nativeAudioEnabled = false,
  setNativeAudioEnabled,
  nativeAudioError,
  nativeVideoStream,
  nativeAudioStream,
}: MeetingLobbyProps) {
  const {
    audioOutputId,
    setSpeakerDevice,
    audioOutputDevices,
  } = useMediaDevices({ audioEnabled: false, videoEnabled: false });

  const [copiedLink, setCopiedLink] = useState(false);
  const [testing, setTesting] = useState(false);
  const displayName = getUserDisplayName(user, "Guest");

  const videoSupported = Boolean(setNativeVideoEnabled);
  const isVoiceRoom = meeting.type === "voice_room";

  const attendeeIds = useMemo(
    () =>
      [
        ...new Set(
          [
            meeting.createdBy,
            ...(meeting.participants ?? []).map((p) => p.userId),
            ...(meeting.invitees ?? []).map((i) => i.userId),
          ].filter(Boolean),
        ),
      ],
    [meeting],
  );
  const { data: attendeeUsers } = useUsers(attendeeIds);
  const userMap = useMemo(
    () => new Map((attendeeUsers ?? []).map((u) => [u.id, u])),
    [attendeeUsers],
  );
  const host = userMap.get(meeting.createdBy);
  const guestParticipants = (meeting.participants ?? []).filter(
    (p) => p.userId.startsWith("guest:") && p.guestName,
  );

  const scheduledDate = meeting.scheduledAt ? new Date(meeting.scheduledAt) : null;
  const whenLabel = (() => {
    if (!scheduledDate) return null;
    const today = new Date();
    const day =
      scheduledDate.toDateString() === today.toDateString()
        ? "Today"
        : scheduledDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    const start = scheduledDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (meeting.durationMinutes) {
      const end = new Date(scheduledDate.getTime() + meeting.durationMinutes * 60_000);
      return `${day}, ${start} – ${end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
    }
    return `${day}, ${start}`;
  })();

  const kindLabel = isVoiceRoom ? "Voice Room" : attendeeIds.length > 2 ? "Group Meeting" : "1:1 Call";
  const statusLabel =
    meeting.status === "started" ? "Live now" : meeting.status === "scheduled" ? "Scheduled" : meeting.status;

  const selectedCamera =
    nativeDevices.find((d) => Number(d.id) === nativeCameraIndex)?.name ?? "System default";
  const selectedMic =
    nativeAudioDevices.find((d) => Number(d.id) === nativeAudioIndex)?.name ?? "System default";
  const selectedSpeaker =
    audioOutputDevices.find((d) => d.deviceId === audioOutputId)?.label ?? "System default";

  async function copyInviteLink() {
    try {
      const { url } = await getMeetingShareLink(meeting.id);
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy invite link", err);
    }
  }

  function testSpeaker() {
    try {
      const audio = new Audio(SOUNDS.notification);
      if (audioOutputId && "setSinkId" in audio) {
        void (audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> })
          .setSinkId(audioOutputId)
          .catch(() => {});
      }
      void audio.play().catch(() => {});
    } catch {
      // Audio not available.
    }
  }

  function handleJoin() {
    const tracks: MediaStreamTrack[] = [];
    if (nativeAudioEnabled && nativeAudioStream) {
      tracks.push(...nativeAudioStream.getAudioTracks());
    }
    if (nativeVideoEnabled && nativeVideoStream) {
      tracks.push(...nativeVideoStream.getVideoTracks());
    }
    onJoin({
      audioEnabled: nativeAudioEnabled,
      videoEnabled: nativeVideoEnabled,
      audioOutputId,
      stream: tracks.length > 0 ? new MediaStream(tracks) : undefined,
    });
  }

  return (
    <div className="relative flex h-full flex-col overflow-y-auto bg-[#050b16] text-white">
      {/* Background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 bottom-[-120px] h-[400px] w-[500px] rounded-full bg-indigo-600/10 blur-[100px]" />
        <div className="absolute right-[20%] top-[-180px] h-[500px] w-[500px] rounded-full bg-blue-700/10 blur-[130px]" />
        <div className="absolute bottom-[-100px] right-[-180px] h-[500px] w-[500px] rounded-full bg-violet-600/10 blur-[130px]" />
      </div>

      {/* Header */}
      <header className="relative flex h-16 shrink-0 items-center justify-between px-6 sm:px-8">
        <button
          onClick={onCancel}
          className="flex items-center gap-2 text-sm text-slate-300 transition hover:text-white"
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <div className="flex items-center gap-3">
          <UserAvatar user={user} className="h-9 w-9" />
          <span className="text-sm font-medium">{displayName}</span>
        </div>
      </header>

      {/* Meeting info */}
      <section className="relative flex flex-col items-center px-6 pt-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 shadow-xl shadow-indigo-950/50">
          {isVoiceRoom ? <Mic size={30} /> : <Video size={30} />}
        </div>
        <h1 className="mt-5 text-[27px] font-semibold tracking-tight">{meeting.title}</h1>
        {whenLabel ? <p className="mt-1 text-sm text-slate-300">{whenLabel}</p> : null}
        {meeting.description ? (
          <p className="mt-1 max-w-xl text-center text-sm text-slate-400">{meeting.description}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-white/[0.07] bg-[#111d2d] px-4 py-1.5 text-xs text-slate-300">
            {kindLabel}
          </span>
          <span className="rounded-full border border-white/[0.07] bg-[#111d2d] px-4 py-1.5 text-xs text-slate-300">
            {statusLabel}
          </span>
          {meeting.durationMinutes ? (
            <span className="rounded-full border border-white/[0.07] bg-[#111d2d] px-4 py-1.5 text-xs text-slate-300">
              {meeting.durationMinutes} min
            </span>
          ) : null}
          <span className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-[#111d2d] px-4 py-1.5 text-xs text-slate-300">
            <Users size={13} />
            Hosted by {host ? getUserDisplayName(host) : "…"}
          </span>
        </div>
      </section>

      {/* Content */}
      <main className="relative mx-auto mt-7 flex w-full max-w-[1320px] flex-1 gap-10 px-8 pb-10">
        {/* Left */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="mb-5 text-center">
            <h2 className="text-lg font-semibold">You're almost there!</h2>
            <p className="mt-1 text-sm text-slate-400">
              Check your audio{videoSupported ? " and video" : ""} settings before joining.
            </p>
          </div>

          {/* Preview + devices */}
          <div
            className={`grid min-h-[370px] overflow-hidden rounded-xl border border-white/[0.10] bg-[#0b1523]/80 ${
              videoSupported ? "grid-cols-[1.1fr_0.9fr]" : "grid-cols-1"
            }`}
          >
            {/* Camera preview / audio-only avatar */}
            {videoSupported ? (
              <div className="border-r border-white/[0.06] p-4">
                <div className="relative h-full min-h-[340px] overflow-hidden rounded-xl bg-[#111b29]">
                  {nativeVideoEnabled && nativeFrame ? (
                    <>
                      <img
                        src={nativeFrame}
                        alt="Camera preview"
                        className="h-full w-full object-cover"
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-700">
                        <VideoOff size={30} className="text-slate-300" />
                      </div>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-2 backdrop-blur">
                    <span className="text-xs font-medium text-white">{displayName}</span>
                  </div>
                  {nativeAudioError || nativeError ? (
                    <div className="absolute inset-x-0 top-0 bg-error/90 p-2 text-center text-xs text-white">
                      {nativeAudioError || nativeError}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Device selectors */}
            <div className="flex flex-col justify-center gap-4 p-5">
              {!videoSupported ? (
                <div className="mb-2 flex flex-col items-center gap-3">
                  <UserAvatar user={user} className="h-20 w-20" fallbackClassName="text-2xl" />
                  <p className="text-sm font-medium text-slate-200">{displayName}</p>
                </div>
              ) : null}
              {videoSupported ? (
                <DeviceSelector
                  icon={<Camera size={23} />}
                  label="Camera"
                  device={selectedCamera}
                  items={nativeDevices.map((d) => ({ id: d.id, label: d.name }))}
                  onSelect={(id) => setNativeCamera?.(Number(id))}
                />
              ) : null}
              <DeviceSelector
                icon={<Mic size={23} />}
                label="Microphone"
                device={selectedMic}
                items={nativeAudioDevices.map((d) => ({ id: d.id, label: d.name }))}
                onSelect={(id) => setNativeAudio?.(Number(id))}
              />
              <DeviceSelector
                icon={<Volume2 size={23} />}
                label="Speaker"
                device={selectedSpeaker}
                items={audioOutputDevices.map((d) => ({ id: d.deviceId, label: d.label }))}
                onSelect={setSpeakerDevice}
              />
              <button
                onClick={() => setTesting((t) => !t)}
                className={`flex h-[50px] items-center justify-center gap-3 rounded-xl border text-sm font-medium transition ${
                  testing
                    ? "border-indigo-400/40 bg-indigo-500/15 text-white"
                    : "border-white/[0.07] bg-[#111d2d] text-slate-300 hover:border-indigo-400/30 hover:bg-[#142237] hover:text-white"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 12h2" />
                  <path d="M8 9v6" />
                  <path d="M12 6v12" />
                  <path d="M16 9v6" />
                  <path d="M20 12h-2" />
                </svg>
                Test Audio{videoSupported ? " & Video" : ""}
              </button>
              {testing ? (
                <div className="space-y-3 rounded-xl border border-white/[0.07] bg-[#0e1a29] p-4">
                  <div>
                    <p className="mb-2 text-[11px] text-slate-400">Microphone level</p>
                    <MicLevelMeter stream={nativeAudioEnabled ? nativeAudioStream : null} />
                    {!nativeAudioEnabled ? (
                      <p className="mt-2 text-[11px] text-slate-500">Unmute the mic to see the level.</p>
                    ) : null}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={testSpeaker}
                  >
                    Play test sound on {selectedSpeaker}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          {/* Controls */}
          <div className="mt-5 flex items-start justify-center gap-9">
            <ControlButton
              icon={nativeAudioEnabled ? <Mic size={21} /> : <MicOff size={21} />}
              label="Mic"
              active={nativeAudioEnabled}
              onClick={() => setNativeAudioEnabled?.(!nativeAudioEnabled)}
            />
            {videoSupported ? (
              <ControlButton
                icon={nativeVideoEnabled ? <Video size={21} /> : <VideoOff size={21} />}
                label="Camera"
                active={nativeVideoEnabled}
                onClick={() => setNativeVideoEnabled?.(!nativeVideoEnabled)}
              />
            ) : null}
          </div>

          {/* Join */}
          <div className="flex justify-center py-8">
            <button
              onClick={handleJoin}
              className="group flex h-14 min-w-[275px] items-center justify-center gap-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-8 text-[17px] font-semibold text-white shadow-xl shadow-indigo-950/40 transition hover:-translate-y-0.5 hover:from-indigo-400 hover:to-violet-400"
            >
              Join {isVoiceRoom ? "Voice Room" : "Meeting"}
              <ArrowRight size={20} className="transition group-hover:translate-x-1" />
            </button>
          </div>
        </section>

        {/* Right: participants */}
        <div className="hidden w-[430px] shrink-0 xl:block">
          <aside className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-white/[0.10] bg-[#111a29]/90 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/[0.05] px-5 py-5">
              <h2 className="text-[16px] font-semibold">
                Participants ({attendeeIds.length + guestParticipants.length})
              </h2>
              <button
                onClick={copyInviteLink}
                className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-950/30 transition hover:bg-indigo-400"
              >
                {copiedLink ? <Check size={17} /> : <Plus size={17} />}
                {copiedLink ? "Copied" : "Invite"}
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              {attendeeIds.map((id) => {
                const u = userMap.get(id);
                const isYou = id === user?.id;
                const isHost = id === meeting.createdBy;
                return (
                  <div key={id} className="flex items-center gap-4">
                    <div className="relative">
                      <UserAvatar user={u ?? null} className="h-12 w-12" />
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#101b2b] bg-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">
                        {u ? getUserDisplayName(u) : "…"}
                        {isYou ? <span className="font-normal text-slate-400"> (You)</span> : null}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{isHost ? "Host" : "Participant"}</p>
                    </div>
                  </div>
                );
              })}
              {guestParticipants.map((p) => (
                <div key={p.id} className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#172c52] text-sm font-semibold text-white">
                    {(p.guestName ?? "G").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{p.guestName}</p>
                    <p className="mt-1 text-xs text-slate-400">Guest</p>
                  </div>
                </div>
              ))}
            </div>

            {attendeeIds.length + guestParticipants.length <= 1 ? (
              <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
                <div className="relative mb-7">
                  <div className="absolute inset-0 rounded-full bg-indigo-500/10 blur-3xl" />
                  <Users size={72} strokeWidth={1.5} className="relative text-slate-500" />
                </div>
                <h3 className="text-lg font-semibold text-slate-200">No one else has joined yet</h3>
                <p className="mt-2 max-w-[280px] text-sm leading-6 text-slate-400">
                  Share the meeting link to invite participants.
                </p>
                <button
                  onClick={copyInviteLink}
                  className="mt-6 flex items-center gap-2 rounded-lg border border-indigo-500 bg-indigo-500/10 px-5 py-3 text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/20"
                >
                  {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                  {copiedLink ? "Link copied" : "Copy Meeting Link"}
                </button>
              </div>
            ) : null}

            <div className="mt-auto p-5">
              <div className="flex items-start gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 px-4 py-4">
                <Lightbulb size={19} className="mt-0.5 shrink-0 text-yellow-400" />
                <p className="text-xs leading-5 text-slate-300">
                  <span className="font-semibold text-white">Tip:</span> You can join early and wait
                  for others to arrive.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
