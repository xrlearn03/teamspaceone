import { useEffect, useRef, useState } from "react";
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

function RemoteVideo({ stream, name }: { stream: MediaStream; name: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  const hasVideo = stream.getVideoTracks().some((t) => t.enabled && t.readyState !== "ended");
  return (
    <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
      <video ref={ref} autoPlay playsInline className="h-full w-full object-cover" />
      {!hasVideo && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700 text-xl font-semibold text-white">
            {name.charAt(0).toUpperCase() || "?"}
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
        {name}
      </div>
    </div>
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
  const localVideoRef = useRef<HTMLVideoElement>(null);

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

  useEffect(() => {
    if (localVideoRef.current && sfu.localStream) {
      localVideoRef.current.srcObject = sfu.localStream;
    }
  }, [sfu.localStream, joined]);

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
    const nameOf = (participantId: string) =>
      sfu.participants.find((p) => p.id === participantId)?.displayName ?? "Participant";
    return (
      <div className="flex min-h-screen flex-col bg-slate-950 text-white">
        <header className="flex h-14 items-center justify-between border-b border-slate-800 px-4">
          <div>
            <span className="text-sm font-semibold">{joined.title}</span>
            <span className="ml-3 text-xs text-slate-400">
              {sfu.connected ? "connected" : "connecting..."} · {sfu.participants.length + 1}{" "}
              participant{sfu.participants.length === 0 ? "" : "s"}
            </span>
          </div>
          <button
            onClick={onLeave}
            className="rounded-full bg-red-600 px-4 py-1.5 text-sm font-medium hover:bg-red-500"
          >
            Leave
          </button>
        </header>
        <main className="relative flex-1 p-4">
          {sfu.remoteStreams.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-slate-400">
              Waiting for others to join...
            </div>
          ) : (
            <div className="mx-auto grid h-full max-w-6xl auto-rows-fr grid-cols-1 content-center gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sfu.remoteStreams.map(({ participantId, stream }) => (
                <RemoteVideo key={participantId} stream={stream} name={nameOf(participantId)} />
              ))}
            </div>
          )}
          {sfu.localStream && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-4 right-4 aspect-video w-48 rounded-xl border border-slate-700 bg-slate-900 object-cover"
            />
          )}
        </main>
        <footer className="flex h-16 items-center justify-center gap-3 border-t border-slate-800">
          <button
            onClick={sfu.toggleAudio}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              sfu.audioEnabled ? "bg-slate-800 hover:bg-slate-700" : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {sfu.audioEnabled ? "Mute" : "Unmute"}
          </button>
          {sfu.localStream?.getVideoTracks().length ? (
            <button
              onClick={sfu.toggleVideo}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                sfu.videoEnabled ? "bg-slate-800 hover:bg-slate-700" : "bg-red-600 hover:bg-red-500"
              }`}
            >
              {sfu.videoEnabled ? "Stop video" : "Start video"}
            </button>
          ) : null}
          {sfu.error ? <span className="text-xs text-red-400">{sfu.error}</span> : null}
        </footer>
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
