import { useCallback, useEffect } from "react";
import { useInfiniteQuery, useQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { enqueueMessage, queuedMessageCount } from "@/lib/offline-queue";
import { useUIStore } from "@/stores/ui";
import { useRealtime } from "./useRealtime";
import { getActiveOrganisation, setActiveOrganisation } from "@/lib/api";

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

export function useTickets(organisationId?: string) {
  return useQuery({
    queryKey: ["tickets", organisationId],
    queryFn: () => api.getTickets(organisationId as string),
    enabled: Boolean(organisationId),
    staleTime: 30 * 1000,
  });
}

export function useCreateTicket() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; subject: string; description: string; category: string; priority: api.TicketPriority; assigneeRoleId: string; attachments?: api.TicketAttachment[] }) =>
      api.createTicket(args.organisationId, args),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["tickets", args.organisationId] }),
  });
}

export function useUpdateTicketStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; ticketId: string; status: api.TicketStatus }) =>
      api.updateTicketStatus(args.organisationId, args.ticketId, args.status),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["tickets", args.organisationId] }),
  });
}

// Assets — served by the organisation service (admin feature, like tickets)
export function useAssets(organisationId?: string, params?: api.AssetListParams) {
  return useQuery({
    queryKey: ["assets", organisationId, params ?? {}],
    queryFn: () => api.getAssets(organisationId as string, params),
    enabled: Boolean(organisationId),
    staleTime: 60 * 1000,
  });
}

export function useAsset(organisationId?: string, id?: string) {
  return useQuery({
    queryKey: ["assets", organisationId, id],
    queryFn: () => api.getAsset(organisationId as string, id as string),
    enabled: Boolean(organisationId && id),
    staleTime: 60 * 1000,
  });
}

export function useCreateAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; body: api.AssetInput & { name: string } }) =>
      api.createAsset(args.organisationId, args.body),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["assets", args.organisationId] }),
  });
}

export function useUpdateAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; id: string; body: api.AssetInput }) =>
      api.updateAsset(args.organisationId, args.id, args.body),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["assets", args.organisationId] }),
  });
}

export function useDeleteAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; id: string }) =>
      api.deleteAsset(args.organisationId, args.id),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["assets", args.organisationId] }),
  });
}

export function useAssignAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; id: string; userId: string; notes?: string }) =>
      api.assignAsset(args.organisationId, args.id, { userId: args.userId, notes: args.notes }),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["assets", args.organisationId] }),
  });
}

export function useReturnAsset() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; id: string; notes?: string }) =>
      api.returnAsset(args.organisationId, args.id, args.notes ? { notes: args.notes } : undefined),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["assets", args.organisationId] }),
  });
}

export function usePermissionsList(organisationId?: string) {
  return useQuery({
    queryKey: ["permissions", organisationId],
    queryFn: () => api.getPermissions(organisationId as string),
    enabled: Boolean(organisationId),
    staleTime: 60 * 1000,
  });
}

export function useEmailProvider(organisationId?: string) {
  return useQuery({
    queryKey: ["email-provider", organisationId],
    queryFn: () => api.getEmailProvider(organisationId as string),
    enabled: Boolean(organisationId),
    staleTime: 60 * 1000,
  });
}

export function useUpdateEmailProvider() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; body: api.UpdateEmailProvider }) =>
      api.updateEmailProvider(args.organisationId, args.body),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["email-provider", args.organisationId] }),
  });
}

export function useCreateRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; name: string; description?: string; roleCategory: api.RoleCategory; permissionIds: string[]; scopes?: api.UserDataScope[] }) =>
      api.createRole(args.organisationId, args),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["roles", args.organisationId] }),
  });
}

export function useUpdateRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; roleId: string; name?: string; description?: string; roleCategory?: api.RoleCategory; permissionIds?: string[]; scopes?: api.UserDataScope[] }) =>
      api.updateRole(args.organisationId, args.roleId, args),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["roles", args.organisationId] }),
  });
}

export function useDeleteRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; roleId: string }) => api.deleteRole(args.organisationId, args.roleId),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["roles", args.organisationId] }),
  });
}

export function useUpdateMemberRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; membershipId: string; roleId: string }) =>
      api.updateMemberRole(args.organisationId, args.membershipId, args.roleId),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["members", args.organisationId] }),
  });
}

export function useInviteMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; email: string; roleId: string; firstName?: string; lastName?: string }) =>
      api.inviteMember(args.organisationId, args),
    onSuccess: (_, args) => {
      client.invalidateQueries({ queryKey: ["members", args.organisationId] });
      client.invalidateQueries({ queryKey: ["invitations", args.organisationId] });
    },
  });
}

