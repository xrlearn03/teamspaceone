import { useMemo, useState, useRef, useEffect } from "react";
import {
  Hand,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MoreHorizontal,
  NotebookPen,
  PhoneOff,
  Radio,
  Send,
  Smile,
  Users,
  Video,
  VideoOff,
  Loader2,
} from "lucide-react";
import { useLiveKit } from "../../hooks/useLiveKit";
import { VideoRenderer } from "./video-renderer";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  useCreateMeetingMessage,
  useCreateMeetingReaction,
  useMeeting,
  useMeetingMessages,
  useMeetingReactions,
  useMeetingRaiseHands,
  useUpdateMeetingRaiseHand,
  useSetMeetingRecording,
} from "../../hooks/api";
import { useRealtime } from "../../hooks/useRealtime";
import { cn } from "../../lib/utils";
import { Track, type Participant, type LocalTrack, type RemoteTrack } from "livekit-client";
import type { Meeting } from "../../lib/api";

const LIVEKIT_URL = (import.meta.env.VITE_LIVEKIT_URL as string | undefined) ?? "ws://localhost:7880";

function buildRtcConfig(): RTCConfiguration | undefined {
  const stun = (import.meta.env.VITE_STUN_SERVER_URL as string | undefined)?.trim();
  const turn = (import.meta.env.VITE_TURN_SERVER_URL as string | undefined)?.trim();
  const turnUser = (import.meta.env.VITE_TURN_USERNAME as string | undefined)?.trim();
  const turnCred = (import.meta.env.VITE_TURN_CREDENTIAL as string | undefined)?.trim();

  if (!stun && !turn) return undefined;

  const iceServers: RTCIceServer[] = [];
  if (stun) iceServers.push({ urls: stun });
  if (turn) {
    iceServers.push({
      urls: turn,
      username: turnUser,
      credential: turnCred,
    });
  }

  return { iceServers };
}

interface ParticipantTileData {
  participant: Participant | undefined;
  isLocal: boolean;
  screenTrack?: LocalTrack | RemoteTrack;
  isSpeaking: boolean;
}

interface LiveKitConferenceProps {
  meeting: Meeting;
  token: string;
  displayName?: string;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  audioInputId?: string;
  videoInputId?: string;
  audioOutputId?: string;
  onLeave: () => Promise<void>;
  onEnd?: () => Promise<void>;
  onScreenShare?: (enabled: boolean) => Promise<void>;
}

