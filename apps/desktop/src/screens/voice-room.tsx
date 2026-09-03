import { Mic, MicOff, Settings, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { voiceRooms } from "../lib/data";
import { cn } from "../lib/utils";

const participants = [
  { id: "u1", name: "Alex", speaking: true },
  { id: "u2", name: "Sarah", speaking: false },
  { id: "u3", name: "James", speaking: false },
  { id: "u4", name: "Emily", speaking: true },
];

export function VoiceRoomScreen() {
  const [muted, setMuted] = useState(false);
  const room = voiceRooms[0];

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <Mic className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-text">{room.name}</h1>
            <p className="text-xs text-text-muted">{participants.length} active</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon">
            <Users className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <div className="grid grid-cols-4 gap-4">
          {participants.map((p) => (
            <Card
              key={p.id}
              className={cn(
                "flex w-28 flex-col items-center gap-2 p-4 transition-shadow",
                p.speaking && "ring-2 ring-primary/40",
              )}
            >
              <Avatar className="h-12 w-12">
                <AvatarFallback className="text-sm">{p.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-text">{p.name}</span>
              {p.speaking && <span className="h-1.5 w-1.5 rounded-full bg-online" />}
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant={muted ? "destructive" : "secondary"}
            size="icon"
            onClick={() => setMuted((v) => !v)}
          >
            {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button variant={muted ? "default" : "secondary"}>
            {muted ? "Join room" : "Leave room"}
          </Button>
        </div>

        <p className="text-xs text-text-muted">Push-to-talk: hold Space</p>
      </div>
    </div>
  );
}