export function useCreateInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; email: string; roleId: string }) =>
      api.createInvitation(args.organisationId, args.email, args.roleId),
    onSuccess: (_, args) => {
      client.invalidateQueries({ queryKey: ["invitations", args.organisationId] });
    },
  });
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

export function useRevokeInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; invitationId: string }) => api.revokeInvitation(args.organisationId, args.invitationId),
    onSuccess: (_, args) => {
      client.invalidateQueries({ queryKey: ["invitations", args.organisationId] });
      client.invalidateQueries({ queryKey: ["members", args.organisationId] });
    },
  });
}

export function useResendInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; invitationId: string }) => api.resendInvitation(args.organisationId, args.invitationId),
    onSuccess: (_, args) => client.invalidateQueries({ queryKey: ["invitations", args.organisationId] }),
  });
}

export function useRemoveMember() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { organisationId: string; membershipId: string }) => api.removeMember(args.organisationId, args.membershipId),
    onSuccess: (_, args) => {
      client.invalidateQueries({ queryKey: ["members", args.organisationId] });
      client.invalidateQueries({ queryKey: ["invitations", args.organisationId] });
    },
  });
}

export function useAcceptInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.acceptInvitation,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["organisations"] });
      client.invalidateQueries({ queryKey: ["members"] });
      client.invalidateQueries({ queryKey: ["invitations"] });
      client.invalidateQueries({ queryKey: ["users"] });
      client.invalidateQueries({ queryKey: ["channels"] });
    },
  });
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

export function useAddChannelModerator() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { channelId: string; userId: string }) => api.addChannelModerator(args.channelId, args.userId),
    onSuccess: () => client.invalidateQueries({ queryKey: ["channels", orgId()] }),
  });
}

export function useRemoveChannelModerator() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { channelId: string; userId: string }) => api.removeChannelModerator(args.channelId, args.userId),
    onSuccess: () => client.invalidateQueries({ queryKey: ["channels", orgId()] }),
  });
}

export function useMessages(channelId?: string, query?: string) {
  const { joinRealtimeChannel, leaveRealtimeChannel, connected } = useRealtime();
  useEffect(() => {
    if (!channelId || !connected) return;
    joinRealtimeChannel(channelId);
    return () => leaveRealtimeChannel(channelId);
  }, [channelId, connected, joinRealtimeChannel, leaveRealtimeChannel]);

  return useInfiniteQuery({
    queryKey: ["messages", channelId, ...(query ? [query] : [])],
    queryFn: ({ pageParam }) => api.getMessages(channelId as string, pageParam ?? undefined, 50, query),
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

export function usePinnedMessages(channelId?: string) {
  return useQuery({
    queryKey: ["pinned", channelId],
    queryFn: () => api.getPinnedMessages(channelId as string),
    enabled: Boolean(channelId),
    staleTime: 30 * 1000,
    retry: 2,
  });
}

export function usePinMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.pinMessage,
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["pinned", result.channelId] });
      void client.invalidateQueries({ queryKey: ["messages", result.channelId] });
    },
  });
}

export function useUnpinMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.unpinMessage,
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["pinned", result.channelId] });
      void client.invalidateQueries({ queryKey: ["messages", result.channelId] });
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

export function useProjectTemplates() {
  const orgId = getActiveOrganisation() ?? undefined;
  return useQuery({
    queryKey: ["projects", orgId, "templates"],
    queryFn: () => api.getProjectTemplates(),
    enabled: Boolean(orgId),
    staleTime: 30 * 1000,
  });
}

export function useMarkProjectAsTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.markProjectAsTemplate,
    onSuccess: () => client.invalidateQueries({ queryKey: ["projects", orgId()] }),
  });
}

export function useUnmarkProjectAsTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.unmarkProjectAsTemplate,
    onSuccess: () => client.invalidateQueries({ queryKey: ["projects", orgId()] }),
  });
}

export function useCreateProjectFromTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { templateId: string; body: Parameters<typeof api.createProjectFromTemplate>[1] }) =>
      api.createProjectFromTemplate(args.templateId, args.body),
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

export function useTodos() {
  return useQuery({
    queryKey: ["todos", orgId()],
    queryFn: api.getTodos,
    enabled: getActiveOrganisation() !== null,
    staleTime: 30 * 1000,
    retry: 2,
    meta: { suppressErrorToast: true },
  });
}

export function useCreateTodo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createTodo,
    onSuccess: () => client.invalidateQueries({ queryKey: ["todos", orgId()] }),
  });
}

export function useUpdateTodo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { todoId: string; body: Parameters<typeof api.updateTodo>[1] }) => api.updateTodo(args.todoId, args.body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["todos", orgId()] }),
  });
}

