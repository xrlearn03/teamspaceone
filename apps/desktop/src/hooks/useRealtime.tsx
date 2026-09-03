import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { getAccessToken, getActiveOrganisation } from "../lib/api";
import { currentUser } from "../lib/data";

const REALTIME_URL = (import.meta.env.VITE_REALTIME_URL as string | undefined) ?? "http://localhost:3005";

export interface RealtimeEventPayloads {
  "message.created": { id: string; channelId: string; content: string; senderId: string; createdAt: string };
  "message.updated": { id: string; channelId: string; content: string; editedAt: string };
  "message.deleted": { id: string; channelId: string };
  "notification.created": { id: string; title: string; body: string; userId: string };
  "meeting.created": { id: string; title: string; organisationId: string };
  "meeting.started": { id: string; roomName: string };
  "meeting.ended": { id: string };
  "meeting.participant.joined": { meetingId: string; userId: string; identity: string };
  "meeting.participant.left": { meetingId: string; userId: string };
  "meeting.screen.shared": { meetingId: string; userId: string; isScreenSharing: boolean };
  "voice.room.created": { id: string; title: string; workspaceId: string };
}

export type RealtimeEvent = keyof RealtimeEventPayloads;

interface RealtimeContextValue {
  socket: Socket | null;
  connected: boolean;
  joinRealtimeMeeting: (meetingId: string) => void;
  leaveRealtimeMeeting: (meetingId: string) => void;
  onRealtimeEvent: <E extends RealtimeEvent>(event: E, handler: (payload: RealtimeEventPayloads[E]) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const handlersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());

  useEffect(() => {
    void (async () => {
      try {
        const allowed = await isPermissionGranted();
        if (!allowed) {
          await requestPermission();
        }
      } catch {
        // Notifications not available in browser/dev environment.
      }
    })();

    async function connect() {
      const token = await getAccessToken();
      const organisationId = getActiveOrganisation();
      const userId = currentUser.id;

      const socket = io(`${REALTIME_URL}/realtime`, {
        transports: ["websocket", "polling"],
        auth: token ? { token } : undefined,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        setConnected(true);
        if (organisationId) {
          socket.emit("join-organisation", organisationId);
        }
        socket.emit("join-user", userId);
      });

      socket.on("disconnect", () => {
        setConnected(false);
      });

      socket.on("connect_error", (err) => {
        // eslint-disable-next-line no-console
        console.error("Realtime connection error:", err.message);
      });

      const eventNames: RealtimeEvent[] = [
        "message.created",
        "message.updated",
        "message.deleted",
        "notification.created",
        "meeting.created",
        "meeting.started",
        "meeting.ended",
        "meeting.participant.joined",
        "meeting.participant.left",
        "meeting.screen.shared",
        "voice.room.created",
      ];

      for (const event of eventNames) {
        socket.on(event, (payload: unknown) => {
          if (event === "notification.created") {
            const n = payload as RealtimeEventPayloads["notification.created"];
            try {
              void sendNotification({ title: n.title, body: n.body });
            } catch {
              // Ignore notification errors in browser/dev.
            }
          }
          const handlers = handlersRef.current.get(event);
          if (handlers) {
            handlers.forEach((h) => h(payload));
          }
        });
      }
    }

    void connect();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, []);

  const joinRealtimeMeeting = (meetingId: string) => {
    socketRef.current?.emit("join-meeting", meetingId);
  };

  const leaveRealtimeMeeting = (meetingId: string) => {
    socketRef.current?.emit("leave", `meeting:${meetingId}`);
  };

  const onRealtimeEvent = <E extends RealtimeEvent>(event: E, handler: (payload: RealtimeEventPayloads[E]) => void) => {
    const typedHandler = (payload: unknown) => handler(payload as RealtimeEventPayloads[E]);
    if (!handlersRef.current.has(event)) {
      handlersRef.current.set(event, new Set());
    }
    handlersRef.current.get(event)!.add(typedHandler);
    return () => {
      handlersRef.current.get(event)?.delete(typedHandler);
    };
  };

  return (
    <RealtimeContext.Provider
      value={{ socket: socketRef.current, connected, joinRealtimeMeeting, leaveRealtimeMeeting, onRealtimeEvent }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error("useRealtime must be used within RealtimeProvider");
  }
  return ctx;
}
