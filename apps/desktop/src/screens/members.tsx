import { useMemo, useState } from "react";
import { MailPlus, Trash2, UserPlus, Users, XCircle } from "lucide-react";
import { useMembers, useRoles, useInviteMember, useInvitations, useOrganisations, useRemoveMember, useResendInvitation, useRevokeInvitation, useUsers } from "../hooks/api";
import { useUIStore } from "../stores/ui";
import { Avatar, AvatarFallback } from "@teamspace-one/ui/avatar";
import { Badge } from "@teamspace-one/ui/badge";
import { Button } from "@teamspace-one/ui/button";
import { Input } from "@teamspace-one/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import type { OrganisationMember, UserDto } from "../lib/api";
import { getUserDisplayName } from "../lib/utils";

const selectClass = "h-9 w-full rounded-md border bg-surface px-3 text-sm text-text";

function getInitials(_member: OrganisationMember, user?: UserDto) {
  return getUserDisplayName(user).slice(0, 2).toUpperCase();
}

function formatRoleName(name: string) {
  return name.toLowerCase() === "owner" ? "super admin" : name;
}

export function MemberDirectoryScreen() {
  const organisationId = useUIStore((s) => s.organisationId) ?? undefined;
  const { data: organisations } = useOrganisations();
  const { data: members, isLoading: membersLoading, error: membersError } = useMembers(organisationId);
  const { data: roles, isLoading: rolesLoading, error: rolesError } = useRoles(organisationId);
  const { data: invitations } = useInvitations(organisationId);
  const inviteMember = useInviteMember();
  const revokeInvitation = useRevokeInvitation();
  const resendInvitation = useResendInvitation();
  const removeMember = useRemoveMember();
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteExternal, setInviteExternal] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");

  const memberUserIds = useMemo(() => [...new Set((members ?? []).map((m) => m.userId))], [members]);
  const { data: users, isLoading: usersLoading } = useUsers(memberUserIds);
  const isLoading = membersLoading || (memberUserIds.length > 0 && usersLoading);
  const userMap = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users]);

  const organisation = organisations?.find((o) => o.id === organisationId);
  const filtered = (members ?? []).filter((m) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    const user = userMap.get(m.userId);
    const haystack = [getUserDisplayName(user), user?.email ?? ""].join(" ").toLowerCase();
    return haystack.includes(q) || m.role.name.toLowerCase().includes(q);
  });
  const externalRoles = (roles ?? []).filter((r) => r.roleCategory === "external" || r.roleCategory === "guest");
  const defaultExternalRoleId = externalRoles.find((r) => r.name === "client")?.id ?? externalRoles[0]?.id ?? "";
  const external = filtered.filter((m) => /client|external/i.test(m.role.name));
  const internal = filtered.filter((m) => !/client|external/i.test(m.role.name));
  const pendingInvitations = (invitations ?? []).filter((inv) => {
    if (inv.status !== "pending") return false;
    if (!query.trim()) return true;
    return inv.email.toLowerCase().includes(query.trim().toLowerCase());
  });

  function openInvite(external: boolean) {
    setInviteExternal(external);
    setEmail("");
    setRoleId(external ? defaultExternalRoleId : "");
    setInviteOpen(true);
  }

  function invite() {
    if (!organisationId || !email.trim() || !roleId) return;
    inviteMember.mutate(
      { organisationId, email: email.trim(), roleId },
      { onSuccess: () => { setInviteOpen(false); setEmail(""); setRoleId(""); } },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-text">Members</h1>
            <p className="text-xs text-text-muted">{organisation?.name ?? "Organisation"}</p>
          </div>
        </div>
        <Button size="sm" className="h-9 px-2 text-sm sm:px-3" onClick={() => openInvite(false)}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          <span className="hidden sm:inline">Invite member</span>
        </Button>
      </header>
      <div className="border-b px-3 py-3 sm:px-6">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members or roles" className="max-w-sm" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
        {isLoading ? (
          <p className="text-sm text-text-muted">Loading members…</p>
        ) : membersError ? (
          <p className="text-sm text-error">Failed to load members: {membersError.message}</p>
        ) : filtered.length === 0 && pendingInvitations.length === 0 ? (
          <EmptyState icon={Users} title="No members found" description="Try a different search or invite someone to this organisation." />
        ) : (
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Internal ({internal.length})</p>
              <div className="overflow-hidden rounded-lg border">
                {internal.map((member) => {
                  const user = userMap.get(member.userId);
                  return (
                    <div key={member.id} className="flex min-h-11 items-center gap-3 border-b px-4 py-3 last:border-0">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{getInitials(member, user)}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate text-sm text-text">{getUserDisplayName(user)}</span>
                      <Badge variant="secondary" className="capitalize">{formatRoleName(member.role.name)}</Badge>
                      {member.role.name.toLowerCase() === "owner" ? null : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 w-9 text-error"
                          disabled={removeMember.isPending}
                          onClick={() => organisationId && removeMember.mutate({ organisationId, membershipId: member.id })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                {internal.length === 0 ? <p className="px-4 py-6 text-center text-sm text-text-muted">No internal members.</p> : null}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">External collaborators ({external.length})</p>
                <Button size="sm" variant="ghost" onClick={() => openInvite(true)} disabled={!defaultExternalRoleId}>
                  <UserPlus className="mr-1.5 h-4 w-4" />
                  Invite external
                </Button>
              </div>
              <div className="overflow-hidden rounded-lg border border-warning/40">
                {external.map((member) => {
                  const user = userMap.get(member.userId);
                  return (
                    <div key={member.id} className="flex min-h-11 items-center gap-3 border-b px-4 py-3 last:border-0">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{getInitials(member, user)}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate text-sm text-text">{getUserDisplayName(user)}</span>
                      <Badge variant="warning">External</Badge>
                      <Badge variant="secondary" className="capitalize">{formatRoleName(member.role.name)}</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 text-error"
                        disabled={removeMember.isPending}
                        onClick={() => organisationId && removeMember.mutate({ organisationId, membershipId: member.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
                {external.length === 0 ? <p className="px-4 py-6 text-center text-sm text-text-muted">No external collaborators.</p> : null}
              </div>
            </div>
            {pendingInvitations.length > 0 ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Pending invitations ({pendingInvitations.length})</p>
                <div className="overflow-hidden rounded-lg border border-dashed">
                  {pendingInvitations.map((inv) => (
                    <div key={inv.id} className="flex min-h-11 items-center gap-3 border-b px-4 py-3 last:border-0">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{inv.email.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate text-sm text-text">{inv.email}</span>
                      <Badge variant="secondary">Invited</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={resendInvitation.isPending || revokeInvitation.isPending}
                        onClick={() => organisationId && resendInvitation.mutate({ organisationId, invitationId: inv.id })}
                      >
                        <MailPlus className="mr-1 h-3.5 w-3.5" />
                        Resend
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 text-error"
                        disabled={resendInvitation.isPending || revokeInvitation.isPending}
                        onClick={() => organisationId && revokeInvitation.mutate({ organisationId, invitationId: inv.id })}
                      >
                        <XCircle className="mr-1 h-3.5 w-3.5" />
                        Revoke
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader>
            <DialogTitle>{inviteExternal ? "Invite external collaborator" : "Invite member"}</DialogTitle>
            <DialogDescription>
              {inviteExternal
                ? `Invite a client or guest to ${organisation?.name ?? "this organisation"} with limited external access.`
                : `Send an invitation to join ${organisation?.name ?? "this organisation"}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-4">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" autoFocus />
            <select className={selectClass} value={roleId} onChange={(e) => setRoleId(e.target.value)} disabled={rolesLoading}>
              <option value="">{rolesLoading ? "Loading roles…" : "Select a role"}</option>
              {(inviteExternal ? externalRoles : roles)?.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            {rolesError ? <p className="text-sm text-error">Failed to load roles: {rolesError.message}</p> : null}
            {inviteMember.error ? <p className="text-sm text-error">{inviteMember.error.message}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={invite} disabled={!email.trim() || !roleId || inviteMember.isPending}>
                {inviteMember.isPending ? "Sending…" : "Send invitation"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