export function useDeleteTodo() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteTodo,
    onSuccess: () => client.invalidateQueries({ queryKey: ["todos", orgId()] }),
  });
}

export function useTimeEntries(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["time-entries", orgId(), params?.from ?? "", params?.to ?? ""],
    queryFn: () => api.getTimeEntries(params),
    enabled: getActiveOrganisation() !== null,
    staleTime: 60 * 1000,
  });
}

export function useCreateTimeEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createTimeEntry,
    onSuccess: () => client.invalidateQueries({ queryKey: ["time-entries", orgId()] }),
  });
}

export function useUpdateTimeEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updateTimeEntry>[1] }) =>
      api.updateTimeEntry(args.id, args.body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["time-entries", orgId()] }),
  });
}

export function useDeleteTimeEntry() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteTimeEntry,
    onSuccess: () => client.invalidateQueries({ queryKey: ["time-entries", orgId()] }),
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

export function useTaskAttachments(taskId?: string) {
  return useQuery({ queryKey: ["task-attachments", taskId], queryFn: () => api.getTaskAttachments(taskId as string), enabled: Boolean(taskId) });
}

export function useAddTaskAttachment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { taskId: string; projectId: string; fileId: string }) => api.addTaskAttachment(args.taskId, args.fileId),
    onSuccess: (_, args) => {
      client.invalidateQueries({ queryKey: ["task-attachments", args.taskId] });
      client.invalidateQueries({ queryKey: ["project-activity", args.projectId] });
    },
  });
}

export function useRemoveTaskAttachment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { taskId: string; projectId: string; fileId: string }) => api.removeTaskAttachment(args.taskId, args.fileId),
    onSuccess: (_, args) => {
      client.invalidateQueries({ queryKey: ["task-attachments", args.taskId] });
      client.invalidateQueries({ queryKey: ["project-activity", args.projectId] });
    },
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

export function useCalendarEvents(range?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["calendar-events", orgId(), range?.from ?? null, range?.to ?? null],
    queryFn: () => api.getCalendarEvents(range),
    enabled: getActiveOrganisation() !== null,
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useCreateMeeting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: api.CreateMeetingInput) => api.createMeeting(args),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["meetings", orgId()] });
      void client.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

export function useStartMeeting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.startMeeting(id),
    onSuccess: (_meeting, id) => {
      void client.invalidateQueries({ queryKey: ["meetings"] });
      void client.invalidateQueries({ queryKey: ["meeting", id] });
      void client.invalidateQueries({ queryKey: ["calendar-events"] });
    },
  });
}

export function useEndMeeting() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.endMeeting(id),
    onSuccess: (_meeting, id) => {
      void client.invalidateQueries({ queryKey: ["meetings"] });
      void client.invalidateQueries({ queryKey: ["meeting", id] });
      void client.invalidateQueries({ queryKey: ["calendar-events"] });
    },
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
    mutationFn: (args: { title: string; workspaceId?: string; inviteeIds?: string[] }) =>
      api.createVoiceRoom(args.title, args.workspaceId, args.inviteeIds),
    onSuccess: () => client.invalidateQueries({ queryKey: ["meetings", orgId()] }),
  });
}

export function useDeleteEndedMeetings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId?: string) => api.deleteEndedMeetings(workspaceId),
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

export function useNotificationCounts() {
  return useQuery({
    queryKey: ["notification-counts", orgId()],
    queryFn: () => api.getNotifications(true, 1000),
    enabled: getActiveOrganisation() !== null,
    select: (notifications) => {
      const counts: Record<string, number> = {};
      for (const n of notifications) {
        if (n.read) continue;
        const type = n.resourceType ?? "other";
        counts[type] = (counts[type] ?? 0) + 1;
      }
      return { total: Object.values(counts).reduce((a, b) => a + b, 0), counts };
    },
  });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.markNotificationRead,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notifications", orgId()] });
      void client.invalidateQueries({ queryKey: ["unread-count", orgId()] });
      void client.invalidateQueries({ queryKey: ["notification-counts", orgId()] });
    },
  });
}

export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.markAllNotificationsRead,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["notifications", orgId()] });
      void client.invalidateQueries({ queryKey: ["unread-count", orgId()] });
      void client.invalidateQueries({ queryKey: ["notification-counts", orgId()] });
    },
  });
}

