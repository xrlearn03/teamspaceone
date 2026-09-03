import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "../lib/api";
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
    mutationFn: api.createOrganisation,
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
    mutationFn: (args: { name: string; workspaceId?: string; type?: string }) =>
      api.createChannel(args.name, args.workspaceId, args.type),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["channels", orgId()] }),
  });
}

export function useMessages(channelId?: string) {
  return useQuery({
    queryKey: ["messages", channelId],
    queryFn: () => api.getMessages(channelId as string),
    enabled: Boolean(channelId),
    staleTime: 10 * 1000,
    retry: 2,
  });
}

export function useSendMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: { channelId: string; content: string }) =>
      api.sendMessage(args.channelId, args.content),
    onSuccess: (_, args) =>
      client.invalidateQueries({ queryKey: ["messages", args.channelId] }),
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
    mutationFn: (args: { name: string; description?: string; workspaceId?: string }) =>
      api.createProject(args.name, args.description, args.workspaceId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["projects", orgId()] }),
  });
}

export function useTasks(projectId?: string) {
  return useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () => api.getTasks(projectId as string),
    enabled: Boolean(projectId),
    staleTime: 60 * 1000,
    retry: 2,
  });
}

export function useCreateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      projectId: string;
      title: string;
      description?: string;
      assigneeId?: string;
      dueDate?: string;
    }) =>
      api.createTask(
        args.projectId,
        args.title,
        args.description,
        args.assigneeId,
        args.dueDate,
      ),
    onSuccess: (_, args) =>
      client.invalidateQueries({ queryKey: ["tasks", args.projectId] }),
  });
}

export function useUpdateTask() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      taskId: string;
      projectId: string;
      body: { status?: string; title?: string; assigneeId?: string };
    }) => api.updateTask(args.taskId, args.body),
    onSuccess: (_, args) =>
      client.invalidateQueries({ queryKey: ["tasks", args.projectId] }),
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
    mutationFn: (args: { title: string; description?: string; workspaceId?: string }) =>
      api.createMeeting(args.title, args.description, args.workspaceId),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["meetings", orgId()] }),
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

export function useFiles() {
  return useQuery({
    queryKey: ["files", orgId()],
    queryFn: api.getFiles,
    enabled: getActiveOrganisation() !== null,
    staleTime: 60 * 1000,
    retry: 2,
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
    mutationFn: (args: { query: string; filters?: string[] }) =>
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
