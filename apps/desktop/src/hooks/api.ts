import { useCallback, useEffect } from "react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import * as api from "../lib/api";
import { enqueueMessage, queuedMessageCount } from "../lib/offline-queue";
import { useUIStore } from "../stores/ui";
import { useRealtime } from "./useRealtime";
import { getActiveOrganisation, setActiveOrganisation } from "../lib/api";

function orgId() {
  return getActiveOrganisation() ?? "none";
}

export function useActiveOrganisation() {
  const id = getActiveOrganisation();
  return { id, set: setActiveOrganisation };
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useUsers(ids?: string[]) {
  const enabled = Boolean(ids && ids.length > 0);
  return useQuery({
    queryKey: ["users", ids ? [...ids].sort() : []],
    queryFn: () => api.getUsers(ids),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.updateProfile, onSuccess: (user) => { client.setQueryData(["me"], user); client.invalidateQueries({ queryKey: ["users"] }); } });
}

export function useChangePassword() {
  return useMutation({ mutationFn: (args: { currentPassword: string; newPassword: string }) => api.changePassword(args.currentPassword, args.newPassword) });
}

export function useOrganisations() {
  return useQuery({
    queryKey: ["organisations"],
    queryFn: api.getOrganisations,
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useCreateOrganisation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createOrganisation(name),
    onSuccess: () => client.invalidateQueries({ queryKey: ["organisations"] }),
  });
}

export function useWorkspaces(organisationId?: string) {
  return useQuery({
    queryKey: ["workspaces", organisationId],
    queryFn: () => api.getWorkspaces(organisationId as string),
    enabled: Boolean(organisationId),
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useMembers(organisationId?: string) {
  return useQuery({
    queryKey: ["members", organisationId],
    queryFn: () => api.getMembers(organisationId as string),
    enabled: Boolean(organisationId),
    staleTime: 60 * 1000,
  });
}

export function useRoles(organisationId?: string) {
  return useQuery({ queryKey: ["roles", organisationId], queryFn: () => api.getRoles(organisationId as string), enabled: Boolean(organisationId) });
}

export function useCreateWorkspace() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId?: string | null; name: string }) => api.createWorkspace(args.organisationId ?? null, args.name),
    onSuccess: (_, args) => {
      client.invalidateQueries({ queryKey: ["organisations"] });
      client.invalidateQueries({ queryKey: ["workspaces", args.organisationId ?? getActiveOrganisation() ?? "none"] });
    },
  });
}

export function useInvitations(organisationId?: string) {
  return useQuery({ queryKey: ["invitations", organisationId], queryFn: () => api.getInvitations(organisationId as string), enabled: Boolean(organisationId) });
}

export function useCreateInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; email: string; roleId: string }) => api.createInvitation(args.organisationId, args.email, args.roleId),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["invitations", args.organisationId] }),
  });
}

export function useRevokeInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; invitationId: string }) => api.revokeInvitation(args.organisationId, args.invitationId),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["invitations", args.organisationId] }),
  });
}

export function useAcceptInvitation() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.acceptInvitation, onSuccess: () => client.invalidateQueries({ queryKey: ["organisations"] }) });
}

export function useClients(organisationId?: string) {
  return useQuery({ queryKey: ["clients", organisationId], queryFn: () => api.getClients(organisationId as string), enabled: Boolean(organisationId) });
}

export function useCreateClient() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (args: { organisationId: string; name: string; email?: string }) => api.createClient(args.organisationId, { name: args.name, email: args.email }), onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["clients", args.organisationId] }) });
}

export function useUpdateClient() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (args: { organisationId: string; clientId: string; body: Parameters<typeof api.updateClient>[2] }) => api.updateClient(args.organisationId, args.clientId, args.body), onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["clients", args.organisationId] }) });
}

export function useDeleteClient() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (args: { organisationId: string; clientId: string }) => api.deleteClient(args.organisationId, args.clientId), onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["clients", args.organisationId] }) });
}