/** Org-wide audit feed (admin.audit.view). Pass enabled=false to skip. */
export function useAuditEvents(enabled = true, take = 50) {
  return useQuery({
    queryKey: ["audit-events", orgId(), take],
    queryFn: () => api.getAuditEvents(take),
    enabled: enabled && getActiveOrganisation() !== null,
    staleTime: 30 * 1000,
    retry: 1,
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
    queryFn: () => api.getFiles(),
    enabled: getActiveOrganisation() !== null,
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useMeetingRecordings(enabled = true) {
  return useQuery({
    queryKey: ["meeting-recordings", orgId()],
    queryFn: () => api.getFiles({ resourceType: "meeting" }),
    enabled: enabled && getActiveOrganisation() !== null,
    staleTime: 30 * 1000,
    retry: 2,
  });
}

export function useMeetingAvailability(args?: { userIds?: string[]; from?: string; to?: string }) {
  const key = [...(args?.userIds ?? [])].sort().join(",");
  return useQuery({
    queryKey: ["meeting-availability", orgId(), key, args?.from ?? null, args?.to ?? null],
    queryFn: () => api.getMeetingAvailability(args!),
    enabled: Boolean(args) && getActiveOrganisation() !== null,
    staleTime: 30 * 1000,
    retry: 1,
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
  return useMutation<api.FileRecord, unknown, { file: File; resource?: api.UploadResource }>({
    mutationFn: (args) => api.uploadFile(args.file, args.resource),
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

// ---------------------------------------------------------------------------
// HRMS (Phase 4)
// ---------------------------------------------------------------------------

const hrmsEnabled = () => getActiveOrganisation() !== null;

export function useHrmsOverview() {
  return useQuery({
    queryKey: ["hrms", "overview", orgId()],
    queryFn: api.getHrmsOverview,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useEmployees(params?: api.EmployeeListParams) {
  return useQuery({
    queryKey: ["hrms", "employees", orgId(), params ?? {}],
    queryFn: () => api.getEmployees(params),
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useMyEmployee() {
  return useQuery({
    queryKey: ["hrms", "employees", "me", orgId()],
    queryFn: api.getMyEmployee,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
    retry: 1,
    meta: { suppressErrorToast: true },
  });
}

export function useEmployeeBirthdays(days = 7) {
  return useQuery({
    queryKey: ["hrms", "employee-birthdays", orgId(), days],
    queryFn: () => api.getEmployeeBirthdays(days),
    enabled: hrmsEnabled(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
    meta: { suppressErrorToast: true },
  });
}

export function useEmployee(id?: string) {
  return useQuery({
    queryKey: ["hrms", "employees", orgId(), id],
    queryFn: () => api.getEmployee(id as string),
    enabled: Boolean(id),
    staleTime: 60 * 1000,
  });
}

export function useCreateEmployee() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createEmployee,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["hrms", "employees", orgId()] });
      client.invalidateQueries({ queryKey: ["hrms", "employees", "me", orgId()] });
      client.invalidateQueries({ queryKey: ["users"] });
      client.invalidateQueries({ queryKey: ["hrms", "overview"] });
    },
  });
}

export function useUpdateEmployee() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updateEmployee>[1] }) =>
      api.updateEmployee(args.id, args.body),
    onSuccess: (_, args) => {
      client.invalidateQueries({ queryKey: ["hrms", "employees", orgId()] });
      client.invalidateQueries({ queryKey: ["hrms", "employees", "me", orgId()] });
      client.invalidateQueries({ queryKey: ["hrms", "employees", orgId(), args.id] });
      client.invalidateQueries({ queryKey: ["users"] });
      client.invalidateQueries({ queryKey: ["hrms", "overview"] });
    },
  });
}

/** DELETE /hrms/employees/:id — sets status to 'terminated'. */
export function useTerminateEmployee() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.terminateEmployee,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["hrms", "employees", orgId()] });
      client.invalidateQueries({ queryKey: ["hrms", "overview"] });
      client.invalidateQueries({ queryKey: ["hrms", "analytics"] });
      client.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ["hrms", "departments", orgId()],
    queryFn: api.getDepartments,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useCreateDepartment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createDepartment,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "departments"] }),
  });
}

export function useUpdateDepartment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updateDepartment>[1] }) =>
      api.updateDepartment(args.id, args.body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "departments"] }),
  });
}

export function useDeleteDepartment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteDepartment,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "departments"] }),
  });
}

export function useDesignations() {
  return useQuery({
    queryKey: ["hrms", "designations", orgId()],
    queryFn: api.getDesignations,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useCreateDesignation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createDesignation,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "designations"] }),
  });
}

export function useUpdateDesignation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updateDesignation>[1] }) =>
      api.updateDesignation(args.id, args.body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "designations"] }),
  });
}

export function useDeleteDesignation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteDesignation,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "designations"] }),
  });
}

