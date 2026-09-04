import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { useMembers, useRoles, useCreateInvitation, useOrganisations } from "../hooks/api";
import { useUIStore } from "../stores/ui";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";

const selectClass = "h-9 w-full rounded-md border bg-surface px-3 text-sm text-text";

export function MemberDirectoryScreen() {
  const organisationId = useUIStore((s) => s.organisationId) ?? undefined;
  const { data: organisations } = useOrganisations();
  const { data: members, isLoading } = useMembers(organisationId);
  const { data: roles } = useRoles(organisationId);
  const createInvitation = useCreateInvitation();
  const [query, setQuery] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");

  const organisation = organisations?.find((o) => o.id === organisationId);
  const filtered = (members ?? []).filter(
    (m) => !query.trim() || m.userId.toLowerCase().includes(query.trim().toLowerCase()) || m.role.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const external = filtered.filter((m) => /client|external/i.test(m.role.name));
  const internal = filtered.filter((m) => !/client|external/i.test(m.role.name));

  function invite() {
    if (!organisationId || !email.trim() || !roleId) return;
    createInvitation.mutate(
      { organisationId, email: email.trim(), roleId },
      { onSuccess: () => { setInviteOpen(false); setEmail(""); setRoleId(""); } },
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-text">Members</h1>
            <p className="text-xs text-text-muted">{organisation?.name ?? "Organisation"}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" />
          Invite member
        </Button>
      </header>
      <div className="border-b px-6 py-3">
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search members or roles" className="max-w-sm" />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <p className="text-sm text-text-muted">Loading members…</p>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="No members found" description="Try a different search or invite someone to this organisation." />
        ) : (
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Internal ({internal.length})</p>
              <div className="overflow-hidden rounded-lg border">
                {internal.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{member.userId.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-sm text-text">{member.userId}</span>
                    <Badge variant="secondary" className="capitalize">{member.role.name}</Badge>
                  </div>
                ))}
                {internal.length === 0 ? <p className="px-4 py-6 text-center text-sm text-text-muted">No internal members.</p> : null}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">External collaborators ({external.length})</p>
              <div className="overflow-hidden rounded-lg border border-warning/40">
                {external.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>{member.userId.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-sm text-text">{member.userId}</span>
                    <Badge variant="warning">External</Badge>
                    <Badge variant="secondary" className="capitalize">{member.role.name}</Badge>
                  </div>
                ))}
                {external.length === 0 ? <p className="px-4 py-6 text-center text-sm text-text-muted">No external collaborators.</p> : null}
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md p-0">
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
            <DialogDescription>Send an invitation to join {organisation?.name ?? "this organisation"}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-4 pb-4">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" autoFocus />
            <select className={selectClass} value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              <option value="">Select a role</option>
              {roles?.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
            {createInvitation.error ? <p className="text-sm text-error">{createInvitation.error.message}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button onClick={invite} disabled={!email.trim() || !roleId || createInvitation.isPending}>
                {createInvitation.isPending ? "Sending…" : "Send invitation"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
