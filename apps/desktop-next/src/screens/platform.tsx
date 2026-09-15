import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Mail,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@teamspace-one/ui/badge";
import { Input } from "@teamspace-one/ui/input";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { PageHeader } from "./hr/common";
import { AccessDeniedScreen } from "./access-denied";
import { cn } from "@/lib/utils";
import { useMyContext } from "@/hooks/usePermissions";
import {
  usePlatformOrganisation,
  usePlatformOrganisationInvitations,
  usePlatformOrganisationMembers,
  usePlatformOrganisations,
  usePlatformOverview,
} from "@/hooks/api";
import type {
  PlatformInvitation,
  PlatformMember,
  PlatformOrganisationSummary,
} from "@/lib/api";

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function displayName(member: PlatformMember) {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
  return name || member.email || member.userId;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "accepted":
      return "bg-success/10 text-success";
    case "pending":
      return "bg-warning/10 text-warning";
    case "revoked":
    case "expired":
      return "bg-error/10 text-error";
    default:
      return "bg-surface-elevated text-text-muted";
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: LucideIcon;
  label: string;
  value?: number;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface p-5">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-subtle text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs font-medium text-text-secondary">{label}</div>
        {loading ? (
          <Skeleton className="mt-1 h-6 w-12" />
        ) : (
          <div className="mt-0.5 text-xl font-semibold text-text">{value ?? "—"}</div>
        )}
      </div>
    </div>
  );
}

function MemberStatusBadges({ member }: { member: PlatformMember }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      {member.isOwner ? (
        <span className="rounded bg-primary-subtle px-1.5 py-0.5 text-[11px] font-medium text-primary">
          Owner
        </span>
      ) : null}
      {member.isGuest ? (
        <span className="rounded bg-mention/10 px-1.5 py-0.5 text-[11px] font-medium text-mention">
          Guest
        </span>
      ) : null}
      {member.active === false ? (
        <span className="rounded bg-error/10 px-1.5 py-0.5 text-[11px] font-medium text-error">
          Deactivated
        </span>
      ) : member.active === true ? (
        <span className="rounded bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
          Active
        </span>
      ) : null}
    </span>
  );
}

