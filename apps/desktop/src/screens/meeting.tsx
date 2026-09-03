import { useState } from "react";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  Hand,
  MessageSquare,
  Users,
  PhoneOff,
  Settings,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";

const participants = [
  { id: "p1", name: "You", initials: "Y", video: false },
  { id: "p2", name: "Sarah Miller", initials: "S", video: true },
  { id: "p3", name: "James Wilson", initials: "J", video: true },
];

export function MeetingScreen() {
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(true);
  const [screen, setScreen] = useState(false);
  const [hand, setHand] = useState(false);

  return (
    <div className="flex h-full flex-col bg-surface">
      <header className="flex h-12 items-center justify-between border-b px-4">
        <div>
          <h1 className="text-sm font-semibold text-text">Engineering Standup</h1>
          <p className="text-xs text-text-muted">3 participants · Recording off</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">
            <Users className="mr-1.5 h-4 w-4" />
            Participants
          </Button>
          <Button variant="ghost" size="sm">
            <MessageSquare className="mr-1.5 h-4 w-4" />
            Chat
          </Button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center gap-4 p-6">
        {participants.map((p) => (
          <div
            key={p.id}
            className={cn(
              "flex aspect-video w-72 flex-col items-center justify-center rounded-lg border bg-surface-elevated",
              !p.video && "bg-primary-subtle",
            )}
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-2xl font-semibold text-primary">
              {p.initials}
            </div>
            <span className="mt-3 text-sm font-medium text-text">{p.name}</span>
          </div>
        ))}
      </div>

      <div className="flex h-16 items-center justify-between border-t px-6">
        <div className="text-xs text-text-muted">Connection quality: Excellent</div>
        <div className="flex items-center gap-2">
          <Button
            variant={mic ? "secondary" : "destructive"}
            size="icon"
            onClick={() => setMic((v) => !v)}
          >
            {mic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
          </Button>
          <Button
            variant={camera ? "secondary" : "destructive"}
            size="icon"
            onClick={() => setCamera((v) => !v)}
          >
            {camera ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
          </Button>
          <Button
            variant={screen ? "default" : "secondary"}
            size="icon"
            onClick={() => setScreen((v) => !v)}
          >
            <MonitorUp className="h-4 w-4" />
          </Button>
          <Button
            variant={hand ? "default" : "secondary"}
            size="icon"
            onClick={() => setHand((v) => !v)}
          >
            <Hand className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="destructive" size="sm">
          <PhoneOff className="mr-1.5 h-4 w-4" />
          Leave
        </Button>
      </div>
    </div>
  );
}