export function useChannels() {
  return useQuery({
    queryKey: ["channels", orgId()],
    queryFn: api.getChannels,
    enabled: getActiveOrganisation() !== null,
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useCreateChannel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { name: string; workspaceId?: string; type?: string; memberIds?: string[] }) =>
      api.createChannel(args.name, args.workspaceId, args.type, args.memberIds),
    onSuccess: () => client.invalidateQueries({ queryKey: ["channels", orgId()] }),
  });
}

export function useCreateDirectChannel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createDirectChannel,
    onSuccess: () => client.invalidateQueries({ queryKey: ["channels", orgId()] }),
  });
}

export function useUpdateChannel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { channelId: string; body: { name?: string; type?: "public" | "private" } }) =>
      api.updateChannel(args.channelId, args.body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["channels", orgId()] }),
  });
}

export function useReplaceChannelMembers() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { channelId: string; memberIds: string[] }) => api.replaceChannelMembers(args.channelId, args.memberIds),
    onSuccess: () => client.invalidateQueries({ queryKey: ["channels", orgId()] }),
  });
}

export function useDeleteChannel() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteChannel,
    onSuccess: () => client.invalidateQueries({ queryKey: ["channels", orgId()] }),
  });
}

export function useMessages(channelId?: string) {
  const { joinRealtimeChannel, leaveRealtimeChannel, connected } = useRealtime();
  useEffect(() => {
    if (!channelId || !connected) return;
    joinRealtimeChannel(channelId);
    return () => leaveRealtimeChannel(channelId);
  }, [channelId, connected, joinRealtimeChannel, leaveRealtimeChannel]);

  return useInfiniteQuery({
    queryKey: ["messages", channelId],
    queryFn: ({ pageParam }) => api.getMessages(channelId as string, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => data.pages.slice().reverse().flatMap((page) => page.items),
    enabled: Boolean(channelId),
    staleTime: 10 * 1000,
    retry: 2,
  });
}

export function useThreadMessages(parentMessageId?: string) {
  return useInfiniteQuery({
    queryKey: ["thread", parentMessageId],
    queryFn: ({ pageParam }) => api.getThreadMessages(parentMessageId as string, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => data.pages.slice().reverse().flatMap((page) => page.items),
    enabled: Boolean(parentMessageId),
    staleTime: 10 * 1000,
    retry: 2,
  });
}

export function useSendMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { channelId: string; content: string; attachmentIds?: string[]; parentMessageId?: string }) =>
      api.sendMessage(args.channelId, args.content, args.attachmentIds, args.parentMessageId),
    onSuccess: (message, args) => {
      client.invalidateQueries({ queryKey: ["messages", args.channelId] });
      if (args.parentMessageId) {
        client.invalidateQueries({ queryKey: ["thread", args.parentMessageId] });
      } else if (message.parentMessageId) {
        client.invalidateQueries({ queryKey: ["thread", message.parentMessageId] });
      }
    },
  });
}

export function useUpdateMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { messageId: string; channelId: string; content: string }) =>
      api.updateMessage(args.messageId, args.content),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["messages", args.channelId] }),
  });
}

export function useToggleReaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { messageId: string; channelId: string; emoji: string }) =>
      api.toggleMessageReaction(args.messageId, args.emoji),
    onSuccess: (result) => {
      client.setQueryData<InfiniteData<api.MessagePage, string | null>>(["messages", result.channelId], (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.map((item) => (item.id === result.id ? { ...item, reactions: result.reactions } : item)),
              })),
            }
          : data,
      );
      void client.invalidateQueries({ queryKey: ["thread"] });
    },
  });
}

/**
 * Offline-aware message send. When offline, the message is persisted to the
 * local outbox (SQLite via Tauri, localStorage in dev) and inserted into the
 * message cache as a pending item. The realtime provider flushes the queue on
 * reconnect.
 */