export function useOrgChart() {
  return useQuery({
    queryKey: ["hrms", "org-chart", orgId()],
    queryFn: api.getOrgChart,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useAttendance(params?: { employeeId?: string; from?: string; to?: string }) {
  return useQuery({
    queryKey: ["hrms", "attendance", orgId(), params ?? {}],
    queryFn: () => api.getAttendance(params),
    enabled: hrmsEnabled() && Boolean(params?.employeeId),
    staleTime: 30 * 1000,
  });
}

/** Org-scoped attendance listing (HR roles) — no employeeId required. */
export function useAttendanceAll(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["hrms", "attendance", "all", orgId(), params ?? {}],
    queryFn: () => api.getAttendance(params),
    enabled: hrmsEnabled(),
    staleTime: 30 * 1000,
  });
}

export function useAttendanceCheckin() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.attendanceCheckin,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["hrms", "attendance"] });
      client.invalidateQueries({ queryKey: ["hrms", "overview"] });
    },
  });
}

export function useAttendanceCheckout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.attendanceCheckout,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "attendance"] }),
  });
}

export function useAttendancePresence() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.attendancePresence,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "attendance"] }),
  });
}

export function useAttendanceCorrections(status?: string) {
  return useQuery({
    queryKey: ["hrms", "attendance-corrections", orgId(), status ?? "all"],
    queryFn: () => api.getAttendanceCorrections(status ? { status } : undefined),
    enabled: hrmsEnabled(),
    staleTime: 30 * 1000,
  });
}

export function useRequestAttendanceCorrection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.requestAttendanceCorrection,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "attendance-corrections"] }),
  });
}

export function useReviewAttendanceCorrection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; action: "approve" | "reject"; note?: string }) =>
      api.reviewAttendanceCorrection(args.id, args.action, args.note),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["hrms", "attendance-corrections"] });
      client.invalidateQueries({ queryKey: ["hrms", "attendance"] });
      client.invalidateQueries({ queryKey: ["hrms", "overview"] });
    },
  });
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: ["hrms", "leave-types", orgId()],
    queryFn: api.getLeaveTypes,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useLeaveBalances(employeeId?: string) {
  return useQuery({
    queryKey: ["hrms", "leave-balances", orgId(), employeeId ?? "me"],
    queryFn: () => api.getLeaveBalances(employeeId),
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useLeaveRequests(params?: { status?: string; employeeId?: string; mine?: boolean }) {
  return useQuery({
    queryKey: ["hrms", "leave-requests", orgId(), params ?? {}],
    queryFn: () => api.getLeaveRequests(params),
    enabled: hrmsEnabled(),
    staleTime: 30 * 1000,
  });
}

export function useApplyLeave() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.applyLeave,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["hrms", "leave-requests"] });
      client.invalidateQueries({ queryKey: ["hrms", "leave-balances"] });
      client.invalidateQueries({ queryKey: ["hrms", "overview"] });
    },
  });
}

export function useReviewLeaveRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; action: "approve" | "reject" | "cancel"; note?: string }) =>
      api.reviewLeaveRequest(args.id, args.action, args.note),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["hrms", "leave-requests"] });
      client.invalidateQueries({ queryKey: ["hrms", "leave-balances"] });
      client.invalidateQueries({ queryKey: ["hrms", "overview"] });
    },
  });
}

export function useHolidays() {
  return useQuery({
    queryKey: ["hrms", "holidays", orgId()],
    queryFn: api.getHolidays,
    enabled: hrmsEnabled(),
    staleTime: 5 * 60 * 1000,
  });
}

export function useHrmsCalendar(range?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ["hrms", "calendar", orgId(), range?.from ?? null, range?.to ?? null],
    queryFn: () => api.getHrmsCalendar(range),
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function usePayrollPeriods() {
  return useQuery({
    queryKey: ["hrms", "payroll-periods", orgId()],
    queryFn: api.getPayrollPeriods,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function usePayslips(params?: { employeeId?: string; payrollPeriodId?: string }) {
  return useQuery({
    queryKey: ["hrms", "payslips", orgId(), params ?? {}],
    queryFn: () => api.getPayslips(params),
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function usePayslip(id?: string) {
  return useQuery({
    queryKey: ["hrms", "payslips", orgId(), id ?? ""],
    queryFn: () => api.getPayslip(id as string),
    enabled: hrmsEnabled() && Boolean(id),
    staleTime: 60 * 1000,
  });
}

export function useEmployeeDocuments(employeeId?: string) {
  return useQuery({
    queryKey: ["hrms", "documents", orgId(), employeeId ?? "me"],
    queryFn: () => api.getEmployeeDocuments(employeeId),
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useUploadEmployeeDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.uploadEmployeeDocument,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "documents"] }),
  });
}

export function useDeleteEmployeeDocument() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteEmployeeDocument,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "documents"] }),
  });
}

// Interview / recruitment
const interviewEnabled = () => getActiveOrganisation() !== null;

