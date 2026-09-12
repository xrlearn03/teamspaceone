import { useQuery } from "@tanstack/react-query";
import { apiRequest, getUsers as apiGetUsers, type OrganisationMember, type UserDto } from "@/lib/api";

export function getUsers(userIds: string[]): Promise<UserDto[]> {
  if (userIds.length === 0) return Promise.resolve([]);
  return apiGetUsers(userIds);
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
