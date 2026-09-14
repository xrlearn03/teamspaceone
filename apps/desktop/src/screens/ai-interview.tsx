import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gauge,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Mic,
  MicOff,
  Phone,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Video,
  VideoOff,
  Volume2,
  Waves,
} from "lucide-react";
import { useShallow } from "zustand/shallow";
import { Button } from "@teamspace-one/ui/button";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import { useUIStore } from "../stores/ui";
import { useSfu } from "../hooks/useSfu";
import { useLiveTranscription } from "../hooks/useLiveTranscription";
import { useNativeMicrophone } from "../hooks/useNativeMicrophone";
import { usePermissions } from "../hooks/usePermissions";
import {
  useAiTranscript,
  useApplicationScreening,
  useCandidates,
  useEvaluateAiInterview,
  useInterviewSessions,
  useMe,
  useSessionEvaluations,
  useSubmitAiAnswer,
} from "../hooks/api";
import { joinAiInterview, startAiInterview } from "../lib/api";
import { cn, getUserDisplayName } from "../lib/utils";
import type { InterviewEvaluation } from "../lib/api";
import { EvaluationReviewForm } from "../components/interview/ai-interview-dialog";

/* =========================================================
   TYPES
========================================================= */

type LiveLine = { time: string; text: string; speaker?: string };

/* =========================================================
   AI AVATAR
========================================================= */

function AIAvatar() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900">
      <div className="absolute inset-0 opacity-60">
        <div className="absolute left-[8%] top-[18%] h-[35%] w-[20%] rounded-full bg-indigo-300/10 blur-3xl" />
        <div className="absolute right-[10%] top-[15%] h-[40%] w-[25%] rounded-full bg-blue-400/10 blur-3xl" />
      </div>
      <div className="absolute left-0 top-0 h-full w-[24%] bg-slate-950/30" />
      <div className="absolute left-[6%] top-[24%] h-[4px] w-[22%] bg-orange-200/60 shadow-[0_0_25px_rgba(255,200,120,.7)]" />
      <div className="absolute bottom-[18%] left-[8%] h-[70px] w-[55px] rounded-t-full bg-emerald-950/70 blur-[1px]" />
      <div className="absolute left-1/2 top-[48%] h-[78%] w-[47%] -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-[6%] h-[45%] w-[58%] -translate-x-1/2 rounded-[50%] bg-gradient-to-br from-[#2d211f] via-[#171413] to-[#0c0b0b]" />
        <div className="absolute left-1/2 top-[12%] h-[37%] w-[42%] -translate-x-1/2 rounded-[48%_48%_44%_44%] bg-gradient-to-b from-[#f5c8ae] to-[#d99578] shadow-xl">
          <div className="absolute left-[27%] top-[43%] h-[5px] w-[7px] rounded-full bg-slate-800" />
          <div className="absolute right-[27%] top-[43%] h-[5px] w-[7px] rounded-full bg-slate-800" />
          <div className="absolute left-1/2 top-[45%] h-[18px] w-[7px] -translate-x-1/2 rounded-full border-b border-[#c07f68]" />
          <div className="absolute left-1/2 top-[67%] h-[9px] w-[24px] -translate-x-1/2 rounded-b-full border-b-2 border-[#a74f50]" />
        </div>
        <div className="absolute left-1/2 top-[43%] h-[15%] w-[17%] -translate-x-1/2 bg-[#d99578]" />
        <div className="absolute bottom-0 left-1/2 h-[53%] w-[85%] -translate-x-1/2 rounded-t-[35%] bg-gradient-to-br from-slate-800 to-slate-950" />
        <div className="absolute bottom-[3%] left-1/2 h-[44%] w-[29%] -translate-x-1/2 bg-slate-100" />
        <div className="absolute bottom-[4%] left-[25%] h-[38%] w-[18%] rotate-[18deg] bg-slate-900" />
        <div className="absolute bottom-[4%] right-[25%] h-[38%] w-[18%] -rotate-[18deg] bg-slate-900" />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-slate-950/80 to-transparent" />
    </div>
  );
}

/* =========================================================
   CANDIDATE VIDEO — real remote SFU stream, avatar fallback
========================================================= */