export function useSendMessageOrQueue() {
  const client = useQueryClient();
  const send = useSendMessage();

  const sendOrQueue = useCallback(
    async (args: { channelId: string; content: string; attachmentIds?: string[]; parentMessageId?: string; senderId?: string }) => {
      if (navigator.onLine) {
        send.mutate(args);
        return;
      }
      await enqueueMessage({
        channelId: args.channelId,
        content: args.content,
        attachmentIds: args.attachmentIds,
        parentMessageId: args.parentMessageId,
      });
      const pending: api.Message = {
        id: `local-${crypto.randomUUID()}`,
        channelId: args.channelId,
        senderId: args.senderId ?? "me",
        parentMessageId: args.parentMessageId ?? null,
        content: args.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attachments: [],
        pending: true,
      };
      const key = args.parentMessageId ? ["thread", args.parentMessageId] : ["messages", args.channelId];
      client.setQueryData<InfiniteData<api.MessagePage, string | null>>(key, (data) => {
        if (!data) return data;
        const pages = data.pages.slice();
        pages[0] = { ...pages[0], items: [...pages[0].items, pending] };
        return { ...data, pages };
      });
      useUIStore.getState().setPendingCount(await queuedMessageCount());
      useUIStore.getState().setConnection("offline");
    },
    [client, send],
  );

  return { sendOrQueue, isPending: send.isPending };
}

export function useDeleteMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { messageId: string; channelId: string }) => api.deleteMessage(args.messageId),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["messages", args.channelId] }),
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects", orgId()],
    queryFn: api.getProjects,
    enabled: getActiveOrganisation() !== null,
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useCreateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: () => client.invalidateQueries({ queryKey: ["projects", orgId()] }),
  });
}

export function useUpdateProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { projectId: string; body: Parameters<typeof api.updateProject>[1] }) => api.updateProject(args.projectId, args.body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["projects", orgId()] }),
  });
}

export function useDeleteProject() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteProject,
    onSuccess: () => client.invalidateQueries({ queryKey: ["projects", orgId()] }),
  });
}

export function useTasks(projectId?: string) {
  const { connected, joinRealtimeProject, leaveRealtimeProject } = useRealtime();
  useEffect(() => {
    if (!projectId || !connected) return;
    joinRealtimeProject(projectId);
    return () => leaveRealtimeProject(projectId);
  }, [connected, joinRealtimeProject, leaveRealtimeProject, projectId]);
  return useQuery({ queryKey: ["tasks", projectId], queryFn: () => api.getTasks(projectId as string), enabled: Boolean(projectId), staleTime: 60 * 1000, retry: 2 });
}

export function useCreateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createTask,
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["tasks", args.projectId] }),
  });
}

export function useUpdateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { taskId: string; projectId: string; body: Parameters<typeof api.updateTask>[1] }) => api.updateTask(args.taskId, args.body),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["tasks", args.projectId] }),
  });
}

export function useDeleteTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { taskId: string; projectId: string }) => api.deleteTask(args.taskId),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["tasks", args.projectId] }),
  });
}

export function useProjectComments(projectId?: string) {
  return useInfiniteQuery({
    queryKey: ["project-comments", projectId],
    queryFn: ({ pageParam }) => api.getProjectComments(projectId as string, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => data.pages.slice().reverse().flatMap((page) => page.items),
    enabled: Boolean(projectId),
  });
}

export function useCreateProjectComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { projectId: string; content: string }) => api.createProjectComment(args.projectId, args.content),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["project-comments", args.projectId] }),
  });
}

export function useUpdateProjectComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { projectId: string; commentId: string; content: string }) => api.updateProjectComment(args.commentId, args.content),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["project-comments", args.projectId] }),
  });
}

export function useDeleteProjectComment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { projectId: string; commentId: string }) => api.deleteProjectComment(args.commentId),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["project-comments", args.projectId] }),
  });
}

export function useProjectAttachments(projectId?: string) {
  return useQuery({ queryKey: ["project-attachments", projectId], queryFn: () => api.getProjectAttachments(projectId as string), enabled: Boolean(projectId) });
}

