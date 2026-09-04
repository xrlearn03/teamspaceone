import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { getAccessToken, getActiveOrganisation, type Message, type MessagePage } from "../lib/api";

const REALTIME_URL = (import.meta.env.VITE_REALTIME_URL as string | undefined) ?? "http://localhost:3005";

export interface RealtimeEventPayloads {
  "project.created": { id: string };
  "project.updated": { id: string };
  "project.deleted": { id: string };
  "task.created": { id: string; projectId: string };
  "task.updated": { id: string; projectId: string; deleted?: boolean };
  "task.completed": { id: string; projectId: string };
  "project.comment.created": { id: string; projectId: string };
  "project.comment.updated": { id: string; projectId: string };
  "project.comment.deleted": { id: string; projectId: string };
  "project.attachment.added": { id: string; projectId: string };
  "project.attachment.removed": { id: string; projectId: string };
  "approval.created": { approvalId: string; projectId?: string };
  "approval.approved": { approvalId: string; projectId?: string };
  "approval.rejected": { approvalId: string; projectId?: string };
  "channel.created": { id: string };
  "channel.updated": { id: string };
  "channel.deleted": { id: string };
  "channel.members_updated": { id: string };
  "message.created": Message;
  "message.updated": Message;
  "message.deleted": { id: string; channelId: string; deletedAt: string };
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
  joinRealtimeChannel: (channelId: string) => void;
  leaveRealtimeChannel: (channelId: string) => void;
  joinRealtimeProject: (projectId: string) => void;
  leaveRealtimeProject: (projectId: string) => void;
  joinRealtimeMeeting: (meetingId: string) => void;
  leaveRealtimeMeeting: (meetingId: string) => void;
  onRealtimeEvent: <E extends RealtimeEvent>(event: E, handler: (payload: RealtimeEventPayloads[E]) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
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
        socket.emit("join-user");
      });

      socket.on("disconnect", () => {
        setConnected(false);
      });

      socket.on("connect_error", (err) => {
        // eslint-disable-next-line no-console
        console.error("Realtime connection error:", err.message);
      });

      const eventNames: RealtimeEvent[] = [
        "project.created",
        "project.updated",
        "project.deleted",
        "task.created",
        "task.updated",
        "task.completed",
        "project.comment.created",
        "project.comment.updated",
        "project.comment.deleted",
        "project.attachment.added",
        "project.attachment.removed",
        "approval.created",
        "approval.approved",
        "approval.rejected",
        "channel.created",
        "channel.updated",
        "channel.deleted",
        "channel.members_updated",
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
          if (event.startsWith("project.") || event.startsWith("task.") || event.startsWith("approval.")) {
            const resource = payload as { projectId?: string };
            if (event === "project.created" || event === "project.updated" || event === "project.deleted") {
              void queryClient.invalidateQueries({ queryKey: ["projects"] });
            }
            if (resource.projectId) {
              if (event.startsWith("task.")) void queryClient.invalidateQueries({ queryKey: ["tasks", resource.projectId] });
              if (event.startsWith("project.comment.")) void queryClient.invalidateQueries({ queryKey: ["project-comments", resource.projectId] });
              if (event.startsWith("project.attachment.")) void queryClient.invalidateQueries({ queryKey: ["project-attachments", resource.projectId] });
              if (event.startsWith("approval.")) void queryClient.invalidateQueries({ queryKey: ["approvals", resource.projectId] });
              void queryClient.invalidateQueries({ queryKey: ["project-activity", resource.projectId] });
            }
          }
          if (event.startsWith("channel.")) {
            void queryClient.invalidateQueries({ queryKey: ["channels"] });
          }
          if (event === "message.created") {
            const message = payload as Message;
            queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(["messages", message.channelId], (data) => {
              if (!data || data.pages.some((page) => page.items.some((item) => item.id === message.id))) return data;
              const pages = data.pages.slice();
              pages[0] = { ...pages[0], items: [...pages[0].items, message] };
              return { ...data, pages };
            });
          }
          if (event === "message.updated") {
            const message = payload as Message;
            queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(["messages", message.channelId], (data) =>
              data ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => item.id === message.id ? message : item) })) } : data,
            );
          }
          if (event === "message.deleted") {
            const deleted = payload as RealtimeEventPayloads["message.deleted"];
            queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(["messages", deleted.channelId], (data) =>
              data ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => item.id === deleted.id ? { ...item, content: "", deletedAt: deleted.deletedAt, attachments: [] } : item) })) } : data,
            );
          }
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
  }, [queryClient]);

  const joinRealtimeChannel = useCallback((channelId: string) => {
    socketRef.current?.emit("join", channelId);
  }, []);

  const leaveRealtimeChannel = useCallback((channelId: string) => {
    socketRef.current?.emit("leave", `channel:${channelId}`);
  }, []);

  const joinRealtimeProject = useCallback((projectId: string) => {
    socketRef.current?.emit("join-project", projectId);
  }, []);

  const leaveRealtimeProject = useCallback((projectId: string) => {
    socketRef.current?.emit("leave", `project:${projectId}`);
  }, []);

  const joinRealtimeMeeting = useCallback((meetingId: string) => {
    socketRef.current?.emit("join-meeting", meetingId);
  }, []);

  const leaveRealtimeMeeting = useCallback((meetingId: string) => {
    socketRef.current?.emit("leave", `meeting:${meetingId}`);
  }, []);

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
      value={{ socket: socketRef.current, connected, joinRealtimeChannel, leaveRealtimeChannel, joinRealtimeProject, leaveRealtimeProject, joinRealtimeMeeting, leaveRealtimeMeeting, onRealtimeEvent }}
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
