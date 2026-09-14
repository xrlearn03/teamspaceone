"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { getAccessToken, getActiveOrganisation, leaveMeeting, sendCallMessage } from "@/lib/api";
import type { Message, MessagePage, MessageReaction } from "@/lib/api";
import { useUIStore } from "@/stores/ui";
import { flushQueue, queuedMessageCount } from "@/lib/offline-queue";
import { SOUNDS, loopSound, playSound, playSoundOnce } from "@/lib/sounds";

const CALL_RING_TIMEOUT_MS = 30_000;

const REALTIME_URL = (process.env.NEXT_PUBLIC_REALTIME_URL as string | undefined) ?? "http://localhost:3005";

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
  "message.created": unknown;
  "message.updated": unknown;
  "message.deleted": { id: string; channelId: string; deletedAt: string };
  "notification.created": { id: string; title: string; body: string; userId: string; resourceType?: string | null; link?: string | null };
  "meeting.created": { id: string; title: string; organisationId: string };
  "meeting.started": { id: string; roomName: string };
  "meeting.ended": { id: string };
  "meeting.participant.joined": { meetingId: string; userId: string; identity: string };
  "meeting.participant.left": { meetingId: string; userId: string };
  "meeting.screen.shared": { meetingId: string; userId: string; isScreenSharing: boolean };
  "meeting.chat.created": { id: string; meetingId: string; userId: string; content: string; createdAt: string };
  "meeting.reaction.created": { id: string; meetingId: string; userId: string; emoji: string; createdAt: string };
  "meeting.raise_hand.changed": { id: string; meetingId: string; userId: string; raised: boolean };
  "meeting.recording.changed": { meetingId: string; isRecording: boolean; recordedBy?: string };
  "voice.room.created": { id: string; title: string; workspaceId: string };
  "call.incoming": { meetingId: string; kind: "audio" | "video"; title?: string; channelId?: string; callerId: string; callerName?: string; at: string };
  "call.ended": { meetingId: string; callerId: string };
  "call.response": { meetingId: string; userId: string; userName?: string; response: "accepted" | "declined" };
  "message.reaction.updated": { id: string; channelId: string; reactions: unknown[] };
  "typing": { userId: string; isTyping: boolean; room: string };
  "presence": { userId: string; status: string; room: string };
  "read-receipt": { userId: string; messageId: string; room: string; readAt: string };
}

export type RealtimeEvent = keyof RealtimeEventPayloads;

export interface OutgoingCall {
  meetingId: string;
  kind: "audio" | "video";
  title?: string;
  channelId?: string;
  userIds: string[];
}