function MembersTab({ organisationId }: { organisationId: string }) {
  const { data, isLoading, error } = usePlatformOrganisationMembers(organisationId);

  if (isLoading) {
    return <div className="px-5 py-10 text-center text-sm text-text-muted">Loading members…</div>;
  }
  if (error) {
    return (
      <div className="px-5 py-10 text-center text-sm text-error">
        Failed to load members: {error.message}
      </div>
    );
  }
  const members = data?.members ?? [];
  if (members.length === 0) {
    return <div className="px-5 py-10 text-center text-sm text-text-muted">No members.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
            <th className="px-5 py-3 font-medium">Member</th>
            <th className="px-5 py-3 font-medium">Role</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Joined</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {members.map((member) => (
            <tr key={member.membershipId}>
              <td className="px-5 py-3">
                <p className="font-medium text-text">{displayName(member)}</p>
                <p className="text-xs text-text-muted">{member.email ?? member.userId}</p>
              </td>
              <td className="px-5 py-3">
                <span className="flex flex-wrap items-center gap-1">
                  <Badge variant="secondary" className="capitalize">
                    {(member.role?.name ?? "—").replace(/_/g, " ")}
                  </Badge>
                  {member.extraRoles.map((role) => (
                    <Badge key={role.id} variant="mention" className="capitalize">
                      {role.name.replace(/_/g, " ")}
                    </Badge>
                  ))}
                </span>
              </td>
              <td className="px-5 py-3">
                <MemberStatusBadges member={member} />
              </td>
              <td className="px-5 py-3 text-text-secondary">{formatDate(member.joinedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(data?.total ?? 0) > members.length ? (
        <p className="border-t border-border px-5 py-3 text-xs text-text-muted">
          Showing first {members.length} of {data?.total} members.
        </p>
      ) : null}
    </div>
  );
}

function InvitationsTab({ organisationId }: { organisationId: string }) {
  const { data, isLoading, error } = usePlatformOrganisationInvitations(organisationId);

  if (isLoading) {
    return <div className="px-5 py-10 text-center text-sm text-text-muted">Loading invitations…</div>;
  }
  if (error) {
    return (
      <div className="px-5 py-10 text-center text-sm text-error">
        Failed to load invitations: {error.message}
      </div>
    );
  }
  const invitations = data?.invitations ?? [];
  if (invitations.length === 0) {
    return <div className="px-5 py-10 text-center text-sm text-text-muted">No invitations.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
            <th className="px-5 py-3 font-medium">Email</th>
            <th className="px-5 py-3 font-medium">Role</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Expires</th>
            <th className="px-5 py-3 font-medium">Sent</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {invitations.map((invitation: PlatformInvitation) => (
            <tr key={invitation.id}>
              <td className="px-5 py-3 font-medium text-text">{invitation.email}</td>
              <td className="px-5 py-3 capitalize text-text-secondary">
                {(invitation.roleName ?? "—").replace(/_/g, " ")}
              </td>
              <td className="px-5 py-3">
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[11px] font-medium capitalize",
                    statusBadgeClass(invitation.status),
                  )}
                >
                  {invitation.status}
                </span>
              </td>
              <td className="px-5 py-3 text-text-secondary">{formatDate(invitation.expiresAt)}</td>
              <td className="px-5 py-3 text-text-secondary">{formatDate(invitation.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrganisationDetail({
  organisationId,
  onBack,
}: {
  organisationId: string;
  onBack: () => void;
}) {
  const { data: org, isLoading, error } = usePlatformOrganisation(organisationId);
  const [tab, setTab] = useState<"members" | "invitations">("members");

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-text-secondary hover:text-text"
        >
          <ArrowLeft className="h-4 w-4" /> Back to organisations
        </button>
        <div className="mt-6 rounded-lg border border-border bg-surface px-5 py-16 text-center text-sm text-error">
          Failed to load organisation: {error.message}
        </div>
      </div>
    );
  }

  const invitationTotal = org
    ? Object.values(org.counts.invitations).reduce((sum, n) => sum + n, 0)
    : 0;

  return (
    <div className="p-4 sm:p-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-text-secondary hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> Back to organisations
      </button>

      <div className="mt-4 rounded-lg border border-border bg-surface p-5">
        {isLoading || !org ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-text">{org.name}</h1>
                <p className="mt-0.5 text-sm text-text-muted">
                  {org.slug} · created {formatDate(org.createdAt)}
                </p>
              </div>
              <div className="text-right text-sm">
                <p className="text-xs uppercase tracking-wide text-text-muted">Owner</p>
                <p className="font-medium text-text">{org.owner.name ?? org.owner.email ?? "—"}</p>
                {org.owner.email ? (
                  <p className="text-xs text-text-muted">{org.owner.email}</p>
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded bg-surface-elevated px-2 py-1 font-medium text-text-secondary">
                {org.counts.members} members
              </span>
              <span className="rounded bg-surface-elevated px-2 py-1 font-medium text-text-secondary">
                {invitationTotal} invitations
              </span>
              <span className="rounded bg-surface-elevated px-2 py-1 font-medium text-text-secondary">
                {org.counts.roles} roles
              </span>
              <span className="rounded bg-surface-elevated px-2 py-1 font-medium text-text-secondary">
                {org.counts.workspaces} workspaces
              </span>
              <span className="rounded bg-surface-elevated px-2 py-1 font-medium text-text-secondary">
                {org.counts.clients} clients
              </span>
              <span className="rounded bg-surface-elevated px-2 py-1 font-medium text-text-secondary">
                {org.counts.tickets} tickets
              </span>
              <span className="rounded bg-surface-elevated px-2 py-1 font-medium text-text-secondary">
                {org.counts.assets} assets
              </span>
            </div>
          </>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex items-center gap-1 border-b border-border px-3 pt-3">
          {(["members", "invitations"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "rounded-t-md px-4 py-2 text-sm font-medium capitalize",
                tab === key
                  ? "bg-surface-elevated text-text"
                  : "text-text-secondary hover:text-text",
              )}
            >
              {key}
            </button>
          ))}
        </div>
        {tab === "members" ? (
          <MembersTab organisationId={organisationId} />
        ) : (
          <InvitationsTab organisationId={organisationId} />
        )}
      </div>
    </div>
  );
}

function OrganisationRow({
  org,
  onSelect,
}: {
  org: PlatformOrganisationSummary;
  onSelect: () => void;
}) {
  return (
    <tr
      onClick={onSelect}
      className="cursor-pointer transition-colors hover:bg-surface-elevated/50"
    >
      <td className="px-5 py-3">
        <p className="font-medium text-text">{org.name}</p>
        <p className="text-xs text-text-muted">{org.slug}</p>
      </td>
      <td className="px-5 py-3">
        <p className="text-text">{org.owner.name ?? org.owner.email ?? "—"}</p>
        {org.owner.name && org.owner.email ? (
          <p className="text-xs text-text-muted">{org.owner.email}</p>
        ) : null}
      </td>
      <td className="px-5 py-3 text-text-secondary">{org.memberCount}</td>
      <td className="px-5 py-3">
        {org.pendingInvitations > 0 ? (
          <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning">
            {org.pendingInvitations} pending
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
      <td className="px-5 py-3 text-text-secondary">{formatDate(org.createdAt)}</td>
    </tr>
  );
}

export function PlatformScreen() {
  const { data: myContext, isLoading: contextLoading } = useMyContext();
  const isPlatform = Boolean(myContext?.isPlatformOrganisation);

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const enabled = isPlatform && !selectedOrgId;
  const { data: overview, isLoading: overviewLoading } = usePlatformOverview(isPlatform);
  const { data: orgsData, isLoading, error } = usePlatformOrganisations(search || undefined, enabled);

  const organisations = useMemo(() => orgsData?.organisations ?? [], [orgsData]);

  if (!contextLoading && !isPlatform) {
    return <AccessDeniedScreen />;
  }

  if (selectedOrgId) {
    return (
      <OrganisationDetail
        organisationId={selectedOrgId}
        onBack={() => setSelectedOrgId(null)}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <PageHeader title="Platform Administration" />

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Organisations" value={overview?.organisations} loading={overviewLoading} />
        <StatCard icon={Users} label="Total Members" value={overview?.members} loading={overviewLoading} />
        <StatCard icon={Mail} label="Pending Invitations" value={overview?.pendingInvitations} loading={overviewLoading} />
        <StatCard icon={CalendarDays} label="New Orgs (30d)" value={overview?.recentOrganisations} loading={overviewLoading} />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-base font-semibold text-text">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Registered Organisations
            {orgsData ? (
              <span className="text-xs font-normal text-text-muted">({orgsData.total})</span>
            ) : null}
          </h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name or slug…"
              className="h-8 w-56 pl-8 text-xs"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="px-5 py-16 text-center text-sm text-text-muted">
            Loading organisations…
          </div>
        ) : error ? (
          <div className="px-5 py-16 text-center text-sm text-error">
            Failed to load organisations: {error.message}
          </div>
        ) : organisations.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={UserRound}
              title="No organisations found"
              description={search ? `No organisations match "${search}".` : "No organisations have registered yet."}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
                  <th className="px-5 py-3 font-medium">Organisation</th>
                  <th className="px-5 py-3 font-medium">Owner</th>
                  <th className="px-5 py-3 font-medium">Members</th>
                  <th className="px-5 py-3 font-medium">Invitations</th>
                  <th className="px-5 py-3 font-medium">Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {organisations.map((org) => (
                  <OrganisationRow
                    key={org.id}
                    org={org}
                    onSelect={() => setSelectedOrgId(org.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
