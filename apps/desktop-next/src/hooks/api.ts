import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: api.getMe,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useCreateOrganisation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createOrganisation(name),
    onSuccess: () => client.invalidateQueries({ queryKey: ["organisations"] }),
  });
}

export function useAcceptInvitation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api.acceptInvitation(token),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["organisations"] });
    },
  });
}