export function useInterviewOverview() {
  return useQuery({
    queryKey: ["interview", "overview", orgId()],
    queryFn: api.getInterviewOverview,
    enabled: interviewEnabled(),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useJobOpenings(status?: string) {
  return useQuery({
    queryKey: ["interview", "jobs", orgId(), status ?? "all"],
    queryFn: () => api.getJobOpenings(status),
    enabled: interviewEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useCreateJobOpening() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createJobOpening,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["interview", "jobs"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function useUpdateJobOpening() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updateJobOpening>[1] }) =>
      api.updateJobOpening(args.id, args.body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["interview", "jobs"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function useCandidates(status?: string) {
  return useQuery({
    queryKey: ["interview", "candidates", orgId(), status ?? "all"],
    queryFn: () => api.getCandidates(status),
    enabled: interviewEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useCreateCandidate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createCandidate,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["interview", "candidates"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function useUploadCandidateResume() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (args: { candidateId: string; file: File }) => {
      const fileRecord = await api.uploadFile(args.file);
      return api.updateCandidate(args.candidateId, { resumeFileId: fileRecord.id });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["interview", "candidates"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function useHiringDecisions(enabled = true) {
  return useQuery({
    queryKey: ["interview", "decisions", orgId()],
    queryFn: () => api.getHiringDecisions(),
    enabled: enabled && Boolean(getActiveOrganisation()),
    staleTime: 30 * 1000,
  });
}

export function useUpdateApplicationStage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { applicationId: string; stage: string }) =>
      api.updateApplicationStage(args.applicationId, args.stage),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["interview", "candidates"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function useInterviewSessions(upcoming?: boolean) {
  return useQuery({
    queryKey: ["interview", "sessions", orgId(), upcoming ? "upcoming" : "all"],
    queryFn: () => api.getInterviewSessions(upcoming),
    enabled: interviewEnabled(),
    staleTime: 30 * 1000,
  });
}

export function useCreateInterviewSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createInterviewSession,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["interview", "sessions"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function usePendingEvaluations() {
  return useQuery({
    queryKey: ["interview", "evaluations", "pending", orgId()],
    queryFn: api.getPendingEvaluations,
    enabled: interviewEnabled(),
    staleTime: 30 * 1000,
  });
}

// ─── Phase 6 — AI screening + AI interview ──────────────────────────────────

export function useApplicationScreening(applicationId?: string) {
  return useQuery({
    queryKey: ["interview", "applications", applicationId ?? "none", "screening"],
    queryFn: () => (applicationId ? api.getApplicationScreening(applicationId) : null),
    enabled: Boolean(interviewEnabled() && applicationId),
    staleTime: 30 * 1000,
  });
}

export function useRunApplicationScreening() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { applicationId: string; resumeText?: string }) =>
      api.runApplicationScreening(args.applicationId, args.resumeText ? { resumeText: args.resumeText } : {}),
    onSuccess: (_, args) => {
      client.invalidateQueries({ queryKey: ["interview", "applications", args.applicationId, "screening"] });
      client.invalidateQueries({ queryKey: ["interview", "candidates"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function useReviewApplicationScreening() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.reviewApplicationScreening,
    onSuccess: (_, applicationId) => {
      client.invalidateQueries({ queryKey: ["interview", "applications", applicationId, "screening"] });
    },
  });
}

export function useStartAiInterview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { sessionId: string; templateId?: string; config?: Record<string, unknown>; interviewType?: "ai_text" | "ai_voice" | "ai_video" }) =>
      api.startAiInterview(args.sessionId, { templateId: args.templateId, config: args.config, interviewType: args.interviewType }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["interview", "sessions"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function useJoinAiInterview() {
  return useMutation({
    mutationFn: api.joinAiInterview,
  });
}

export function useSubmitAiAnswer() {
  return useMutation({
    mutationFn: (args: { sessionId: string; questionIndex: number; answer: string }) =>
      api.submitAiAnswer(args.sessionId, { questionIndex: args.questionIndex, answer: args.answer }),
  });
}

export function useAiTranscript(sessionId?: string) {
  return useQuery({
    queryKey: ["interview", "sessions", sessionId ?? "none", "ai", "transcript"],
    queryFn: () => (sessionId ? api.getAiTranscript(sessionId) : []),
    enabled: Boolean(interviewEnabled() && sessionId),
    staleTime: 30 * 1000,
  });
}

export function useEvaluateAiInterview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.evaluateAiInterview,
    onSuccess: (_, sessionId) => {
      client.invalidateQueries({ queryKey: ["interview", "sessions", sessionId, "ai", "transcript"] });
      client.invalidateQueries({ queryKey: ["interview", "sessions", sessionId, "evaluations"] });
      client.invalidateQueries({ queryKey: ["interview", "evaluations"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function useSessionEvaluations(sessionId?: string) {
  return useQuery({
    queryKey: ["interview", "sessions", sessionId ?? "none", "evaluations"],
    queryFn: () => (sessionId ? api.getSessionEvaluations(sessionId) : []),
    enabled: Boolean(interviewEnabled() && sessionId),
    staleTime: 30 * 1000,
  });
}

export function useReviewEvaluation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { evaluationId: string; body: Parameters<typeof api.reviewEvaluation>[1] }) =>
      api.reviewEvaluation(args.evaluationId, args.body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["interview", "evaluations"] });
      client.invalidateQueries({ queryKey: ["interview", "sessions"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function useMakeHiringDecision() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { applicationId: string; decision: "offer" | "hire" | "reject" | "hold"; rationale?: string }) =>
      api.makeHiringDecision(args.applicationId, { decision: args.decision, rationale: args.rationale }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["interview", "candidates"] });
      client.invalidateQueries({ queryKey: ["interview", "overview"] });
    },
  });
}

export function useInterviewTemplates() {
  return useQuery({
    queryKey: ["interview", "templates", orgId()],
    queryFn: api.getInterviewTemplates,
    enabled: interviewEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useCreateInterviewTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createInterviewTemplate,
    onSuccess: () => client.invalidateQueries({ queryKey: ["interview", "templates"] }),
  });
}

export function useUpdateInterviewTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updateInterviewTemplate>[1] }) =>
      api.updateInterviewTemplate(args.id, args.body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["interview", "templates"] }),
  });
}

export function useDeleteInterviewTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteInterviewTemplate,
    onSuccess: () => client.invalidateQueries({ queryKey: ["interview", "templates"] }),
  });
}

// ─── Phase 7 — Advanced HRMS ────────────────────────────────────────────────

export function useOnboardingTemplates() {
  return useQuery({
    queryKey: ["hrms", "onboarding-templates", orgId()],
    queryFn: api.getOnboardingTemplates,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useCreateOnboardingTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createOnboardingTemplate,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "onboarding-templates"] }),
  });
}

export function useUpdateOnboardingTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updateOnboardingTemplate>[1] }) =>
      api.updateOnboardingTemplate(args.id, args.body),
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "onboarding-templates"] }),
  });
}

