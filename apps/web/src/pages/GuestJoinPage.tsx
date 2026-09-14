import { useEffect, useRef, useState } from "react";
import {
  Hand,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Smile,
  Users,
  Video,
  VideoOff,
  X,
} from "lucide-react";
import { useGuestSfu, defaultSfuUrl } from "../lib/sfu";

const API_BASE =
  (typeof import.meta !== "undefined" &&
    ((import.meta as unknown as { env?: { VITE_API_URL?: string } }).env
      ?.VITE_API_URL)) ||
  "";

interface MeetingInfo {
  meetingId: string;
  title: string;
  type: string;
  status: string;
  scheduledAt?: string | null;
}

interface GuestJoinResult {
  participantId: string;
  roomId: string;
  userId: string;
  displayName: string;
  title: string;
  type: string;
  token: string;
}

function trackLive(stream: MediaStream | null | undefined, kind: "audio" | "video") {
  const tracks = kind === "audio" ? stream?.getAudioTracks() : stream?.getVideoTracks();
  return tracks?.some((t) => t.enabled && !t.muted && t.readyState !== "ended") ?? false;
}

function ConferenceTile({
  name,
  subtitle,
  stream,
  isLocal,
  isScreen,
  videoEnabled,
  audioOn,
  raisedHand,
  onToggleMic,
  onToggleCamera,
}: {
  name: string;
  subtitle?: string;
  stream: MediaStream | null;
  isLocal?: boolean;
  isScreen?: boolean;
  videoEnabled: boolean;
  audioOn: boolean;
  raisedHand?: boolean;
  onToggleMic?: () => void;
  onToggleCamera?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const hasLiveVideo = !isScreen && videoEnabled && trackLive(stream, "video");
  const showVideo = (isScreen && stream != null) || hasLiveVideo;

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream, showVideo]);

  useEffect(() => {
    if (audioRef.current && stream) audioRef.current.srcObject = stream;
  }, [stream, showVideo]);

  return (
    <div className="relative min-h-0 overflow-hidden rounded-xl border border-white/[0.07] bg-[#0d1c2c]">
      {showVideo && stream ? (
        <video
          ref={videoRef}
          autoPlay
          muted={isLocal}
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#101e30] to-[#0b1828]">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#334675] text-2xl font-semibold text-white">
            {name.charAt(0).toUpperCase() || "?"}
          </div>
        </div>
      )}
      {showVideo ? (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
      ) : null}
      {/* Remote audio when no video element carries it */}
      {!isLocal && stream && !showVideo ? (
        <audio ref={audioRef} autoPlay playsInline className="hidden" />
      ) : null}

      {raisedHand ? (
        <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-slate-900 shadow-lg">
          <Hand size={16} />
        </span>
      ) : null}

      {/* Bottom info */}
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between p-3">
        <div className="rounded-lg bg-black/55 px-2.5 py-2 backdrop-blur-xl">
          <span className="text-xs font-semibold text-white">
            {name}
            {isLocal ? " (You)" : ""}
          </span>
          {subtitle ? <p className="mt-0.5 text-[10px] text-slate-300">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-1.5">
          {isLocal && onToggleMic ? (
            <button
              onClick={onToggleMic}
              className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-xl transition ${
                audioOn ? "bg-black/50 text-white" : "bg-red-500/80 text-red-100"
              }`}
              aria-label={audioOn ? "Mute" : "Unmute"}
            >
              {audioOn ? <Mic size={16} /> : <MicOff size={16} />}
            </button>
          ) : (
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-xl ${
                audioOn ? "bg-black/50 text-white" : "bg-red-500/80 text-red-100"
              }`}
            >
              {audioOn ? <Mic size={16} /> : <MicOff size={16} />}
            </span>
          )}
          {!isScreen ? (
            isLocal && onToggleCamera ? (
              <button
                onClick={onToggleCamera}
                className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-xl transition ${
                  videoEnabled ? "bg-black/50 text-white" : "bg-red-500/80 text-red-100"
                }`}
                aria-label={videoEnabled ? "Stop video" : "Start video"}
              >
                {videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
              </button>
            ) : (
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-xl ${
                  videoEnabled ? "bg-black/50 text-white" : "bg-red-500/80 text-red-100"
                }`}
              >
                {videoEnabled ? <Video size={16} /> : <VideoOff size={16} />}
              </span>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  icon,
  label,
  active = true,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="group flex min-w-[64px] flex-col items-center gap-2">
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.05] shadow-lg transition ${
          danger
            ? "bg-red-600 text-white hover:bg-red-500"
            : active
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

export function GuestJoinPage({ token }: { token: string }) {
  const sfu = useGuestSfu();

  const [info, setInfo] = useState<MeetingInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [withVideo, setWithVideo] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState<GuestJoinResult | null>(null);
  const [left, setLeft] = useState(false);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [reactions, setReactions] = useState<{ id: string; emoji: string; name: string }[]>([]);
  const processedReactions = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/meetings/public/join/${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { message?: string } | null;
          throw new Error(body?.message ?? "This meeting link is invalid or has expired");
        }
        return res.json() as Promise<MeetingInfo>;
      })
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) setInfoError(err instanceof Error ? err.message : "Invalid meeting link");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Call duration ticker, matching the host's conference header.
  useEffect(() => {
    if (joinedAt === null) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - joinedAt) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [joinedAt]);

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`${API_BASE}/meetings/public/join/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message ?? "Could not join the meeting");
      }
      const result = (await res.json()) as GuestJoinResult;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: withVideo,
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false,
          });
        } catch {
          stream = new MediaStream();
        }
      }

      await sfu.join({
        url: defaultSfuUrl(),
        roomId: result.roomId,
        displayName: result.displayName,
        userId: result.userId,
        token: result.token,
        stream,
      });
      setJoined(result);
      setJoinedAt(Date.now());
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Could not join the meeting");
    } finally {
      setJoining(false);
    }
  }

  function onLeave() {
    sfu.leave();
    setLeft(true);
  }

  function pushReaction(emoji: string, name: string, id: string) {
    if (processedReactions.current.has(id)) return;
    processedReactions.current.add(id);
    setReactions((prev) => [...prev, { id, emoji, name }]);
    window.setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
      processedReactions.current.delete(id);
    }, 2500);
  }

  // In-room events relayed over the SFU channel (raise hand / reactions) —
  // guests have no realtime socket, so this is the shared channel with the
  // in-app conference.
  useEffect(() => {
    return sfu.onRoomEvent((event) => {
      const data = event.data as {
        kind?: string;
        userId?: string;
        raised?: boolean;
        emoji?: string;
        id?: string;
      } | null;
      if (!data || typeof data !== "object") return;
      const actorId = data.userId ?? event.userId;
      if (data.kind === "raise_hand" && actorId) {
        setRaisedHands((prev) => {
          const next = new Set(prev);
          if (data.raised) next.add(actorId);
          else next.delete(actorId);
          return next;
        });
      } else if (data.kind === "reaction" && data.emoji) {
        pushReaction(
          data.emoji,
          event.displayName,
          data.id ?? `room-${event.from}-${Date.now()}`,
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sfu.onRoomEvent]);

  function toggleRaiseHand() {
    if (!joined) return;
    const next = !handRaised;
    setHandRaised(next);
    setRaisedHands((prev) => {
      const s = new Set(prev);
      if (next) s.add(joined.userId);
      else s.delete(joined.userId);
      return s;
    });
    sfu.sendRoomEvent({ kind: "raise_hand", userId: joined.userId, raised: next });
  }

  function sendReaction(emoji: string) {
    if (!joined) return;
    const id = `guest-${joined.userId}-${Date.now()}`;
    pushReaction(emoji, joined.displayName, id);
    sfu.sendRoomEvent({ kind: "reaction", emoji, userId: joined.userId, id });
    setShowReactions(false);
  }

  if (infoError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Cannot join meeting</h1>
          <p className="mt-2 text-slate-600">{infoError}</p>
        </div>
      </div>
    );
  }

  if (left) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold text-slate-900">You left the meeting</h1>
          <p className="mt-2 text-slate-600">{info?.title ?? joined?.title ?? ""}</p>
        </div>
      </div>
    );
  }

  if (joined) {
    const isVoice = joined.type === "voice_room";
    const baseId = (id: string) => id.replace(/^screen-/, "");
    const nameOf = (participantId: string) =>
      sfu.participants.find((p) => p.id === baseId(participantId))?.displayName ?? "Participant";

    const screenStreams = sfu.remoteStreams.filter((s) => s.participantId.startsWith("screen-"));
    const cameraStreams = sfu.remoteStreams.filter((s) => !s.participantId.startsWith("screen-"));

    const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const ss = String(elapsed % 60).padStart(2, "0");

    interface TileData {
      key: string;
      name: string;
      subtitle?: string;
      stream: MediaStream | null;
      isLocal?: boolean;
      isScreen?: boolean;
      videoEnabled: boolean;
      audioOn: boolean;
      raisedHand?: boolean;
    }

    const handFor = (participantId: string) => {
      const userId = sfu.participants.find((p) => p.id === baseId(participantId))?.userId;
      return userId ? raisedHands.has(userId) : false;
    };

    const tiles: TileData[] = [
      ...screenStreams.map((s) => ({
        key: s.participantId,
        name: nameOf(s.participantId),
        subtitle: "Screen share",
        stream: s.stream,
        isScreen: true,
        videoEnabled: true,
        audioOn: false,
      })),
      {
        key: "self",
        name: joined.displayName,
        stream: sfu.localStream,
        isLocal: true,
        videoEnabled: sfu.videoEnabled,
        audioOn: sfu.audioEnabled,
        raisedHand: handRaised,
      },
      ...cameraStreams.map((s) => ({
        key: s.participantId,
        name: nameOf(s.participantId),
        stream: s.stream,
        videoEnabled: trackLive(s.stream, "video"),
        audioOn: trackLive(s.stream, "audio"),
        raisedHand: handFor(s.participantId),
      })),
    ];

    const cols =
      tiles.length <= 1 ? 1 : tiles.length <= 4 ? 2 : tiles.length <= 9 ? 3 : 4;
    const featured = screenStreams.length > 0 ? tiles[0] : null;
    const gridTiles = featured ? tiles.slice(1) : tiles;

    const roster = [
      {
        key: "self",
        name: `${joined.displayName} (You)`,
        audioOn: sfu.audioEnabled,
        videoOn: sfu.videoEnabled,
        raisedHand: handRaised,
      },
      ...sfu.participants
        .filter((p) => p.id !== joined.participantId)
        .map((p) => {
          const stream = cameraStreams.find((s) => s.participantId === p.id)?.stream ?? null;
          return {
            key: p.id,
            name: p.displayName,
            audioOn: trackLive(stream, "audio"),
            videoOn: trackLive(stream, "video"),
            raisedHand: p.userId ? raisedHands.has(p.userId) : false,
          };
        }),
    ];

    return (
      <div className="relative flex h-screen flex-col overflow-hidden bg-[#040b15] text-white">
        {/* Background glow, same as the in-app conference */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-52 bottom-[-150px] h-[600px] w-[700px] rounded-full bg-indigo-700/10 blur-[130px]" />
          <div className="absolute right-[-180px] bottom-[-120px] h-[500px] w-[500px] rounded-full bg-indigo-600/10 blur-[130px]" />
          <div className="absolute right-[25%] top-[-250px] h-[450px] w-[450px] rounded-full bg-blue-700/10 blur-[130px]" />
        </div>

        {/* Header */}
        <header className="relative flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] px-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold sm:text-base">{joined.title}</h1>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
              <span
                className={`h-2 w-2 rounded-full ${sfu.connected ? "bg-emerald-400" : "bg-amber-400"}`}
              />
              <span>{sfu.connected ? "Connected" : "Connecting..."}</span>
              <span>·</span>
              <span>
                {sfu.participants.length + 1} participant
                {sfu.participants.length === 0 ? "" : "s"}
              </span>
              <span>·</span>
              <span>
                {mm}:{ss}
              </span>
            </div>
          </div>
          <button
            onClick={onLeave}
            className="flex items-center gap-2 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-red-500"
          >
            <PhoneOff size={16} />
            Leave
          </button>
        </header>

        {/* Tiles */}
        <main className="relative flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
          {featured ? (
            <div className="min-h-0 flex-1">
              <ConferenceTile
                name={featured.name}
                subtitle={featured.subtitle}
                stream={featured.stream}
                isScreen={featured.isScreen}
                videoEnabled={featured.videoEnabled}
                audioOn={featured.audioOn}
              />
            </div>
          ) : null}
          {gridTiles.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Waiting for others to join...
            </div>
          ) : (
            <div
              className={`grid min-h-0 flex-1 gap-3 ${
                featured ? "auto-rows-[120px] overflow-y-auto sm:auto-rows-[140px]" : "auto-rows-fr"
              }`}
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {gridTiles.map((t) => (
                <ConferenceTile
                  key={t.key}
                  name={t.name}
                  subtitle={t.subtitle}
                  stream={t.stream}
                  isLocal={t.isLocal}
                  isScreen={t.isScreen}
                  videoEnabled={t.videoEnabled}
                  audioOn={t.audioOn}
                  raisedHand={t.raisedHand}
                  onToggleMic={t.isLocal ? sfu.toggleAudio : undefined}
                  onToggleCamera={t.isLocal && !isVoice ? sfu.toggleVideo : undefined}
                />
              ))}
            </div>
          )}

          {/* Floating reactions, same as the in-app conference overlay */}
          {reactions.length > 0 ? (
            <div className="pointer-events-none absolute bottom-4 right-6 flex flex-col items-end gap-1">
              {reactions.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <span className="animate-bounce text-2xl">{r.emoji}</span>
                  <span className="text-xs text-slate-300">{r.name}</span>
                </div>
              ))}
            </div>
          ) : null}
        </main>

        {/* Controls — same icon style as the in-app conference */}
        <footer className="relative flex h-[110px] shrink-0 items-start justify-center pt-1">
          <div className="flex items-start gap-5 sm:gap-8">
            <ControlButton
              icon={sfu.audioEnabled ? <Mic size={22} /> : <MicOff size={22} />}
              label={sfu.audioEnabled ? "Mute" : "Unmute"}
              active={sfu.audioEnabled}
              onClick={sfu.toggleAudio}
            />
            {!isVoice ? (
              <ControlButton
                icon={sfu.videoEnabled ? <Video size={22} /> : <VideoOff size={22} />}
                label={sfu.videoEnabled ? "Stop Video" : "Start Video"}
                active={sfu.videoEnabled}
                onClick={sfu.toggleVideo}
              />
            ) : null}
            <ControlButton
              icon={sfu.screenShareEnabled ? <Monitor size={21} /> : <MonitorOff size={21} />}
              label="Share"
              active={sfu.screenShareEnabled}
              onClick={() => void sfu.toggleScreenShare()}
            />
            <ControlButton
              icon={<Hand size={21} />}
              label={handRaised ? "Lower hand" : "Raise hand"}
              active={!handRaised}
              onClick={toggleRaiseHand}
            />
            <div className="group relative flex flex-col items-center">
              <ControlButton
                icon={<Smile size={21} />}
                label="Reactions"
                active={showReactions}
                onClick={() => setShowReactions((v) => !v)}
              />
              {showReactions ? (
                <div className="absolute bottom-full mb-3 flex gap-1 rounded-full border border-white/[0.08] bg-[#0d1c2c] p-2 shadow-2xl">
                  {["👍", "❤️", "😂", "🎉", "👏"].map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => sendReaction(emoji)}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-xl transition hover:bg-white/10"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <ControlButton
              icon={<Users size={21} />}
              label="Participants"
              active={showParticipants}
              onClick={() => setShowParticipants((v) => !v)}
            />
            <div className="mx-1 h-10 w-px bg-white/[0.08]" />
            <ControlButton
              icon={<PhoneOff size={21} />}
              label="Leave"
              danger
              onClick={onLeave}
            />
          </div>
          {sfu.error ? (
            <p className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-red-400">
              {sfu.error}
            </p>
          ) : null}
        </footer>

        {/* Participants panel */}
        {showParticipants ? (
          <aside className="absolute inset-y-0 right-0 z-20 flex w-72 flex-col border-l border-white/[0.08] bg-[#0b1523]/95 backdrop-blur-xl lg:w-[320px]">
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-4">
              <h2 className="text-sm font-semibold">Participants ({roster.length})</h2>
              <button
                onClick={() => setShowParticipants(false)}
                className="text-slate-400 transition hover:text-white"
                aria-label="Close participants"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-3">
              {roster.map((r) => (
                <div
                  key={r.key}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.04]"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#334675] text-sm font-semibold text-white">
                    {r.name.charAt(0).toUpperCase() || "?"}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">{r.name}</span>
                  {r.raisedHand ? (
                    <span className="text-amber-400">
                      <Hand size={15} />
                    </span>
                  ) : null}
                  <span className={r.audioOn ? "text-slate-300" : "text-red-400"}>
                    {r.audioOn ? <Mic size={15} /> : <MicOff size={15} />}
                  </span>
                  {!isVoice ? (
                    <span className={r.videoOn ? "text-slate-300" : "text-red-400"}>
                      {r.videoOn ? <Video size={15} /> : <VideoOff size={15} />}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </aside>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <form
        onSubmit={onJoin}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="text-2xl font-semibold text-slate-900">
          {info ? info.title : "Join meeting"}
        </h1>
        <p className="text-sm text-slate-500">
          {info?.scheduledAt
            ? `Scheduled for ${new Date(info.scheduledAt).toLocaleString()}`
            : "Enter your details to join as a guest."}
        </p>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address"
          className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
        />
        {info?.type !== "voice_room" && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={withVideo}
              onChange={(e) => setWithVideo(e.target.checked)}
            />
            Join with camera on
          </label>
        )}
        {joinError && <p className="text-sm text-red-600">{joinError}</p>}
        <button
          type="submit"
          disabled={joining || !info}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {joining ? "Joining..." : "Join meeting"}
        </button>
        <p className="text-center text-xs text-slate-500">
          Have the desktop app?{" "}
          <a
            href={`teamspace-one://join/${encodeURIComponent(token)}`}
            className="font-medium text-slate-900 hover:underline"
          >
            Open in Teamspace One
          </a>
        </p>
      </form>
    </div>
  );
}