export function useAddProjectAttachment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { projectId: string; fileId: string }) => api.addProjectAttachment(args.projectId, args.fileId),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["project-attachments", args.projectId] }),
  });
}

export function useRemoveProjectAttachment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { projectId: string; fileId: string }) => api.removeProjectAttachment(args.projectId, args.fileId),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["project-attachments", args.projectId] }),
  });
}

export function useApprovals(projectId?: string) {
  return useQuery({ queryKey: ["approvals", projectId], queryFn: () => api.getApprovals(projectId), enabled: Boolean(projectId) });
}

export function useCreateApproval() {
  const client = useQueryClient();
  return useMutation({ mutationFn: api.createApproval, onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["approvals", args.projectId] }) });
}

export function useResolveApproval() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { projectId?: string; approvalId: string; status: "approved" | "rejected"; message?: string }) => api.resolveApproval(args.approvalId, args.status, args.message),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["approvals", args.projectId] }),
  });
}

export function useProjectActivity(projectId?: string) {
  return useInfiniteQuery({
    queryKey: ["project-activity", projectId],
    queryFn: ({ pageParam }) => api.getProjectActivity(projectId as string, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
    enabled: Boolean(projectId),
  });
}

export function useMeetings() {
  return useQuery({
    queryKey: ["meetings", orgId()],
    queryFn: api.getMeetings,
    enabled: getActiveOrganisation() !== null,
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useCreateMeeting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      title: string;
      description?: string;
      workspaceId?: string;
      scheduledAt?: string;
    }) =>
      api.createMeeting(
        args.title,
        args.description,
        args.workspaceId,
        args.scheduledAt,
      ),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["meetings", orgId()] }),
  });
}

export function useMeeting(meetingId?: string) {
  return useQuery({
    queryKey: ["meeting", meetingId],
    queryFn: () => api.getMeeting(meetingId as string),
    enabled: Boolean(meetingId),
    staleTime: 10 * 1000,
    retry: 2,
  });
}

export function useCreateVoiceRoom() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { title: string; workspaceId?: string }) => api.createVoiceRoom(args.title, args.workspaceId),
    onSuccess: () => client.invalidateQueries({ queryKey: ["meetings", orgId()] }),
  });
}

export function useMeetingMessages(meetingId?: string) {
  return useInfiniteQuery({
    queryKey: ["meeting-messages", meetingId],
    queryFn: ({ pageParam }) => api.getMeetingMessages(meetingId as string, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => data.pages.slice().reverse().flatMap((page) => page.items),
    enabled: Boolean(meetingId),
    staleTime: 10 * 1000,
    retry: 2,
  });
}

export function useCreateMeetingMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { meetingId: string; content: string }) => api.createMeetingMessage(args.meetingId, args.content),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["meeting-messages", args.meetingId] }),
  });
}

export function useMeetingReactions(meetingId?: string) {
  return useQuery({
    queryKey: ["meeting-reactions", meetingId],
    queryFn: () => api.getMeetingReactions(meetingId as string),
    enabled: Boolean(meetingId),
    staleTime: 10 * 1000,
  });
}

export function useCreateMeetingReaction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { meetingId: string; emoji: string }) => api.createMeetingReaction(args.meetingId, args.emoji),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["meeting-reactions", args.meetingId] }),
  });
}

export function useMeetingRaiseHands(meetingId?: string) {
  return useQuery({
    queryKey: ["meeting-raise-hands", meetingId],
    queryFn: () => api.getMeetingRaiseHands(meetingId as string),
    enabled: Boolean(meetingId),
    staleTime: 10 * 1000,
  });
}

export function useUpdateMeetingRaiseHand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { meetingId: string; raised: boolean }) => api.updateMeetingRaiseHand(args.meetingId, args.raised),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["meeting-raise-hands", args.meetingId] }),
  });
}

