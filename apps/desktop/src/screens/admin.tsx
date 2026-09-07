import { ShieldCheck, Users } from "lucide-react";
import { PermissionGate } from "@teamspace-one/authorization/react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { Skeleton } from "../components/ui/skeleton";
import { useMembers, useRoles, useUsers } from "../hooks/api";
import { getActiveOrganisation } from "../lib/api";
import { useMemo } from "react";

function MembersPanel() {
  const organisationId = getActiveOrganisation() ?? undefined;
  const { data: members, isLoading } = useMembers(organisationId);
  const memberUserIds = useMemo(
    () => [...new Set((members ?? []).map((m) => m.userId))],
    [members],
  );
  const { data: users } = useUsers(memberUserIds);
  const userMap = useMemo(
    () => new Map((users ?? []).map((u) => [u.id, u])),
    [users],
  );

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-text-muted" />
          <CardTitle className="text-sm">Members</CardTitle>
        </div>
        <Badge variant="secondary">{members?.length ?? 0}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : members && members.length > 0 ? (
          <div className="divide-y">
            {members.map((m) => {
              const u = userMap.get(m.userId);
              const name = u
                ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email
                : m.userId;
              return (
                <div key={m.id} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text">{name}</p>
                    {u ? (
                      <p className="truncate text-xs text-text-muted">{u.email}</p>
                    ) : null}
                  </div>
                  <Badge variant="secondary">{m.role?.name ?? "member"}</Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Users} title="No members" />
        )}
      </CardContent>
    </Card>
  );
}

function RolesPanel() {
  const organisationId = getActiveOrganisation() ?? undefined;
  const { data: roles, isLoading } = useRoles(organisationId);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-text-muted" />
          <CardTitle className="text-sm">Roles</CardTitle>
        </div>
        <Badge variant="secondary">{roles?.length ?? 0}</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : roles && roles.length > 0 ? (
          <div className="divide-y">
            {roles.map((role) => (
              <div key={role.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm capitalize text-text">
                    {role.name.replace(/_/g, " ")}
                  </p>
                  <p className="text-xs text-text-muted">
                    {Array.isArray(role.permissions)
                      ? `${role.permissions.length} permissions`
                      : "Role permissions managed via role permissions"}
                  </p>
                </div>
                {role.isDefault ? <Badge variant="secondary">Default</Badge> : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={ShieldCheck} title="No roles" />
        )}
      </CardContent>
    </Card>
  );
}

export function AdminScreen() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
        <h1 className="text-xl font-semibold text-text">Administration</h1>
        <p className="text-sm text-text-secondary">
          Members, roles and organisation settings.
        </p>
      </header>

      <div className="grid auto-rows-min grid-cols-1 gap-4 p-6 xl:grid-cols-2">
        <PermissionGate permission="admin.user.manage">
          <MembersPanel />
        </PermissionGate>
        <PermissionGate permission="admin.role.manage">
          <RolesPanel />
        </PermissionGate>
      </div>
    </div>
  );
}