export function useDeleteOnboardingTemplate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.deleteOnboardingTemplate,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "onboarding-templates"] }),
  });
}

export function useOnboardingInstances(status?: string) {
  return useQuery({
    queryKey: ["hrms", "onboarding", orgId(), status ?? "all"],
    queryFn: () => api.getOnboardingInstances(status),
    enabled: hrmsEnabled(),
    staleTime: 30 * 1000,
  });
}

export function useOnboardingInstance(id?: string) {
  return useQuery({
    queryKey: ["hrms", "onboarding", "detail", orgId(), id],
    queryFn: () => api.getOnboardingInstance(id as string),
    enabled: hrmsEnabled() && Boolean(id),
    staleTime: 30 * 1000,
  });
}

function invalidateOnboarding(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ["hrms", "onboarding"] });
  client.invalidateQueries({ queryKey: ["hrms", "overview"] });
  client.invalidateQueries({ queryKey: ["hrms", "analytics"] });
}

export function useCreateOnboardingInstance() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createOnboardingInstance,
    onSuccess: () => invalidateOnboarding(client),
  });
}

export function useConvertOnboardingInstance() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.convertOnboardingInstance>[1] }) =>
      api.convertOnboardingInstance(args.id, args.body),
    onSuccess: () => {
      invalidateOnboarding(client);
      client.invalidateQueries({ queryKey: ["hrms", "employees"] });
    },
  });
}

export function useSetOnboardingTaskStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; taskId: string; action: "complete" | "reopen" }) =>
      api.setOnboardingTaskStatus(args.id, args.taskId, args.action),
    onSuccess: () => invalidateOnboarding(client),
  });
}

export function useCancelOnboardingInstance() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.cancelOnboardingInstance,
    onSuccess: () => invalidateOnboarding(client),
  });
}

// Offboarding

export function useOffboardingCases() {
  return useQuery({
    queryKey: ["hrms", "offboarding", orgId()],
    queryFn: api.getOffboardingCases,
    enabled: hrmsEnabled(),
    staleTime: 30 * 1000,
  });
}

export function useOffboardingCase(id?: string) {
  return useQuery({
    queryKey: ["hrms", "offboarding", "detail", orgId(), id],
    queryFn: () => api.getOffboardingCase(id as string),
    enabled: hrmsEnabled() && Boolean(id),
    staleTime: 30 * 1000,
  });
}

