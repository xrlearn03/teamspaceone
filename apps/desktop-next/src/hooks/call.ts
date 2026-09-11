import { useQuery } from "@tanstack/react-query";
import { apiRequest, type OrganisationMember, type UserDto } from "@/lib/api";

export function getUsers(userIds: string[]): Promise<UserDto[]> {
  if (userIds.length === 0) return Promise.resolve([]);
  // Browser-safe stub until the backend endpoint is wired up.
  return Promise.resolve([]);
}

export function getMembers(organisationId: string): Promise<OrganisationMember[]> {
  return apiRequest<OrganisationMember[]>(`/organisations/${organisationId}/members`, { method: "GET" }).catch(
    () => [],
  );
}

export function useUsers(userIds: string[]) {
  return useQuery({
    queryKey: ["users", userIds],
    queryFn: () => getUsers(userIds),
    enabled: userIds.length > 0,
  });
}

export function useMembers(organisationId: string | undefined) {
  return useQuery({
    queryKey: ["members", organisationId],
    queryFn: () => (organisationId ? getMembers(organisationId) : Promise.resolve([])),
    enabled: Boolean(organisationId),
  });
}