function CandidateVideo({
  stream,
  name,
  hasAudio,
  waiting,
}: {
  stream: MediaStream | null;
  name: string;
  hasAudio: boolean;
  waiting: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = Boolean(stream?.getVideoTracks().some((t) => t.enabled && t.readyState !== "ended"));

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, hasVideo]);

  return (
    <div className="relative h-full overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700">
      {hasVideo && stream ? (
        <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
      ) : (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_25%,rgba(255,255,255,.15),transparent_25%),linear-gradient(135deg,#111827,#263238)]" />
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-700 text-xl font-bold text-white">
              {name
                .split(" ")
                .map((p) => p[0])
                .join("")
                .slice(0, 2)
                .toUpperCase() || "?"}
            </div>
            {waiting && (
              <span className="text-[10px] text-white/60">Waiting for candidate…</span>
            )}
          </div>
        </>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/90 to-transparent px-4 pb-4 pt-12">
        <div className="text-[14px] font-bold text-white">{name}</div>
        <div className="mt-0.5 text-[10px] text-white/80">Candidate</div>
      </div>

      <div
        className={cn(
          "absolute bottom-4 right-4 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950/60 backdrop-blur",
          hasAudio ? "text-emerald-400" : "text-white/40",
        )}
      >
        <BarChart3 size={16} />
      </div>
    </div>
  );
}

/* =========================================================
   WAVEFORM — animates while remote audio is live
========================================================= */

function AudioWaveform({ live, label }: { live: boolean; label: string }) {
  const bars = [12, 22, 15, 35, 28, 48, 30, 56, 40, 65, 45, 34, 52, 25, 44, 20, 30, 18, 36, 24, 14];
  return (
    <div className="relative flex h-full items-center justify-center overflow-hidden rounded-xl bg-[#071525]">
      <style>{`@keyframes ai-wave{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}`}</style>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(80,100,255,.22),transparent_55%)]" />
      <div className="relative flex items-center gap-[3px]">
        {bars.map((height, index) => (
          <span
            key={index}
            className="w-[4px] rounded-full bg-gradient-to-t from-blue-500 via-violet-500 to-fuchsia-400 shadow-[0_0_10px_rgba(99,102,241,.5)]"
            style={{
              height: `${height}px`,
              transformOrigin: "center",
              animation: live ? `ai-wave ${0.6 + (index % 5) * 0.15}s ease-in-out infinite` : undefined,
            }}
          />
        ))}
      </div>
      <div className="absolute bottom-5 left-0 right-0 flex items-center justify-center gap-2 text-[10px] text-white/80">
        <Volume2 size={15} />
        {label}
      </div>
    </div>
  );
}

/* =========================================================
   LIVE ANALYSIS — real evaluation axes once generated
========================================================= */

const ANALYSIS_AXES = [
  { key: "technicalScore", name: "Technical", icon: <Gauge size={17} />, color: "bg-blue-500" },
  { key: "communicationScore", name: "Communication", icon: <Waves size={17} />, color: "bg-violet-500" },
  { key: "problemSolvingScore", name: "Problem solving", icon: <CheckCircle2 size={17} />, color: "bg-emerald-500" },
  { key: "cultureFitScore", name: "Culture fit", icon: <Sparkles size={17} />, color: "bg-orange-400" },
  { key: "overallScore", name: "Overall", icon: <Clock3 size={17} />, color: "bg-pink-500" },
] as const;

function LiveAnalysis({
  evaluation,
  live,
  canRefresh,
  refreshing,
  onRefresh,
}: {
  evaluation: InterviewEvaluation | null;
  live: boolean;
  canRefresh: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold text-slate-900">Live Analysis</h2>
        <div className="flex items-center gap-2">
          {canRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              title="Re-run AI evaluation on the current transcript"
              className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            >
              <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            </button>
          )}
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[8px] font-bold",
              live ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                live ? "animate-pulse bg-emerald-500" : "bg-slate-400",
              )}
            />
            {live ? "Live" : "Off"}
          </span>
        </div>
      </div>
      <div className="mt-5 space-y-4">
        {ANALYSIS_AXES.map((metric) => {
          const value = evaluation?.[metric.key];
          return (
            <div key={metric.name} className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                {metric.icon}
              </div>
              <div className="w-[86px] text-[10px] text-slate-600">{metric.name}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cn("h-full rounded-full transition-all", metric.color)}
                  style={{ width: `${value ?? 0}%` }}
                />
              </div>
              <span className="w-8 text-right text-[10px] font-bold text-slate-700">
                {value === undefined || value === null ? "—" : `${Math.round(value)}%`}
              </span>
            </div>
          );
        })}
      </div>
      {!evaluation && (
        <p className="mt-4 text-[9px] leading-4 text-slate-400">
          Scores appear after the AI evaluation runs — it runs automatically when the
          interview ends, or use the refresh button once answers exist.
        </p>
      )}
    </section>
  );
}