function invalidateOffboarding(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ["hrms", "offboarding"] });
  client.invalidateQueries({ queryKey: ["hrms", "overview"] });
  client.invalidateQueries({ queryKey: ["hrms", "analytics"] });
}

export function useCreateOffboardingCase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createOffboardingCase,
    onSuccess: () => invalidateOffboarding(client),
  });
}

export function useUpdateOffboardingCase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updateOffboardingCase>[1] }) =>
      api.updateOffboardingCase(args.id, args.body),
    onSuccess: () => invalidateOffboarding(client),
  });
}

export function useSetOffboardingTaskStatus() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; taskId: string; action: "complete" | "reopen" }) =>
      api.setOffboardingTaskStatus(args.id, args.taskId, args.action),
    onSuccess: () => invalidateOffboarding(client),
  });
}

export function useTransitionOffboardingCase() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; action: "complete" | "cancel" }) =>
      api.transitionOffboardingCase(args.id, args.action),
    onSuccess: () => {
      invalidateOffboarding(client);
      client.invalidateQueries({ queryKey: ["hrms", "employees"] });
    },
  });
}

// Performance

export function useReviewCycles() {
  return useQuery({
    queryKey: ["hrms", "performance-cycles", orgId()],
    queryFn: api.getReviewCycles,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useCreateReviewCycle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createReviewCycle,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "performance-cycles"] }),
  });
}

export function useUpdateReviewCycle() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updateReviewCycle>[1] }) =>
      api.updateReviewCycle(args.id, args.body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["hrms", "performance-cycles"] });
      client.invalidateQueries({ queryKey: ["hrms", "analytics"] });
    },
  });
}

export function usePerformanceReviews(params?: { cycleId?: string; employeeId?: string }) {
  return useQuery({
    queryKey: ["hrms", "performance-reviews", orgId(), params ?? {}],
    queryFn: () => api.getPerformanceReviews(params),
    enabled: hrmsEnabled(),
    staleTime: 30 * 1000,
  });
}

export function useCreatePerformanceReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createPerformanceReview,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "performance-reviews"] }),
  });
}

export function useUpdatePerformanceReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updatePerformanceReview>[1] }) =>
      api.updatePerformanceReview(args.id, args.body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["hrms", "performance-reviews"] });
      client.invalidateQueries({ queryKey: ["hrms", "analytics"] });
    },
  });
}

export function useAcknowledgePerformanceReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.acknowledgePerformanceReview,
    onSuccess: () => client.invalidateQueries({ queryKey: ["hrms", "performance-reviews"] }),
  });
}

export function useGoals(employeeId?: string) {
  return useQuery({
    queryKey: ["hrms", "goals", orgId(), employeeId ?? "all"],
    queryFn: () => api.getGoals(employeeId),
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

export function useCreateGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createGoal,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["hrms", "goals"] });
      client.invalidateQueries({ queryKey: ["hrms", "analytics"] });
    },
  });
}

export function useUpdateGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; body: Parameters<typeof api.updateGoal>[1] }) =>
      api.updateGoal(args.id, args.body),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["hrms", "goals"] });
      client.invalidateQueries({ queryKey: ["hrms", "analytics"] });
    },
  });
}

// Analytics

export function useHrmsAnalytics() {
  return useQuery({
    queryKey: ["hrms", "analytics", orgId()],
    queryFn: api.getHrmsAnalytics,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

// Payroll additions

export function usePayrollSummary() {
  return useQuery({
    queryKey: ["hrms", "payroll-summary", orgId()],
    queryFn: api.getPayrollSummary,
    enabled: hrmsEnabled(),
    staleTime: 60 * 1000,
  });
}

function invalidatePayroll(client: ReturnType<typeof useQueryClient>) {
  client.invalidateQueries({ queryKey: ["hrms", "payroll-periods"] });
  client.invalidateQueries({ queryKey: ["hrms", "payroll-summary"] });
  client.invalidateQueries({ queryKey: ["hrms", "payslips"] });
  client.invalidateQueries({ queryKey: ["hrms", "overview"] });
  client.invalidateQueries({ queryKey: ["hrms", "analytics"] });
}

export function useCreatePayrollPeriod() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.createPayrollPeriod,
    onSuccess: () => invalidatePayroll(client),
  });
}

export function useProcessPayrollPeriod() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.processPayrollPeriod,
    onSuccess: () => invalidatePayroll(client),
  });
}

export function useApprovePayrollPeriod() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.approvePayrollPeriod,
    onSuccess: () => invalidatePayroll(client),
  });
}

export function useMarkPayrollPeriodPaid() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: api.markPayrollPeriodPaid,
    onSuccess: () => invalidatePayroll(client),
  });
}