export function useSetMeetingRecording() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { meetingId: string; recording: boolean }) => api.setMeetingRecording(args.meetingId, args.recording),
    onSuccess: (_, args) => {
      void client.invalidateQueries({ queryKey: ["meeting", args.meetingId] });
      void client.invalidateQueries({ queryKey: ["meetings", orgId()], exact: false });
    },
  });
}

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: ["notifications", orgId(), String(unreadOnly)],
    queryFn: () => api.getNotifications(unreadOnly),
    enabled: getActiveOrganisation() !== null,
    staleTime: 10 * 1000,
    retry: 2,
  });
}

export function useNotificationPreference(eventType: string) {
  return useQuery({ queryKey: ["notification-preference", orgId(), eventType], queryFn: () => api.getNotificationPreference(eventType), enabled: getActiveOrganisation() !== null });
}

export function useSetNotificationPreference() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { eventType: string; body: Parameters<typeof api.setNotificationPreference>[1] }) => api.setNotificationPreference(args.eventType, args.body),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["notification-preference", orgId(), args.eventType] }),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ["unread-count", orgId()],
    queryFn: api.getUnreadCount,
    enabled: getActiveOrganisation() !== null,
    refetchInterval: 30 * 1000,
    retry: 2,
  });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.markNotificationRead,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notifications", orgId()] }),
  });
}

export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["notifications", orgId()] }),
  });
}

export function useFile(fileId?: string) {
  return useQuery({
    queryKey: ["file", fileId],
    queryFn: () => api.getFile(fileId as string),
    enabled: Boolean(fileId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFiles() {
  return useQuery({
    queryKey: ["files", orgId()],
    queryFn: api.getFiles,
    enabled: getActiveOrganisation() !== null,
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useExternalShares(fileId?: string) {
  return useQuery({ queryKey: ["external-shares", fileId], queryFn: () => api.getExternalShares(fileId as string), enabled: Boolean(fileId) });
}

export function useCreateExternalShare() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (args: { fileId: string; expiresAt?: string; maxViews?: number }) => api.createExternalShare(args.fileId, { expiresAt: args.expiresAt, maxViews: args.maxViews }), onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["external-shares", args.fileId] }) });
}

export function useRevokeExternalShare() {
  const client = useQueryClient();
  return useMutation({ mutationFn: (args: { fileId: string; shareId: string }) => api.revokeExternalShare(args.shareId), onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["external-shares", args.fileId] }) });
}

export function useDeleteFile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteFile,
    onSuccess: () => client.invalidateQueries({ queryKey: ["files", orgId()] }),
  });
}

export function useUploadFile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.uploadFile,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["files", orgId()] }),
  });
}

export function useSearch() {
  return useMutation({
    mutationFn: (args: { query: string; filters?: api.SearchFilters }) =>
      api.search(args.query, args.filters),
  });
}

export function useSummarize() {
  return useMutation({
    mutationFn: (args: { prompt: string; sourceText?: string }) =>
      api.summarize(args.prompt, args.sourceText),
  });
}

export function useAskAI() {
  return useMutation({
    mutationFn: (args: {
      question: string;
      workspaceId?: string;
      resourceTypes?: string[];
    }) => api.askAI(args.question, args.workspaceId, args.resourceTypes),
  });
}

export function useDailyDigest() {
  return useMutation({
    mutationFn: (args: { workspaceId?: string; hours?: number }) =>
      api.dailyDigest(args.workspaceId, args.hours),
  });
}

export function usePendingAIActions() {
  return useQuery({
    queryKey: ["ai-pending-actions"],
    queryFn: () => api.getPendingAIActions(),
    refetchInterval: 10000,
  });
}

export function useConfirmAIAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; edits?: Record<string, unknown> }) => api.confirmAIAction(args.id, args.edits),
    onSuccess: () => client.invalidateQueries({ queryKey: ["ai-pending-actions"] }),
  });
}

export function useDeclineAIAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.declineAIAction(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ["ai-pending-actions"] }),
  });
}