export function LiveKitConference({
  meeting,
  token,
  displayName,
  audioEnabled = true,
  videoEnabled = true,
  audioInputId,
  videoInputId,
  audioOutputId,
  onLeave,
  onEnd,
  onScreenShare,
}: LiveKitConferenceProps) {
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [floatingReaction, setFloatingReaction] = useState<string | null>(null);
  const [localRecording, setLocalRecording] = useState(meeting.isRecording ?? false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const { data: liveMeeting, refetch: refetchMeeting } = useMeeting(meeting.id);
  const { data: chatMessages, fetchNextPage, hasNextPage, isFetchingNextPage } = useMeetingMessages(meeting.id);
  const createMessage = useCreateMeetingMessage();
  const { data: reactions } = useMeetingReactions(meeting.id);
  const createReaction = useCreateMeetingReaction();
  const { data: raiseHandsData } = useMeetingRaiseHands(meeting.id);
  const updateRaiseHand = useUpdateMeetingRaiseHand();
  const setRecording = useSetMeetingRecording();
  const { onRealtimeEvent } = useRealtime();

  useEffect(() => {
    const unsubscribe = onRealtimeEvent("meeting.recording.changed", () => {
      void refetchMeeting();
    });
    return unsubscribe;
  }, [onRealtimeEvent, refetchMeeting]);

  useEffect(() => {
    setLocalRecording(liveMeeting?.isRecording ?? meeting.isRecording ?? false);
  }, [liveMeeting?.isRecording, meeting.isRecording]);

  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, chatOpen]);

  useEffect(() => {
    const last = reactions?.[0]?.emoji;
    if (last && last !== floatingReaction) {
      setFloatingReaction(last);
      const timer = setTimeout(() => setFloatingReaction(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [reactions, floatingReaction]);

  const {
    connectionState,
    error,
    remoteParticipants,
    localAudioEnabled,
    localVideoEnabled,
    localScreenShare,
    toggleMicrophone,
    toggleCamera,
    toggleScreenShare,
    leave,
    room,
  } = useLiveKit({
    url: LIVEKIT_URL,
    token,
    roomName: meeting.roomName,
    displayName,
    audioEnabled,
    videoEnabled,
    audioInputId,
    videoInputId,
    audioOutputId,
    rtcConfig: buildRtcConfig(),
  });

  const raisedUserIds = new Set(raiseHandsData?.map((h) => h.userId) ?? []);
  const localUserId = room?.localParticipant.identity.replace(/^user-/, "") ?? "";
  const handRaised = raisedUserIds.has(localUserId);

  async function handleLeave() {
    await leave();
    await onLeave();
  }

  async function handleEnd() {
    await onEnd?.();
    await handleLeave();
  }

  async function handleToggleScreenShare() {
    await toggleScreenShare();
    await onScreenShare?.(!localScreenShare);
  }

  function submitChat() {
    if (!chatDraft.trim()) return;
    createMessage.mutate({ meetingId: meeting.id, content: chatDraft.trim() });
    setChatDraft("");
  }

  function sendReaction(emoji: string) {
    createReaction.mutate({ meetingId: meeting.id, emoji });
    setFloatingReaction(emoji);
    setTimeout(() => setFloatingReaction(null), 2000);
  }

  function toggleRaiseHand() {
    updateRaiseHand.mutate({ meetingId: meeting.id, raised: !handRaised });
  }

  function toggleRecording() {
    const next = !localRecording;
    setRecording.mutate({ meetingId: meeting.id, recording: next });
    setLocalRecording(next);
  }

  const localParticipant = room?.localParticipant;

  const allParticipants: ParticipantTileData[] = useMemo(() => {
    const items: ParticipantTileData[] = [];
    if (localParticipant) {
      items.push({
        participant: localParticipant,
        isLocal: true,
        screenTrack: localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track as LocalTrack | RemoteTrack | undefined,
        isSpeaking: localParticipant.isSpeaking,
      });
    }
    for (const p of remoteParticipants) {
      items.push({
        participant: p,
        isLocal: false,
        screenTrack: p.getTrackPublication(Track.Source.ScreenShare)?.track as LocalTrack | RemoteTrack | undefined,
        isSpeaking: p.isSpeaking,
      });
    }
    return items;
  }, [localParticipant, remoteParticipants]);

  const activeScreenShare = allParticipants.find((p) => p.screenTrack);
  const sidePanelOpen = chatOpen || notesOpen || participantsOpen;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-text-secondary">
        <p className="text-sm text-error">{error.message}</p>
        <Button variant="secondary" onClick={() => void handleLeave()}>
          Go back
        </Button>
      </div>
    );
  }

  if (connectionState !== "connected") {
    return (
      <div className="flex h-full flex-col items-center justify-center text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="mt-2 text-sm">{connectionState === "connecting" ? "Connecting..." : connectionState}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <div>
          <h1 className="text-sm font-semibold text-text">{meeting.title}</h1>
          <p className="text-xs text-text-muted">
            {connectionState} · {allParticipants.length} participants
            {localRecording && (
              <span className="ml-2 inline-flex items-center gap-1 text-error">
                <Radio className="h-3 w-3" /> Recording
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={chatOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={() => { setChatOpen((o) => !o); setNotesOpen(false); setParticipantsOpen(false); }}
            aria-label="Toggle chat"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          <Button
            variant={notesOpen ? "secondary" : "ghost"}
            size="icon"
            onClick={() => { setNotesOpen((o) => !o); setChatOpen(false); setParticipantsOpen(false); }}
            aria-label="Toggle meeting notes"
          >
            <NotebookPen className="h-4 w-4" />
          </Button>
          <Button
            variant={participantsOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={() => { setParticipantsOpen((open) => !open); setChatOpen(false); setNotesOpen(false); }}
          >
            <Users className="mr-1.5 h-4 w-4" />
            {allParticipants.length}
          </Button>
          {onEnd && (
            <Button variant="destructive" size="sm" onClick={() => void handleEnd()}>
              End
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {activeScreenShare ? (
            <div className="flex flex-1 flex-col gap-4 p-4">
              <div className="relative flex-1 overflow-hidden rounded-lg border bg-black">
                {activeScreenShare.screenTrack && (
                  <VideoRenderer track={activeScreenShare.screenTrack} className="h-full w-full object-contain" />
                )}
                <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                  {activeScreenShare.participant?.name ?? "Screen"} is presenting
                </span>
              </div>
              <div className="flex h-24 shrink-0 gap-2 overflow-x-auto">
                {allParticipants.map((p) => (
                  <ParticipantTile
                    key={p.participant?.identity ?? "local"}
                    data={p}
                    compact
                    handRaised={p.participant?.identity ? raisedUserIds.has(p.participant.identity.replace(/^user-/, "")) : false}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-6 md:grid-cols-2 lg:grid-cols-3">
              {allParticipants.map((p) => (
                <ParticipantTile
                  key={p.participant?.identity ?? "local"}
                  data={p}
                  handRaised={p.participant?.identity ? raisedUserIds.has(p.participant.identity.replace(/^user-/, "")) : false}
                />
              ))}
            </div>
          )}

          <div className="flex h-16 shrink-0 items-center justify-between border-t px-4">
            <div className="flex items-center gap-2">
              <Button
                variant={localAudioEnabled ? "secondary" : "destructive"}
                size="icon"
                onClick={() => void toggleMicrophone()}
                aria-label={localAudioEnabled ? "Mute" : "Unmute"}
              >
                {localAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
              </Button>
              <Button
                variant={localVideoEnabled ? "secondary" : "destructive"}
                size="icon"
                onClick={() => void toggleCamera()}
                aria-label={localVideoEnabled ? "Turn camera off" : "Turn camera on"}
              >
                {localVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </Button>
              <Button
                variant={localScreenShare ? "default" : "secondary"}
                size="icon"
                onClick={() => void handleToggleScreenShare()}
                aria-label="Share screen"
              >
                <MonitorUp className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative flex items-center gap-2">
              {floatingReaction && (
                <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-2xl">{floatingReaction}</span>
              )}
              <Button
                variant={handRaised ? "default" : "secondary"}
                size="icon"
                onClick={() => toggleRaiseHand()}
                aria-label={handRaised ? "Lower hand" : "Raise hand"}
              >
                <Hand className="h-4 w-4" />
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="icon" aria-label="Send reaction">
                    <Smile className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {["👍", "❤️", "😂", "🎉", "🤔", "👏"].map((emoji) => (
                    <DropdownMenuItem key={emoji} onClick={() => sendReaction(emoji)}>
                      <span className="text-lg">{emoji}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant={localRecording ? "destructive" : "secondary"}
                size="icon"
                onClick={() => toggleRecording()}
                aria-label={localRecording ? "Stop recording" : "Start recording"}
              >
                <Radio className="h-4 w-4" />
              </Button>

              <Button variant="ghost" size="icon" aria-label="More options">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>

            <Button variant="destructive" size="sm" onClick={() => void handleLeave()}>
              <PhoneOff className="mr-1.5 h-4 w-4" />
              Leave
            </Button>
          </div>
        </div>

        {sidePanelOpen ? (
          <aside className="w-72 shrink-0 border-l bg-surface p-3">
            {chatOpen ? (
              <div className="flex h-full flex-col">
                <h2 className="mb-3 text-sm font-semibold">Meeting chat</h2>
                <div className="flex-1 space-y-2 overflow-y-auto rounded-md border bg-background/50 p-3">
                  {hasNextPage ? (
                    <div className="text-center">
                      <Button variant="ghost" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                        {isFetchingNextPage ? "Loading…" : "Load older"}
                      </Button>
                    </div>
                  ) : null}
                  {chatMessages?.length === 0 ? (
                    <p className="text-xs text-text-muted">No messages yet.</p>
                  ) : (
                    chatMessages?.map((message) => (
                      <div key={message.id} className={cn("text-sm", message.userId === localUserId && "text-right")}>
                        <span className="text-[10px] text-text-muted">{message.userId.slice(0, 8)}</span>
                        <p className="rounded-md bg-surface-elevated px-2 py-1 text-text">{message.content}</p>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitChat(); } }}
                    placeholder="Type a message..."
                    className="h-8 text-sm"
                  />
                  <Button size="icon" className="h-8 w-8" onClick={submitChat} disabled={!chatDraft.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : notesOpen ? (
              <div className="flex h-full flex-col">
                <h2 className="mb-3 text-sm font-semibold">Meeting notes</h2>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  className="flex-1 w-full resize-none rounded-md border bg-background/50 p-3 text-sm outline-none focus-visible:border-primary"
                  placeholder="Take notes during the meeting..."
                />
              </div>
            ) : (
              <>
                <h2 className="mb-3 text-sm font-semibold">Participants ({allParticipants.length})</h2>
                <div className="space-y-2">
                  {allParticipants.map(({ participant, isLocal, isSpeaking, screenTrack }) => (
                    <div
                      key={participant?.identity ?? "local-list"}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-elevated",
                        isSpeaking && "ring-1 ring-primary",
                      )}
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle text-xs font-medium text-primary">
                        {(participant?.name ?? "U").charAt(0).toUpperCase()}
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {participant?.name ?? "You"}{isLocal ? " (You)" : ""}
                      </span>
                      {screenTrack && <MonitorUp className="h-3 w-3 text-text-muted" />}
                      {participant?.identity && raisedUserIds.has(participant.identity.replace(/^user-/, "")) && <Hand className="h-3 w-3 text-warning" />}
                    </div>
                  ))}
                </div>
              </>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ParticipantTile({ data, compact, handRaised }: { data: ParticipantTileData; compact?: boolean; handRaised?: boolean }) {
  const { participant, isLocal, isSpeaking } = data;
  const videoTrack = participant?.getTrackPublication(Track.Source.Camera)?.track as LocalTrack | RemoteTrack | undefined;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-lg border bg-surface-elevated",
        compact ? "aspect-video h-full w-36 shrink-0" : "aspect-video w-full",
        isSpeaking && "ring-2 ring-primary",
      )}
    >
      {videoTrack ? (
        <VideoRenderer track={videoTrack} className="h-full w-full object-cover" />
      ) : (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-2xl font-semibold text-primary">
            {(participant?.name ?? "U").charAt(0).toUpperCase()}
          </div>
          <span className="mt-3 text-sm font-medium text-text">
            {participant?.name ?? "You"} {isLocal && "(You)"}
          </span>
        </>
      )}
      {handRaised && (
        <span className="absolute right-2 top-2 rounded bg-warning/90 px-1.5 py-0.5 text-[10px] text-white">
          <Hand className="h-3 w-3" />
        </span>
      )}
      {isSpeaking && (
        <span className="absolute bottom-2 left-2 rounded bg-primary/80 px-1.5 py-0.5 text-[10px] text-white">
          Speaking
        </span>
      )}
    </div>
  );
}