export interface RealtimeContextValue {
  socket: null;
  connected: boolean;
  outgoingCall: OutgoingCall | null;
  joinRealtimeChannel: (channelId: string) => void;
  leaveRealtimeChannel: (channelId: string) => void;
  joinRealtimeProject: (projectId: string) => void;
  leaveRealtimeProject: (projectId: string) => void;
  joinRealtimeMeeting: (meetingId: string) => void;
  leaveRealtimeMeeting: (meetingId: string) => void;
  sendTyping: (channelId: string, isTyping: boolean) => void;
  sendPresence: (channelId: string, status: string) => void;
  sendReadReceipt: (channelId: string, messageId: string) => void;
  sendCallRing: (ring: { meetingId: string; kind: "audio" | "video"; title?: string; channelId?: string; callerName?: string; userIds: string[] }) => void;
  sendCallCancel: (meetingId: string) => void;
  sendCallResponse: (response: { meetingId: string; callerId: string; response: "accepted" | "declined"; userName?: string }) => void;
  onRealtimeEvent: <E extends RealtimeEvent>(event: E, handler: (payload: RealtimeEventPayloads[E]) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const noopValue: RealtimeContextValue = {
  socket: null,
  connected: false,
  outgoingCall: null,
  joinRealtimeChannel: () => {},
  leaveRealtimeChannel: () => {},
  joinRealtimeProject: () => {},
  leaveRealtimeProject: () => {},
  joinRealtimeMeeting: () => {},
  leaveRealtimeMeeting: () => {},
  sendTyping: () => {},
  sendPresence: () => {},
  sendReadReceipt: () => {},
  sendCallRing: () => {},
  sendCallCancel: () => {},
  sendCallResponse: () => {},
  onRealtimeEvent: () => () => {},
};

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [outgoingCall, setOutgoingCall] = useState<OutgoingCall | null>(null);
  const handlersRef = useRef<Map<string, Set<(payload: unknown) => void>>>(new Map());
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        if (typeof Notification !== "undefined" && Notification.permission !== "granted") {
          await Notification.requestPermission();
        }
      } catch {
        // Notifications not available in browser/dev environment.
      }
    })();

    async function connect() {
      const token = await getAccessToken();
      if (token) {
        try {
          const jwtPayload = JSON.parse(atob(token.split(".")[1] ?? "")) as { sub?: string } | undefined;
          userIdRef.current = jwtPayload?.sub ?? null;
        } catch {
          userIdRef.current = null;
        }
      }
      const socket = io(`${REALTIME_URL}/realtime`, {
        transports: ["websocket", "polling"],
        auth: token ? { token } : undefined,
      });

      socketRef.current = socket;

      socket.on("connect", () => {
        setConnected(true);
        useUIStore.getState().setConnection(navigator.onLine ? "connected" : "offline");
        const organisationId = getActiveOrganisation();
        if (organisationId) {
          socket.emit("join-organisation", organisationId);
        }
        socket.emit("join-user");
        // Flush anything queued while offline, then reflect the count.
        void (async () => {
          const pending = await queuedMessageCount();
          useUIStore.getState().setPendingCount(pending);
          if (pending > 0) {
            useUIStore.getState().setConnection("syncing");
            await flushQueue();
            useUIStore.getState().setConnection("connected");
            useUIStore.getState().setPendingCount(await queuedMessageCount());
            // Queued sends bypassed the mutation cache — refresh message lists.
            void queryClient.invalidateQueries({ queryKey: ["messages"] });
          }
        })();
      });

      socket.on("disconnect", () => {
        setConnected(false);
        useUIStore.getState().setConnection("offline");
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
        "meeting.chat.created",
        "meeting.reaction.created",
        "meeting.raise_hand.changed",
        "meeting.recording.changed",
        "voice.room.created",
        "call.incoming",
        "call.ended",
        "call.response",
        "message.reaction.updated",
        "typing",
        "presence",
        "read-receipt",
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
            if (message.senderId !== userIdRef.current) {
              playSound(SOUNDS.notification);
              const activeChannelId = useUIStore.getState().activeChannelId;
              if (activeChannelId !== message.channelId) {
                useUIStore.getState().addNotificationToast({
                  title: "New message",
                  body: message.content
                    ? message.content.length > 60
                      ? `${message.content.slice(0, 60)}…`
                      : message.content
                    : "Attachment",
                  resourceType: "channel",
                  link: `/channels/${message.channelId}/messages/${message.id}`,
                });
              }
            }
            if (!message.parentMessageId) {
              queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(["messages", message.channelId], (data) => {
                if (!data || data.pages.some((page) => page.items.some((item) => item.id === message.id))) return data;
                const pages = data.pages.slice();
                pages[0] = { ...pages[0], items: [...pages[0].items, message] };
                return { ...data, pages };
              });
            } else {
              queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(["thread", message.parentMessageId], (data) => {
                if (!data || data.pages.some((page) => page.items.some((item) => item.id === message.id))) return data;
                const pages = data.pages.slice();
                pages[0] = { ...pages[0], items: [...pages[0].items, message] };
                return { ...data, pages };
              });
              // Also update the parent message reply count if cached.
              void queryClient.invalidateQueries({ queryKey: ["messages", message.channelId], exact: true });
            }
          }
          if (event === "message.updated") {
            const message = payload as Message;
            queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(["messages", message.channelId], (data) =>
              data ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => (item.id === message.id ? message : item)) })) } : data,
            );
            if (message.parentMessageId) {
              queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(["thread", message.parentMessageId], (data) =>
                data ? { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map((item) => (item.id === message.id ? message : item)) })) } : data,
              );
            }
          }
          if (event === "message.deleted") {
            const deleted = payload as RealtimeEventPayloads["message.deleted"];
            queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(["messages", deleted.channelId], (data) =>
              data
                ? {
                    ...data,
                    pages: data.pages.map((page) => ({
                      ...page,
                      items: page.items.map((item) =>
                        item.id === deleted.id ? { ...item, content: "", deletedAt: deleted.deletedAt, attachments: [] as Message["attachments"] } : item,
                      ),
                    })),
                  }
                : data,
            );
            // Parent id is not included in delete payload, so invalidate all thread queries.
            void queryClient.invalidateQueries({ queryKey: ["thread"] });
          }
          if (event === "message.reaction.updated") {
            const update = payload as { id: string; channelId: string; reactions: MessageReaction[] };
            queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(["messages", update.channelId], (data) =>
              data
                ? {
                    ...data,
                    pages: data.pages.map((page) => ({
                      ...page,
                      items: page.items.map((item) => (item.id === update.id ? { ...item, reactions: update.reactions } : item)),
                    })),
                  }
                : data,
            );
            void queryClient.invalidateQueries({ queryKey: ["thread"] });
          }
          if (event === "notification.created") {
            const n = payload as RealtimeEventPayloads["notification.created"];
            playSound(SOUNDS.notification);
            try {
              if (typeof Notification !== "undefined" && Notification.permission === "granted") {
                new Notification(n.title, { body: n.body });
              }
            } catch {
              // Ignore notification errors in browser/dev.
            }
            useUIStore.getState().addNotificationToast({
              title: n.title,
              body: n.body,
              resourceType: n.resourceType,
              link: n.link,
            });
            void queryClient.invalidateQueries({ queryKey: ["notifications"] });
            void queryClient.invalidateQueries({ queryKey: ["unread-count"] });
          }
          if (event === "call.response") {
            const r = payload as RealtimeEventPayloads["call.response"];
            const outgoing = outgoingCallsRef.current.get(r.meetingId);
            if (outgoing) {
              if (r.response === "accepted") {
                clearTimeout(outgoing.timer);
                outgoing.stopRingback();
                outgoingCallsRef.current.delete(r.meetingId);
                setOutgoingCall((call) => (call?.meetingId === r.meetingId ? null : call));
              } else {
                outgoing.declined.add(r.userId);
                if (outgoing.declined.size >= outgoing.userIds.length) {
                  // Everyone declined (or the only callee declined) — stop ringing.
                  clearTimeout(outgoing.timer);
                  outgoing.stopRingback();
                  outgoingCallsRef.current.delete(r.meetingId);
                  setOutgoingCall((call) => (call?.meetingId === r.meetingId ? null : call));
                  dropOutgoingCall(r.meetingId, outgoing, "declined");
                }
              }
            }
          }
          if (event === "meeting.chat.created") {
            const message = payload as RealtimeEventPayloads["meeting.chat.created"];
            queryClient.setQueryData<InfiniteData<{ items: typeof message[]; nextCursor: string | null }, string | null>>(["meeting-messages", message.meetingId], (data) => {
              if (!data || data.pages.some((page) => page.items.some((item) => item.id === message.id))) return data;
              const pages = data.pages.slice();
              pages[0] = { ...pages[0], items: [...pages[0].items, message] };
              return { ...data, pages };
            });
          }
          if (event === "meeting.reaction.created") {
            const reaction = payload as RealtimeEventPayloads["meeting.reaction.created"];
            queryClient.setQueryData<RealtimeEventPayloads["meeting.reaction.created"][]>(["meeting-reactions", reaction.meetingId], (data) => {
              if (!data || data.some((item) => item.id === reaction.id)) return data;
              return [reaction, ...data];
            });
          }
          if (event === "meeting.raise_hand.changed") {
            const hand = payload as RealtimeEventPayloads["meeting.raise_hand.changed"];
            void queryClient.invalidateQueries({ queryKey: ["meeting-raise-hands", hand.meetingId] });
          }
          if (event === "meeting.recording.changed") {
            const recording = payload as RealtimeEventPayloads["meeting.recording.changed"];
            void queryClient.invalidateQueries({ queryKey: ["meetings"] });
            const handlers = handlersRef.current.get(event);
            if (handlers) handlers.forEach((h) => h(recording));
          }
          const handlers = handlersRef.current.get(event);
          if (handlers) {
            handlers.forEach((h) => h(payload));
          }
        });
      }

      socket.on("sync", (payload: unknown) => {
        const sync = payload as { tag?: string; resourceId?: string } | undefined;
        const tag = sync?.tag ?? "";
        const resourceId = sync?.resourceId;
        const organisationId = getActiveOrganisation() ?? "none";
        const domain = tag.split(".")[0] ?? tag;
        const keys: unknown[][] = [];
        switch (domain) {
          case "hrms":
            keys.push(["hrms"]);
            break;
          case "interview":
            keys.push(["interview"]);
            break;
          case "file":
            keys.push(["files", organisationId]);
            if (resourceId) keys.push(["file", resourceId]);
            break;
          case "user":
            keys.push(["me"], ["users"]);
            break;
          case "organisation":
            keys.push(
              ["organisations"],
              ["members", organisationId],
              ["invitations", organisationId],
              ["roles", organisationId],
              ["workspaces", organisationId],
              ["permissions", organisationId],
            );
            break;
          case "workspace":
            keys.push(["workspaces", organisationId]);
            break;
          case "client":
          case "guest":
            keys.push(["clients", organisationId]);
            break;
          case "ai":
            keys.push(["ai-pending-actions"]);
            break;
          default:
            keys.push([domain]);
        }
        for (const key of keys) {
          void queryClient.invalidateQueries({ queryKey: key, exact: false });
        }
      });
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

  const sendTyping = useCallback((channelId: string, isTyping: boolean) => {
    socketRef.current?.emit("typing", { room: `channel:${channelId}`, isTyping });
  }, []);

  const sendPresence = useCallback((channelId: string, status: string) => {
    socketRef.current?.emit("presence", { room: `channel:${channelId}`, status });
  }, []);

  const sendReadReceipt = useCallback((channelId: string, messageId: string) => {
    socketRef.current?.emit("message.read", { room: `channel:${channelId}`, messageId });
  }, []);

  interface OutgoingCallEntry {
    userIds: string[];
    declined: Set<string>;
    timer: ReturnType<typeof setTimeout>;
    stopRingback: () => void;
    channelId?: string;
    kind: "audio" | "video";
    title?: string;
  }

  const outgoingCallsRef = useRef<Map<string, OutgoingCallEntry>>(new Map());

  function postCallLog(meetingId: string, outgoing: OutgoingCallEntry, status: "missed" | "declined") {
    if (!outgoing.channelId) return;
    void sendCallMessage(outgoing.channelId, { meetingId, kind: outgoing.kind, status }).catch(() => {
      // Best-effort — the call log message is optional.
    });
  }

  function dropOutgoingCall(meetingId: string, outgoing: OutgoingCallEntry, status: "missed" | "declined" = "missed") {
    // Stop any still-ringing callees.
    socketRef.current?.emit("call.cancel", { meetingId, userIds: outgoing.userIds });
    // Record the unanswered call in the originating conversation.
    postCallLog(meetingId, outgoing, status);
    // Play one full hang-up cycle, then drop the caller out of the call.
    void playSoundOnce(SOUNDS.hangup).then(() => {
      void leaveMeeting(meetingId).catch(() => {
        // Best-effort — the callee never joined.
      });
      const ui = useUIStore.getState();
      if (ui.activeMeetingId === meetingId) {
        ui.setActiveView("home");
      }
    });
  }

  const sendCallRing = useCallback(
    (ring: {
      meetingId: string;
      kind: "audio" | "video";
      title?: string;
      channelId?: string;
      callerName?: string;
      userIds: string[];
    }) => {
      const existing = outgoingCallsRef.current.get(ring.meetingId);
      if (existing) {
        clearTimeout(existing.timer);
        existing.stopRingback();
      }
      const stopRingback = loopSound(SOUNDS.incomingCall);
      const timer = setTimeout(() => {
        // Nobody answered within the ring window — hang up the call.
        const outgoing = outgoingCallsRef.current.get(ring.meetingId);
        if (outgoing && outgoingCallsRef.current.delete(ring.meetingId)) {
          outgoing.stopRingback();
          setOutgoingCall((call) => (call?.meetingId === ring.meetingId ? null : call));
          dropOutgoingCall(ring.meetingId, outgoing);
        }
      }, CALL_RING_TIMEOUT_MS);
      outgoingCallsRef.current.set(ring.meetingId, {
        userIds: ring.userIds,
        declined: new Set(),
        timer,
        stopRingback,
        channelId: ring.channelId,
        kind: ring.kind,
        title: ring.title,
      });
      setOutgoingCall({ meetingId: ring.meetingId, kind: ring.kind, title: ring.title, channelId: ring.channelId, userIds: ring.userIds });
      socketRef.current?.emit("call.ring", ring);
    },
    [],
  );

  const sendCallCancel = useCallback((meetingId: string) => {
    const outgoing = outgoingCallsRef.current.get(meetingId);
    if (!outgoing) return;
    clearTimeout(outgoing.timer);
    outgoing.stopRingback();
    outgoingCallsRef.current.delete(meetingId);
    setOutgoingCall((call) => (call?.meetingId === meetingId ? null : call));
    socketRef.current?.emit("call.cancel", { meetingId, userIds: outgoing.userIds });
    // The caller hung up before anyone answered — log it as a missed call.
    postCallLog(meetingId, outgoing, "missed");
  }, []);

  const sendCallResponse = useCallback(
    (response: {
      meetingId: string;
      callerId: string;
      response: "accepted" | "declined";
      userName?: string;
    }) => {
      socketRef.current?.emit("call.response", response);
    },
    [],
  );

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
      value={{
        socket: null,
        connected,
        outgoingCall,
        joinRealtimeChannel,
        leaveRealtimeChannel,
        joinRealtimeProject,
        leaveRealtimeProject,
        joinRealtimeMeeting,
        leaveRealtimeMeeting,
        sendTyping,
        sendPresence,
        sendReadReceipt,
        sendCallRing,
        sendCallCancel,
        sendCallResponse,
        onRealtimeEvent,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const value = useContext(RealtimeContext);
  if (!value) {
    return noopValue;
  }
  return value;
}