/* =========================================================
   AI NOTES — real transcript lines + submitted answers
========================================================= */

function AINotes({ lines, live }: { lines: LiveLine[]; live: boolean }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold">AI Notes</h2>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[8px] font-bold",
            live ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              live ? "animate-pulse bg-emerald-500" : "bg-slate-400",
            )}
          />
          {live ? "Live" : "Off"}
        </span>
      </div>
      <div className="relative mt-5">
        {lines.length > 0 && (
          <div className="absolute bottom-2 left-[7px] top-2 w-px bg-emerald-100" />
        )}
        <div className="max-h-56 space-y-4 overflow-y-auto">
          {lines.length === 0 ? (
            <p className="text-[10px] text-slate-400">
              Transcript lines and captured answers will appear here as the interview
              progresses.
            </p>
          ) : (
            lines.map((note, i) => (
              <div key={i} className="relative flex gap-3">
                <div className="relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white bg-emerald-500" />
                <div className="flex min-w-0 gap-3">
                  <span className="shrink-0 text-[9px] font-semibold text-slate-400">
                    {note.time}
                  </span>
                  <p className="text-[10px] leading-5 text-slate-600">
                    {note.speaker ? <span className="font-semibold">{note.speaker}: </span> : null}
                    {note.text}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   CANDIDATE OVERVIEW
========================================================= */

function CandidateOverview({
  name,
  jobTitle,
  email,
  phone,
  location,
  skills,
}: {
  name: string;
  jobTitle?: string;
  email?: string;
  phone?: string | null;
  location?: string | null;
  skills: string[];
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-bold">Candidate Overview</h2>
      </div>
      <div className="mt-5 flex items-center gap-3">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100 text-lg font-bold text-indigo-600">
          {name
            .split(" ")
            .map((p) => p[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "?"}
        </div>
        <div>
          <div className="text-[13px] font-bold">{name}</div>
          <div className="mt-1 text-[10px] text-slate-500">{jobTitle ?? "Candidate"}</div>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {email && <InfoRow icon={<Mail size={14} />} text={email} />}
        {phone && <InfoRow icon={<Phone size={14} />} text={phone} />}
        {location && <InfoRow icon={<MapPin size={14} />} text={location} />}
      </div>
      {skills.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {skills.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-blue-50 px-2.5 py-1.5 text-[8px] font-semibold text-indigo-600"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function InfoRow({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 text-[9px] text-slate-600">
      <span className="text-indigo-500">{icon}</span>
      {text}
    </div>
  );
}

/* =========================================================
   TABS
========================================================= */

function InterviewTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}) {
  const tabs = ["Conversation", "Evaluation", "Skills Assessment", "Summary"];
  return (
    <div className="flex overflow-x-auto border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={cn(
            "relative whitespace-nowrap px-5 py-3 text-[10px] font-medium",
            activeTab === tab ? "font-bold text-indigo-600" : "text-slate-500",
          )}
        >
          {tab}
          {activeTab === tab && (
            <span className="absolute bottom-[-1px] left-2 right-2 h-0.5 bg-indigo-600" />
          )}
        </button>
      ))}
    </div>
  );
}

function EvaluationCard({
  title,
  score,
  description,
}: {
  title: string;
  score: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-slate-600">{title}</span>
        <span className="text-[14px] font-bold text-indigo-600">{score}</span>
      </div>
      <p className="mt-2 text-[9px] leading-5 text-slate-500">{description}</p>
    </div>
  );
}

/* =========================================================
   MAIN
========================================================= */

export function AiInterviewScreen() {
  const { sessionId, setActiveView } = useUIStore(
    useShallow((s) => ({
      sessionId: s.activeInterviewSessionId,
      setActiveView: s.setActiveView,
    })),
  );

  const { data: user } = useMe();
  const { can } = usePermissions();
  const displayName = getUserDisplayName(user, "Interviewer");

  const { data: sessions } = useInterviewSessions();
  const session = useMemo(
    () => sessions?.find((s) => s.id === sessionId),
    [sessions, sessionId],
  );
  const { data: candidates } = useCandidates();
  const candidate = useMemo(
    () => candidates?.find((c) => c.id === session?.candidateId),
    [candidates, session],
  );
  const application = useMemo(
    () =>
      candidate?.applications?.find(
        (a) => a.jobOpeningId && a.jobOpeningId === session?.jobOpeningId,
      ),
    [candidate, session],
  );
  const { data: screening } = useApplicationScreening(application?.id);

  const { data: transcript, refetch: refetchTranscript } = useAiTranscript(sessionId ?? undefined);
  const { data: evaluations, refetch: refetchEvaluations } = useSessionEvaluations(
    sessionId ?? undefined,
  );
  const evaluation = useMemo(
    () => evaluations?.find((e) => e.source === "ai") ?? evaluations?.[0] ?? null,
    [evaluations],
  );

  const submitAnswer = useSubmitAiAnswer();
  const evaluate = useEvaluateAiInterview();

  const sfu = useSfu();
  const sfuRef = useRef(sfu);
  sfuRef.current = sfu;

  // Tauri webview has no getUserMedia — capture comes from the native mic.
  const {
    audioStream: nativeAudioStream,
    error: nativeAudioError,
    resumeContext: resumeNativeAudio,
  } = useNativeMicrophone();

  const [phase, setPhase] = useState<"connecting" | "live" | "ended">("connecting");
  const [error, setError] = useState<string | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [activeTab, setActiveTab] = useState("Conversation");
  const [answerDraft, setAnswerDraft] = useState("");
  const [liveLines, setLiveLines] = useState<LiveLine[]>([]);

  const startedRef = useRef(false);
  const joinInfoRef = useRef<{ roomId: string; userId: string; token: string } | null>(null);
  const joinedRef = useRef(false);
  const [micWaitDone, setMicWaitDone] = useState(false);

  const formatElapsed = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  /* -----------------------------------------------
     Start + join: generate questions (ai_voice),
     create the SFU room, then join once the native
     mic stream is ready (or unavailable — watch-only).
  ----------------------------------------------- */
  useEffect(() => {
    if (!sessionId || !session || startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    (async () => {
      try {
        if (session.status !== "in_progress") {
          await startAiInterview(sessionId, { interviewType: "ai_voice" });
          await refetchTranscript();
        }
        try {
          joinInfoRef.current = await joinAiInterview(sessionId);
        } catch (err) {
          // e.g. session already in progress as ai_text — keep the panel in
          // text mode; the Q/A + evaluation flow still works.
          if (!cancelled) {
            setVoiceError(err instanceof Error ? err.message : "Voice join failed");
          }
        }
        if (!cancelled) setPhase("live");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start the interview");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session]);

  // Give the native mic a few seconds to start, then join anyway (watch-only).
  useEffect(() => {
    if (micWaitDone) return;
    const timer = window.setTimeout(() => setMicWaitDone(true), 4000);
    return () => window.clearTimeout(timer);
  }, [micWaitDone]);

  // Join the SFU room once we have the token and the native mic stream (or a
  // mic failure — join anyway to watch/listen).
  useEffect(() => {
    const info = joinInfoRef.current;
    if (!info || joinedRef.current) return;
    if (!nativeAudioStream && !nativeAudioError && !micWaitDone) return;
    joinedRef.current = true;
    void (async () => {
      await resumeNativeAudio();
      try {
        await sfuRef.current.join(
          info.roomId,
          displayName,
          {
            audioEnabled: Boolean(nativeAudioStream),
            videoEnabled: false,
            stream: nativeAudioStream ?? undefined,
          },
          info.userId,
          info.token,
        );
      } catch (err) {
        setVoiceError(err instanceof Error ? err.message : "Voice join failed");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nativeAudioStream, nativeAudioError, micWaitDone]);

  // Leave the SFU room when the screen unmounts.
  useEffect(() => {
    return () => {
      void sfuRef.current.leave();
    };
  }, []);

  useEffect(() => {
    if (phase !== "live") return;
    const interval = window.setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  const onCommitted = useCallback(
    (lines: { text: string; speaker?: string }[]) => {
      setLiveLines((prev) => [
        ...prev,
        ...lines.map((l) => ({ time: formatElapsed(elapsed), text: l.text, speaker: l.speaker })),
      ]);
    },
    [elapsed],
  );

  const transcription = useLiveTranscription({
    meetingId: sessionId ?? undefined,
    stream: sfu.localStream,
    speaker: displayName,
    enabled: sfu.connected,
    onCommitted,
  });

  /* -----------------------------------------------
     Derived state
  ----------------------------------------------- */
  const answers = transcript ?? [];
  const currentIndex = answers.findIndex((a) => a.answer === null || a.answer.length === 0);
  const currentQuestion = currentIndex >= 0 ? answers[currentIndex] : null;
  const answered = answers.filter((a) => a.answer);
  const allAnswered = answers.length > 0 && currentIndex === -1;

  const candidateParticipant = sfu.participants.find((p) => p.userId === session?.candidateId);
  const remoteParticipant = candidateParticipant ?? sfu.participants.find((p) => p.userId !== user?.id);
  const candidateStream =
    sfu.remoteStreams.find((s) => s.participantId === remoteParticipant?.id)?.stream ??
    sfu.remoteStreams[0]?.stream ??
    null;
  const candidateAudioLive = Boolean(
    candidateStream?.getAudioTracks().some((t) => t.enabled && !t.muted && t.readyState !== "ended"),
  );

  const candidateName = session?.candidate?.name ?? candidate?.name ?? "Candidate";
  const jobTitle = session?.jobOpening?.title;
  const skills = screening?.skillsFound ?? [];

  async function runEvaluation() {
    try {
      await evaluate.mutateAsync(sessionId!);
      await refetchEvaluations();
    } catch {
      // surface via evaluate.error in the UI
    }
  }

  async function handleSubmitAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || currentIndex < 0 || !answerDraft.trim()) return;
    const text = answerDraft.trim();
    setAnswerDraft("");
    try {
      const res = await submitAnswer.mutateAsync({
        sessionId,
        questionIndex: currentIndex,
        answer: text,
      });
      setLiveLines((prev) => [
        ...prev,
        { time: formatElapsed(elapsed), text: `Answer captured: ${text}` },
      ]);
      await refetchTranscript();
      if (res.done) {
        setActiveTab("Evaluation");
      }
    } catch {
      setAnswerDraft(text);
    }
  }

  async function handleEnd() {
    setPhase("ended");
    await sfuRef.current.leave();
    if (answered.length > 0) {
      await runEvaluation();
    }
  }

  function goToEvaluations() {
    setActiveView("interview", { interviewTab: "evaluations" });
  }

  /* -----------------------------------------------
     Render guards
  ----------------------------------------------- */
  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={Bot}
          title="No interview session selected"
          description="Open a session from the Interviews screen to start an AI interview."
          action={
            <Button variant="secondary" size="sm" onClick={() => setActiveView("interview", { interviewTab: "sessions" })}>
              Back to interviews
            </Button>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={AlertTriangle}
          title="Could not start the interview"
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={() => setActiveView("interview", { interviewTab: "sessions" })}>
              Back to interviews
            </Button>
          }
        />
      </div>
    );
  }

  if (!session || phase === "connecting") {
    return (
      <div className="mx-auto max-w-[1500px] space-y-4 px-4 py-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[460px] w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  /* -----------------------------------------------
     Render
  ----------------------------------------------- */
  return (
    <main className="min-h-full bg-[#fbfcff] text-slate-900">
      <div className="mx-auto max-w-[1500px] px-4 py-3">
        {/* BREADCRUMB */}
        <div className="flex items-center gap-2 text-[9px] font-medium text-slate-500">
          <button
            className="hover:text-slate-700"
            onClick={() => setActiveView("interview", { interviewTab: "sessions" })}
          >
            Interviews
          </button>
          <ChevronRight size={12} />
          <span>AI Interview</span>
          <ChevronRight size={12} />
          <span className="font-semibold text-slate-700">
            Interview with {candidateName}
          </span>
        </div>

        {/* HEADER */}
        <header className="mt-2 flex items-start justify-between">
          <div>
            <h1 className="text-[30px] font-bold tracking-tight text-slate-900">
              AI Interview Panel
            </h1>
            <p className="mt-0.5 text-[14px] text-slate-500">
              Real conversations. Smarter hiring.
            </p>
          </div>
          <button
            onClick={handleEnd}
            disabled={phase === "ended"}
            className={cn(
              "mt-2 flex h-10 items-center gap-2 rounded-lg px-4 text-[10px] font-bold",
              phase === "ended"
                ? "cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-red-50 text-red-600 hover:bg-red-100",
            )}
          >
            <Square size={14} />
            {phase === "ended" ? "Interview Ended" : "End Interview"}
          </button>
        </header>

        {/* MAIN TWO-COLUMN */}
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          {/* LEFT */}
          <section className="min-w-0">
            {/* VIDEO AREA */}
            <div className="grid h-[460px] gap-3 lg:grid-cols-[minmax(0,2.2fr)_285px]">
              {/* AI interviewer */}
              <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm">
                <AIAvatar />

                <div className="absolute left-4 top-4 flex items-center gap-2 rounded-lg bg-slate-950/80 px-3 py-2 backdrop-blur">
                  <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-500">
                    <Sparkles size={14} className="text-white" />
                  </div>
                  <div>
                    <div className="text-[9px] text-white/60">AI Interviewer</div>
                    <div className="text-[11px] font-semibold text-white">Ava</div>
                  </div>
                </div>

                <div className="absolute right-4 top-4 flex items-center gap-2 rounded-lg bg-slate-950/70 px-3 py-2 text-[9px] text-white backdrop-blur">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      phase === "live" ? "animate-pulse bg-red-500" : "bg-slate-500",
                    )}
                  />
                  {formatElapsed(elapsed)}
                </div>

                {/* Current question as Ava's speech */}
                <div className="absolute bottom-[66px] left-1/2 w-[70%] -translate-x-1/2 rounded-xl bg-slate-950/80 px-4 py-3 text-center text-[11px] leading-5 text-white backdrop-blur">
                  {currentQuestion
                    ? currentQuestion.question
                    : allAnswered
                      ? "All questions answered — you can end the interview or refresh the analysis."
                      : "Preparing questions…"}
                </div>

                {/* Controls */}
                <div className="absolute bottom-0 left-0 right-0 flex h-[62px] items-center justify-center gap-3 bg-slate-950/80 backdrop-blur">
                  <button
                    onClick={sfu.toggleAudio}
                    title={sfu.localAudioEnabled ? "Mute" : "Unmute"}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full",
                      sfu.localAudioEnabled ? "bg-slate-700 text-white" : "bg-red-500 text-white",
                    )}
                  >
                    {sfu.localAudioEnabled ? <Mic size={17} /> : <MicOff size={17} />}
                  </button>
                  <button
                    onClick={() => void sfu.toggleVideo()}
                    title={sfu.localVideoEnabled ? "Turn camera off" : "Turn camera on"}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full",
                      sfu.localVideoEnabled ? "bg-slate-700 text-white" : "bg-red-500 text-white",
                    )}
                  >
                    {sfu.localVideoEnabled ? <Video size={17} /> : <VideoOff size={17} />}
                  </button>
                  <button
                    onClick={() => setActiveTab("Conversation")}
                    title="Conversation"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-white"
                  >
                    <MessageSquare size={17} />
                  </button>
                  <button
                    onClick={handleEnd}
                    title="End interview"
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500 text-white shadow-lg"
                  >
                    <Phone size={17} className="rotate-[135deg]" />
                  </button>
                </div>
              </div>

              {/* candidate + waveform */}
              <div className="grid min-h-0 grid-rows-[1fr_1fr] gap-3">
                <CandidateVideo
                  stream={candidateStream}
                  name={candidateName}
                  hasAudio={candidateAudioLive}
                  waiting={!remoteParticipant}
                />
                <AudioWaveform
                  live={candidateAudioLive}
                  label={candidateAudioLive ? "Listening…" : "Waiting for audio…"}
                />
              </div>
            </div>

            {/* TABS */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white px-2">
              <InterviewTabs activeTab={activeTab} setActiveTab={setActiveTab} />

              <div className="px-2">
                {activeTab === "Conversation" && (
                  <div className="mt-1 space-y-5 py-4">
                    {answers.map((a, i) => (
                      <div key={i} className="space-y-2">
                        <div className="flex gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-violet-100">
                            <Bot size={18} className="text-indigo-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold text-slate-800">Ava</span>
                              <span className="text-[9px] text-slate-400">Q{i + 1}</span>
                            </div>
                            <div className="mt-1 max-w-[92%] rounded-xl bg-slate-50 px-3 py-2.5 text-[10px] leading-5 text-slate-600">
                              {a.question}
                            </div>
                          </div>
                        </div>
                        {a.answer && (
                          <div className="ml-auto flex max-w-[92%] gap-3 pl-12">
                            <div className="min-w-0 flex-1 rounded-xl bg-indigo-50 px-3 py-2.5 text-[10px] leading-5 text-indigo-900">
                              {a.answer}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {liveLines.length > 0 && (
                      <div className="space-y-2 border-t border-slate-100 pt-3">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                          Live transcription
                        </p>
                        {liveLines.map((l, i) => (
                          <p key={i} className="text-[10px] leading-5 text-slate-600">
                            <span className="font-semibold text-slate-500">[{l.time}] </span>
                            {l.speaker ? <span className="font-semibold">{l.speaker}: </span> : null}
                            {l.text}
                          </p>
                        ))}
                        {transcription.partial && (
                          <p className="text-[10px] italic leading-5 text-slate-400">
                            {transcription.partial}…
                          </p>
                        )}
                      </div>
                    )}

                    {answers.length === 0 && liveLines.length === 0 && (
                      <p className="py-4 text-center text-[10px] text-slate-400">
                        The conversation will appear here.
                      </p>
                    )}
                  </div>
                )}

                {activeTab === "Evaluation" && (
                  <div className="py-5">
                    {evaluation ? (
                      <>
                        <div className="grid gap-3 md:grid-cols-2">
                          <EvaluationCard
                            title="Technical Knowledge"
                            score={`${Math.round(evaluation.technicalScore ?? 0)} / 100`}
                            description="Technical depth and correctness inferred from the transcript."
                          />
                          <EvaluationCard
                            title="Communication"
                            score={`${Math.round(evaluation.communicationScore ?? 0)} / 100`}
                            description="Clarity and structure of the candidate's responses."
                          />
                          <EvaluationCard
                            title="Problem Solving"
                            score={`${Math.round(evaluation.problemSolvingScore ?? 0)} / 100`}
                            description="Structured thinking and ownership."
                          />
                          <EvaluationCard
                            title="Overall Fit"
                            score={`${Math.round(evaluation.overallScore ?? 0)} / 100`}
                            description={evaluation.recommendation ?? "Pending recommendation."}
                          />
                        </div>
                        {can("interview.interview.edit-evaluation") && (
                          <EvaluationReviewForm evaluation={evaluation} />
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-3 py-6 text-center">
                        <Sparkles size={20} className="text-indigo-400" />
                        <p className="text-[10px] text-slate-500">
                          {answered.length > 0
                            ? "Run the AI evaluation on the captured answers."
                            : "Evaluation becomes available once answers are captured."}
                        </p>
                        {answered.length > 0 && can("interview.interview.evaluate") && (
                          <Button size="sm" onClick={runEvaluation} disabled={evaluate.isPending}>
                            {evaluate.isPending ? (
                              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="mr-1 h-3.5 w-3.5" />
                            )}
                            Generate AI evaluation
                          </Button>
                        )}
                        {evaluate.isError && (
                          <p className="text-[10px] text-red-500">
                            {evaluate.error instanceof Error ? evaluate.error.message : "Evaluation failed"}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === "Skills Assessment" && (
                  <div className="space-y-4 py-5">
                    {skills.length > 0 || screening?.missingRequirements?.length ? (
                      <>
                        {skills.length > 0 && (
                          <div>
                            <p className="mb-2 text-[10px] font-semibold text-slate-600">
                              Skills detected in screening
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {skills.map((s) => (
                                <span
                                  key={s}
                                  className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-[8px] font-semibold text-emerald-700"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {screening?.missingRequirements?.length ? (
                          <div>
                            <p className="mb-2 text-[10px] font-semibold text-slate-600">
                              Missing requirements
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {screening.missingRequirements.map((s) => (
                                <span
                                  key={s}
                                  className="rounded-md bg-orange-50 px-2.5 py-1.5 text-[8px] font-semibold text-orange-700"
                                >
                                  {s}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {typeof screening?.matchScore === "number" && (
                          <div>
                            <div className="mb-2 flex justify-between text-[10px]">
                              <span className="font-semibold">Resume match</span>
                              <span className="text-slate-500">
                                {Math.round(screening.matchScore)}%
                              </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-indigo-600"
                                style={{ width: `${Math.round(screening.matchScore)}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="py-4 text-center text-[10px] text-slate-400">
                        Run resume screening on the candidate's application to see skills here.
                      </p>
                    )}
                  </div>
                )}

                {activeTab === "Summary" && (
                  <div className="py-5">
                    <div className="rounded-xl bg-indigo-50/70 p-5">
                      <div className="flex items-center gap-2">
                        <Sparkles size={17} className="text-indigo-600" />
                        <h3 className="text-[13px] font-bold">AI Interview Summary</h3>
                      </div>
                      <p className="mt-3 text-[10px] leading-6 text-slate-600">
                        {evaluation?.comments ??
                          "The summary appears after the AI evaluation runs."}
                      </p>
                      {evaluation?.recommendation && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[8px] font-bold capitalize text-emerald-700">
                            {evaluation.recommendation.replace(/_/g, " ")}
                          </span>
                        </div>
                      )}
                      {evaluation?.aiMetadata?.suggestedFollowUps?.length ? (
                        <div className="mt-4">
                          <p className="text-[10px] font-semibold text-slate-600">
                            Suggested follow-ups
                          </p>
                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] text-slate-600">
                            {evaluation.aiMetadata.suggestedFollowUps.map((q, i) => (
                              <li key={i}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>

              {/* ANSWER INPUT */}
              <div className="border-t border-slate-100 py-3">
                <form
                  onSubmit={handleSubmitAnswer}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4"
                >
                  <input
                    value={answerDraft}
                    onChange={(e) => setAnswerDraft(e.target.value)}
                    placeholder={
                      currentQuestion
                        ? `Capture the answer to Q${currentIndex + 1}…`
                        : "All questions answered"
                    }
                    disabled={currentIndex < 0 || phase !== "live"}
                    className="h-12 flex-1 bg-transparent text-[10px] outline-none placeholder:text-slate-400 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!answerDraft.trim() || currentIndex < 0 || submitAnswer.isPending}
                    className="flex h-8 w-8 items-center justify-center text-indigo-600 disabled:opacity-40"
                  >
                    {submitAnswer.isPending ? (
                      <Loader2 size={17} className="animate-spin" />
                    ) : (
                      <Send size={17} />
                    )}
                  </button>
                </form>
              </div>
            </div>

            {voiceError && (
              <p className="mt-3 flex items-center gap-2 text-[10px] text-amber-600">
                <AlertTriangle size={12} />
                Voice channel unavailable ({voiceError}) — continuing in text mode.
              </p>
            )}
            {sfu.error && !voiceError && (
              <p className="mt-3 flex items-center gap-2 text-[10px] text-amber-600">
                <AlertTriangle size={12} />
                {sfu.error}
              </p>
            )}
          </section>

          {/* RIGHT SIDEBAR */}
          <aside className="space-y-4">
            <LiveAnalysis
              evaluation={evaluation}
              live={phase === "live"}
              canRefresh={answered.length > 0 && can("interview.interview.evaluate")}
              refreshing={evaluate.isPending}
              onRefresh={runEvaluation}
            />
            <AINotes lines={liveLines} live={phase === "live"} />
            <CandidateOverview
              name={candidateName}
              jobTitle={jobTitle}
              email={candidate?.email ?? session?.candidate?.email}
              phone={candidate?.phone}
              location={candidate?.location}
              skills={skills}
            />
          </aside>
        </div>
      </div>

      {/* END INTERVIEW MODAL */}
      {phase === "ended" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
              <Square size={22} />
            </div>
            <h2 className="mt-4 text-[18px] font-bold">Interview Ended</h2>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">
              {evaluate.isPending
                ? "Running the AI evaluation on the captured transcript…"
                : "The AI analysis and interview transcript have been saved."}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[8px] text-slate-400">Duration</div>
                <div className="mt-1 text-[14px] font-bold">{formatElapsed(elapsed)}</div>
              </div>
              <div className="rounded-xl bg-emerald-50 p-3">
                <div className="text-[8px] text-emerald-600">AI Score</div>
                <div className="mt-1 text-[14px] font-bold text-emerald-700">
                  {evaluation?.overallScore != null
                    ? `${Math.round(evaluation.overallScore)} / 100`
                    : "—"}
                </div>
              </div>
            </div>
            <button
              onClick={goToEvaluations}
              className="mt-5 h-10 w-full rounded-lg bg-indigo-600 text-[10px] font-bold text-white"
            >
              Continue to Evaluation
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
