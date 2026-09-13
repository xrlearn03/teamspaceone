import { useMemo, useState } from "react";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Eye,
  FileText,
  LayoutGrid,
  List,
  Mail,
  MailPlus,
  MessageSquare,
  MoreHorizontal,
  Package,
  PackagePlus,
  Phone,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  useAssets,
  useAssignAsset,
  useChannels,
  useCreateDirectChannel,
  useCreateInvitation,
  useEmployeeDocuments,
  useEmployees,
  useInviteMember,
  useInvitations,
  useLeaveRequests,
  useMe,
  useMembers,
  useOrganisations,
  useRemoveMember,
  useResendInvitation,
  useRevokeInvitation,
  useRoles,
  useUpdateMemberRole,
  useUsers,
} from "../hooks/api";
import { usePermissions } from "../hooks/usePermissions";
import { useDevice } from "../hooks/useDevice";
import { useUIStore } from "../stores/ui";
import { Badge } from "@teamspace-one/ui/badge";
import { Button } from "@teamspace-one/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@teamspace-one/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@teamspace-one/ui/dropdown-menu";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Input } from "@teamspace-one/ui/input";
import { FilterDropdown, Pagination, type FilterOption } from "./hr/common";
import { SectionError, SectionSkeleton, formatDate } from "./hrms/common";
import { UserAvatar } from "../components/user-avatar";
import { cn, getUserDisplayName } from "../lib/utils";
import {
  ADMIN_MANAGED_ROLE_CATEGORIES,
  downloadFile,
  type Asset,
  type Employee,
  type Invitation,
  type OrganisationMember,
  type OrganisationRole,
  type RoleCategory,
  type UserDto,
} from "../lib/api";

const NEW_JOINER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

const selectClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text";

function formatRoleName(name: string) {
  return name.toLowerCase() === "owner"
    ? "super admin"
    : name.replace(/_/g, " ");
}

function isExternalRole(role: OrganisationMember["role"]) {
  return (
    role.roleCategory === "external" ||
    role.roleCategory === "guest" ||
    /client|external/i.test(role.name)
  );
}

/* =========================================================
   Row model — members + pending invitations flattened into
   a single list the table/grid/filters all operate on.
========================================================= */

type RowStatus = "active" | "inactive" | "on_leave" | "terminated" | "invited";

interface DirectoryRow {
  key: string;
  kind: "member" | "invite";
  member?: OrganisationMember;
  invitation?: Invitation;
  user?: UserDto;
  employee?: Employee;
  name: string;
  email: string;
  roleName: string;
  department?: string;
  designation?: string;
  location?: string;
  status: RowStatus;
  joinedAt?: string | null;
  assets: Asset[];
  external: boolean;
  recent: boolean;
  self: boolean;
  owner: boolean;
}

const STATUS_META: Record<RowStatus, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-success/10 text-success" },
  inactive: { label: "Inactive", className: "bg-surface-elevated text-text-muted" },
  on_leave: { label: "On Leave", className: "bg-info/10 text-info" },
  terminated: { label: "Exited", className: "bg-error/10 text-error" },
  invited: { label: "Invited", className: "bg-warning/10 text-warning" },
};

function StatusPill({ status }: { status: RowStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium",
        meta.className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  );
}

/* =========================================================
   Tabs
========================================================= */

type TabId =
  | "all"
  | "active"
  | "inactive"
  | "on_leave"
  | "new"
  | "terminated"
  | "invited"
  | "external";

const TABS: { id: TabId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "inactive", label: "Inactive" },
  { id: "on_leave", label: "On Leave" },
  { id: "new", label: "New Joiners" },
  { id: "terminated", label: "Exits" },
  { id: "invited", label: "Invited" },
  { id: "external", label: "External" },
];

function tabMatches(tab: TabId, row: DirectoryRow) {
  switch (tab) {
    case "all":
      return true;
    case "new":
      return row.recent;
    case "external":
      return row.external;
    default:
      return row.status === tab;
  }
}

/* =========================================================
   Stat card
========================================================= */

function StatCard({
  icon: Icon,
  label,
  value,
  iconClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  iconClass: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-surface p-4">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
          iconClass,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-xs text-text-muted">{label}</p>
        <p className="mt-0.5 text-xl font-semibold text-text">{value}</p>
      </div>
    </div>
  );
}

/* =========================================================
   Details panel (right rail on wide screens, dialog body on
   narrow ones)
========================================================= */

function InfoRow({
  label,
  value,
  accent = false,
}: {
  label: string;
  value?: string | null;
  accent?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-xs text-text-muted">{label}</span>
      <span
        className={cn(
          "break-all text-right text-xs",
          accent ? "text-primary" : "text-text",
        )}
      >
        {value && value.trim() !== "" ? value : "—"}
      </span>
    </div>
  );
}

function DocumentsTab({ employee }: { employee: Employee }) {
  const docs = useEmployeeDocuments(employee.id);
  const [downloading, setDownloading] = useState<string | null>(null);

  function open(docFileId: string, docId: string) {
    setDownloading(docId);
    downloadFile(docFileId)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      })
      .finally(() => setDownloading(null));
  }

  if (docs.isLoading) return <SectionSkeleton rows={2} />;
  if (docs.isError)
    return (
      <p className="py-4 text-center text-xs text-text-muted">
        Could not load documents.
      </p>
    );
  const list = docs.data ?? [];
  if (list.length === 0)
    return (
      <p className="py-4 text-center text-xs text-text-muted">
        No documents on file.
      </p>
    );
  return (
    <div className="space-y-2">
      {list.map((doc) => (
        <button
          key={doc.id}
          type="button"
          onClick={() => open(doc.fileId, doc.id)}
          disabled={downloading === doc.id}
          className="flex w-full items-center gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:border-primary/40"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-text">
              {doc.name ?? "Document"}
            </p>
            <p className="mt-0.5 text-[10px] capitalize text-text-muted">
              {doc.category ?? "document"} · {formatDate(doc.createdAt)}
            </p>
          </div>
          <span className="text-[10px] text-text-muted">
            {downloading === doc.id ? "Opening…" : "Open"}
          </span>
        </button>
      ))}
    </div>
  );
}

type PanelTab = "overview" | "employment" | "documents" | "access";

function MemberDetails({
  row,
  roles,
  canManage,
  canAssign,
  onMessage,
  onAssignAsset,
  onChangeRole,
  onRemove,
  onResend,
  onRevoke,
  actionPending,
}: {
  row: DirectoryRow;
  roles: OrganisationRole[];
  canManage: boolean;
  canAssign: boolean;
  onMessage: () => void;
  onAssignAsset: () => void;
  onChangeRole: () => void;
  onRemove: () => void;
  onResend: () => void;
  onRevoke: () => void;
  actionPending: boolean;
}) {
  const [tab, setTab] = useState<PanelTab>("overview");
  const employee = row.employee;
  const role = roles.find((r) => r.id === row.member?.role.id);
  const manager = employee?.manager
    ? `${employee.manager.firstName ?? ""} ${employee.manager.lastName ?? ""}`.trim()
    : undefined;

  const tabs: { id: PanelTab; label: string; hidden?: boolean }[] = [
    { id: "overview", label: "Overview" },
    { id: "employment", label: "Employment", hidden: row.kind !== "member" },
    { id: "documents", label: "Documents", hidden: !employee },
    { id: "access", label: "Access" },
  ];
  const visibleTabs = tabs.filter((t) => !t.hidden);
  const activeTab = visibleTabs.some((t) => t.id === tab) ? tab : "overview";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Profile */}
      <div className="border-b border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar user={row.user} className="h-16 w-16" />
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-text">
                {row.name}
              </h2>
              <p className="mt-0.5 truncate text-xs capitalize text-text-secondary">
                {row.designation || row.roleName}
              </p>
            </div>
          </div>
          <StatusPill status={row.status} />
        </div>

        <div className="mt-4 flex items-center gap-2">
          {row.kind === "member" && !row.self ? (
            <button
              type="button"
              onClick={onMessage}
              title="Message"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-text-secondary transition-colors hover:bg-primary-subtle hover:text-primary"
            >
              <MessageSquare className="h-4 w-4" />
            </button>
          ) : null}
          <a
            href={`mailto:${row.email}`}
            title="Email"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-text-secondary transition-colors hover:bg-primary-subtle hover:text-primary"
          >
            <Mail className="h-4 w-4" />
          </a>
          {employee?.phone ? (
            <a
              href={`tel:${employee.phone}`}
              title="Call"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-text-secondary transition-colors hover:bg-primary-subtle hover:text-primary"
            >
              <Phone className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 border-b border-border">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "relative flex-1 py-3 text-[11px] font-medium",
              activeTab === t.id ? "text-text" : "text-text-muted hover:text-text",
            )}
          >
            {t.label}
            {activeTab === t.id ? (
              <span className="absolute inset-x-3 bottom-0 h-0.5 bg-primary" />
            ) : null}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {activeTab === "overview" ? (
          <>
            <InfoRow label="Email" value={row.email} accent />
            <InfoRow label="Phone" value={employee?.phone} />
            <InfoRow label="Department" value={row.department} />
            <InfoRow label="Reporting to" value={manager} />
            <InfoRow label="Location" value={row.location} />
            <InfoRow label="Joined" value={formatDate(row.joinedAt)} />
            <InfoRow
              label="Employment type"
              value={employee?.employmentType?.replace(/_/g, " ")}
            />
            <InfoRow label="Org role" value={row.roleName} />

            <div className="border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-text-muted">Assets</span>
                <Badge variant="secondary">{row.assets.length}</Badge>
              </div>
              {row.assets.length === 0 ? (
                <p className="text-xs text-text-muted">No assets assigned.</p>
              ) : (
                <div className="space-y-2">
                  {row.assets.map((asset) => (
                    <div
                      key={asset.id}
                      className="flex items-center gap-3 rounded-lg border border-border bg-surface p-3"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                        <Package className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-text">
                          {asset.name}
                        </p>
                        <p className="mt-0.5 text-[10px] capitalize text-text-muted">
                          {[asset.category, asset.assetTag]
                            .filter(Boolean)
                            .join(" · ") || "asset"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}

        {activeTab === "employment" ? (
          employee ? (
            <>
              <InfoRow label="Employee no" value={employee.employeeNumber} />
              <InfoRow
                label="Employment type"
                value={employee.employmentType?.replace(/_/g, " ")}
              />
              <InfoRow label="Joining date" value={formatDate(employee.joiningDate)} />
              <InfoRow label="Department" value={row.department} />
              <InfoRow label="Designation" value={row.designation} />
              <InfoRow label="Reporting to" value={manager} />
              <InfoRow label="Work email" value={employee.workEmail} accent />
              <InfoRow label="HR status" value={employee.status} />
            </>
          ) : (
            <p className="py-4 text-center text-xs text-text-muted">
              No employee record is linked to this user.
            </p>
          )
        ) : null}

        {activeTab === "documents" && employee ? (
          <DocumentsTab employee={employee} />
        ) : null}

        {activeTab === "access" ? (
          <>
            <InfoRow label="Org role" value={row.roleName} />
            <InfoRow
              label="Role category"
              value={row.member?.role.roleCategory ?? undefined}
            />
            {role ? (
              <>
                <InfoRow
                  label="Permissions"
                  value={String(role.rolePermissions?.length ?? 0)}
                />
                <InfoRow
                  label="Data scopes"
                  value={String(role.roleScopes?.length ?? 0)}
                />
              </>
            ) : null}
            <InfoRow
              label="Account"
              value={
                row.kind === "invite"
                  ? "Invitation pending"
                  : row.user
                    ? row.user.active
                      ? "Active"
                      : "Deactivated"
                    : undefined
              }
            />
            <InfoRow
              label="Member since"
              value={formatDate(row.member?.createdAt)}
            />
          </>
        ) : null}

        {/* Quick actions */}
        <div className="border-t border-border pt-4">
          <h3 className="mb-3 text-xs font-semibold text-text">Quick actions</h3>
          {row.kind === "invite" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onResend}
                disabled={!canManage || actionPending}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface text-xs font-medium text-text transition-colors hover:bg-surface-elevated disabled:opacity-50"
              >
                <MailPlus className="h-3.5 w-3.5" />
                Resend invite
              </button>
              <button
                type="button"
                onClick={onRevoke}
                disabled={!canManage || actionPending}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-error/30 bg-error/5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
              >
                <XCircle className="h-3.5 w-3.5" />
                Revoke invite
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {!row.self ? (
                  <button
                    type="button"
                    onClick={onMessage}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface text-xs font-medium text-text transition-colors hover:bg-surface-elevated"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Message
                  </button>
                ) : null}
                <a
                  href={`mailto:${row.email}`}
                  className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface text-xs font-medium text-text transition-colors hover:bg-surface-elevated"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </a>
                {canAssign ? (
                  <button
                    type="button"
                    onClick={onAssignAsset}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface text-xs font-medium text-text transition-colors hover:bg-surface-elevated"
                  >
                    <PackagePlus className="h-3.5 w-3.5" />
                    Assign asset
                  </button>
                ) : null}
                {canManage && !row.owner ? (
                  <button
                    type="button"
                    onClick={onChangeRole}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface text-xs font-medium text-text transition-colors hover:bg-surface-elevated"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Change role
                  </button>
                ) : null}
              </div>
              {canManage && !row.owner && !row.self ? (
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={actionPending}
                  className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-error/30 bg-error/5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove member
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Dialogs
========================================================= */

const INVITABLE_INTERNAL: RoleCategory[] = [
  "administrative",
  "managerial",
  "member",
];

function InviteMemberDialog({
  open,
  onOpenChange,
  external,
  roles,
  organisationId,
  organisationName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  external: boolean;
  roles: OrganisationRole[];
  organisationId?: string;
  organisationName?: string;
}) {
  const inviteMember = useInviteMember();
  const createInvitation = useCreateInvitation();
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");

  const externalRoles = roles.filter(
    (r) => r.roleCategory === "external" || r.roleCategory === "guest",
  );
  const internalRoles = roles.filter((r) =>
    INVITABLE_INTERNAL.includes(r.roleCategory),
  );
  const options = external ? externalRoles : internalRoles;
  const pending = inviteMember.isPending || createInvitation.isPending;
  const error = inviteMember.error ?? createInvitation.error;

  function close(next: boolean) {
    if (!next) {
      setEmail("");
      setRoleId("");
    }
    onOpenChange(next);
  }

  function submit() {
    if (!organisationId || !email.trim() || !roleId) return;
    const args = { organisationId, email: email.trim(), roleId };
    const mutation = external ? createInvitation : inviteMember;
    mutation.mutate(args, { onSuccess: () => close(false) });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>
            {external ? "Invite external collaborator" : "Invite member"}
          </DialogTitle>
          <DialogDescription>
            {external
              ? `Invite a client or guest to ${organisationName ?? "this organisation"} with limited external access.`
              : `Send an invitation to join ${organisationName ?? "this organisation"}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
            autoFocus
          />
          <select
            className={selectClass}
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            <option value="">Select a role</option>
            {options.map((role) => (
              <option key={role.id} value={role.id}>
                {formatRoleName(role.name)}
              </option>
            ))}
          </select>
          {error ? <p className="text-sm text-error">{error.message}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!email.trim() || !roleId || pending}>
              {pending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangeRoleDialog({
  open,
  onOpenChange,
  row,
  roles,
  organisationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: DirectoryRow | null;
  roles: OrganisationRole[];
  organisationId?: string;
}) {
  const updateMemberRole = useUpdateMemberRole();
  const [roleId, setRoleId] = useState("");
  const options = roles.filter(
    (r) =>
      ADMIN_MANAGED_ROLE_CATEGORIES.includes(r.roleCategory) ||
      r.id === row?.member?.role.id,
  );

  function submit() {
    if (!organisationId || !row?.member || !roleId) return;
    updateMemberRole.mutate(
      { organisationId, membershipId: row.member.id, roleId },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Update {row?.name ?? "this member"}'s organisation role.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          <select
            className={selectClass}
            value={roleId || row?.member?.role.id || ""}
            onChange={(e) => setRoleId(e.target.value)}
          >
            {options.map((role) => (
              <option key={role.id} value={role.id}>
                {formatRoleName(role.name)}
              </option>
            ))}
          </select>
          {updateMemberRole.error ? (
            <p className="text-sm text-error">{updateMemberRole.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={
                !roleId ||
                roleId === row?.member?.role.id ||
                updateMemberRole.isPending
              }
            >
              {updateMemberRole.isPending ? "Saving…" : "Save role"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AssignAssetDialog({
  open,
  onOpenChange,
  row,
  organisationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: DirectoryRow | null;
  organisationId?: string;
}) {
  const assetsQuery = useAssets(organisationId, { status: "available" });
  const assign = useAssignAsset();
  const [assetId, setAssetId] = useState("");
  const [notes, setNotes] = useState("");
  const available = (assetsQuery.data ?? []).filter((a) => !a.currentAssignment);

  function close(next: boolean) {
    if (!next) {
      setAssetId("");
      setNotes("");
    }
    onOpenChange(next);
  }

  function submit() {
    if (!organisationId || !row?.member || !assetId) return;
    assign.mutate(
      {
        organisationId,
        id: assetId,
        userId: row.member.userId,
        notes: notes.trim() || undefined,
      },
      { onSuccess: () => close(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md p-0">
        <DialogHeader>
          <DialogTitle>Assign asset</DialogTitle>
          <DialogDescription>
            Assign an available asset to {row?.name ?? "this member"}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 px-4 pb-4">
          <select
            className={selectClass}
            value={assetId}
            onChange={(e) => setAssetId(e.target.value)}
            disabled={assetsQuery.isLoading}
          >
            <option value="">
              {assetsQuery.isLoading
                ? "Loading assets…"
                : available.length === 0
                  ? "No available assets"
                  : "Select an asset"}
            </option>
            {available.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name}
                {asset.assetTag ? ` (${asset.assetTag})` : ""}
              </option>
            ))}
          </select>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
          />
          {assign.error ? (
            <p className="text-sm text-error">{assign.error.message}</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!assetId || assign.isPending}>
              {assign.isPending ? "Assigning…" : "Assign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================
   Row actions menu (the 3-dots button)
========================================================= */

function RowActionsMenu({
  row,
  canManage,
  canAssign,
  onView,
  onMessage,
  onAssignAsset,
  onChangeRole,
  onRemove,
  onResend,
  onRevoke,
}: {
  row: DirectoryRow;
  canManage: boolean;
  canAssign: boolean;
  onView: () => void;
  onMessage: () => void;
  onAssignAsset: () => void;
  onChangeRole: () => void;
  onRemove: () => void;
  onResend: () => void;
  onRevoke: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-elevated text-text-muted transition-colors hover:text-text"
          aria-label="Member actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onView}>
          <Eye className="mr-2 h-3.5 w-3.5 text-text-muted" />
          View details
        </DropdownMenuItem>
        {row.kind === "member" ? (
          <>
            {!row.self ? (
              <DropdownMenuItem onClick={onMessage}>
                <MessageSquare className="mr-2 h-3.5 w-3.5 text-text-muted" />
                Message
              </DropdownMenuItem>
            ) : null}
            {canAssign ? (
              <DropdownMenuItem onClick={onAssignAsset}>
                <PackagePlus className="mr-2 h-3.5 w-3.5 text-text-muted" />
                Assign asset
              </DropdownMenuItem>
            ) : null}
            {canManage && !row.owner ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onChangeRole}>
                  <ShieldCheck className="mr-2 h-3.5 w-3.5 text-text-muted" />
                  Change role
                </DropdownMenuItem>
                {!row.self ? (
                  <DropdownMenuItem onClick={onRemove} className="text-error">
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Remove member
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}
          </>
        ) : canManage ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onResend}>
              <MailPlus className="mr-2 h-3.5 w-3.5 text-text-muted" />
              Resend invite
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRevoke} className="text-error">
              <XCircle className="mr-2 h-3.5 w-3.5" />
              Revoke invite
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* =========================================================
   Main screen
========================================================= */

export function MemberDirectoryScreen() {
  const organisationId = useUIStore((s) => s.organisationId) ?? undefined;
  const setActiveView = useUIStore((s) => s.setActiveView);
  const { can } = usePermissions();
  const { width } = useDevice();
  const wideLayout = width >= 1536;

  const { data: me } = useMe();
  const { data: organisations } = useOrganisations();
  const membersQuery = useMembers(organisationId);
  const { data: roles } = useRoles(organisationId);
  const { data: invitations } = useInvitations(organisationId);
  const employeesQuery = useEmployees();
  const assetsQuery = useAssets(organisationId);
  const leaveQuery = useLeaveRequests({ status: "approved" });
  const { data: channels } = useChannels();
  const createDirectChannel = useCreateDirectChannel();
  const removeMember = useRemoveMember();
  const resendInvitation = useResendInvitation();
  const revokeInvitation = useRevokeInvitation();

  const [tab, setTab] = useState<TabId>("all");
  const [department, setDepartment] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [assetType, setAssetType] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [invite, setInvite] = useState<{ open: boolean; external: boolean }>({
    open: false,
    external: false,
  });
  const [roleDialogRow, setRoleDialogRow] = useState<DirectoryRow | null>(null);
  const [assignRow, setAssignRow] = useState<DirectoryRow | null>(null);

  const members = membersQuery.data ?? [];
  const memberUserIds = useMemo(
    () => [...new Set(members.map((m) => m.userId))],
    [members],
  );
  const usersQuery = useUsers(memberUserIds);
  const userMap = useMemo(
    () => new Map((usersQuery.data ?? []).map((u) => [u.id, u])),
    [usersQuery.data],
  );

  const employees = employeesQuery.data ?? [];
  const employeeByUserId = useMemo(
    () => new Map(employees.map((e) => [e.userId, e])),
    [employees],
  );

  const assetsByUserId = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const asset of assetsQuery.data ?? []) {
      const assignee = asset.currentAssignment?.assigneeUserId;
      if (!assignee) continue;
      const list = map.get(assignee) ?? [];
      list.push(asset);
      map.set(assignee, list);
    }
    return map;
  }, [assetsQuery.data]);

  const onLeaveEmployeeIds = useMemo(() => {
    const now = Date.now();
    const ids = new Set<string>();
    for (const leave of leaveQuery.data ?? []) {
      const start = new Date(leave.startDate).getTime();
      const end = new Date(leave.endDate).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end) && start <= now && now <= end) {
        ids.add(leave.employeeId);
      }
    }
    return ids;
  }, [leaveQuery.data]);

  const roleById = useMemo(
    () => new Map((roles ?? []).map((r) => [r.id, r])),
    [roles],
  );

  const rows = useMemo<DirectoryRow[]>(() => {
    const now = Date.now();
    const list: DirectoryRow[] = members.map((m) => {
      const user = userMap.get(m.userId);
      const employee = employeeByUserId.get(m.userId);
      let status: RowStatus = "active";
      if (employee?.status === "terminated") status = "terminated";
      else if (user && !user.active) status = "inactive";
      else if (employee && onLeaveEmployeeIds.has(employee.id))
        status = "on_leave";
      return {
        key: `m:${m.id}`,
        kind: "member",
        member: m,
        user,
        employee,
        name: getUserDisplayName(user, user?.email ?? m.userId),
        email: user?.email ?? "",
        roleName: formatRoleName(m.role.name),
        department:
          employee?.departmentName ?? employee?.department?.name ?? undefined,
        designation:
          employee?.designationName ??
          employee?.designation?.title ??
          employee?.designation?.name ??
          undefined,
        location: employee?.address ?? undefined,
        status,
        joinedAt: m.createdAt,
        assets: assetsByUserId.get(m.userId) ?? [],
        external: isExternalRole(m.role),
        recent:
          Boolean(m.createdAt) &&
          now - new Date(m.createdAt).getTime() < NEW_JOINER_WINDOW_MS,
        self: m.userId === me?.id,
        owner: m.role.name.toLowerCase() === "owner",
      };
    });
    for (const inv of (invitations ?? []).filter((i) => i.status === "pending")) {
      const role = roleById.get(inv.roleId);
      list.push({
        key: `i:${inv.id}`,
        kind: "invite",
        invitation: inv,
        name: inv.email,
        email: inv.email,
        roleName: role ? formatRoleName(role.name) : "Member",
        status: "invited",
        joinedAt: null,
        assets: [],
        external: role ? isExternalRole({ id: role.id, name: role.name, roleCategory: role.roleCategory }) : false,
        recent: false,
        self: false,
        owner: false,
      });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [
    members,
    invitations,
    userMap,
    employeeByUserId,
    assetsByUserId,
    onLeaveEmployeeIds,
    roleById,
    me,
  ]);

  const stats = useMemo(
    () => ({
      total: rows.filter((r) => r.kind === "member").length,
      active: rows.filter((r) => r.status === "active").length,
      onLeave: rows.filter((r) => r.status === "on_leave").length,
      joiners: rows.filter((r) => r.recent).length,
      invited: rows.filter((r) => r.status === "invited").length,
    }),
    [rows],
  );

  const departmentOptions = useMemo<FilterOption[]>(() => {
    const names = new Set<string>();
    for (const row of rows) if (row.department) names.add(row.department);
    return [
      { value: "", label: "All departments" },
      ...[...names].sort().map((n) => ({ value: n, label: n })),
    ];
  }, [rows]);

  const roleOptions = useMemo<FilterOption[]>(
    () => [
      { value: "", label: "All roles" },
      ...(roles ?? []).map((r) => ({
        value: r.id,
        label: formatRoleName(r.name),
      })),
    ],
    [roles],
  );

  const statusOptions: FilterOption[] = [
    { value: "", label: "All statuses" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "on_leave", label: "On Leave" },
    { value: "terminated", label: "Exited" },
    { value: "invited", label: "Invited" },
  ];

  const assetTypeOptions = useMemo<FilterOption[]>(() => {
    const categories = new Set<string>();
    for (const asset of assetsQuery.data ?? []) {
      if (asset.category) categories.add(asset.category);
    }
    return [
      { value: "", label: "All asset types" },
      ...[...categories].sort().map((c) => ({
        value: c,
        label: c.charAt(0).toUpperCase() + c.slice(1),
      })),
    ];
  }, [assetsQuery.data]);

  const filtered = rows.filter((row) => {
    if (!tabMatches(tab, row)) return false;
    if (department && row.department !== department) return false;
    if (roleFilter) {
      const rid = row.member?.role.id ?? row.invitation?.roleId;
      if (rid !== roleFilter) return false;
    }
    if (statusFilter && row.status !== statusFilter) return false;
    if (
      assetType &&
      !row.assets.some(
        (a) => (a.category ?? "").toLowerCase() === assetType.toLowerCase(),
      )
    )
      return false;
    return true;
  });

  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const safePage = Math.min(page, pages);
  const paged = filtered.slice((safePage - 1) * perPage, safePage * perPage);

  const selectedRow = rows.find((r) => r.key === selectedKey) ?? null;
  const canManage = can("admin.user.manage");
  const canAssignAssets = can("admin.asset.assign");

  const isLoading =
    membersQuery.isLoading ||
    (memberUserIds.length > 0 && usersQuery.isLoading);

  function openDetails(row: DirectoryRow) {
    setSelectedKey(row.key);
    if (!wideLayout) setDetailsOpen(true);
  }

  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === paged.length && paged.length > 0
        ? new Set()
        : new Set(paged.map((r) => r.key)),
    );
  }

  function clearFilters() {
    setDepartment("");
    setRoleFilter("");
    setStatusFilter("");
    setAssetType("");
    setTab("all");
    setPage(1);
  }

  function message(row: DirectoryRow) {
    if (!row.member || !me) return;
    const direct = (channels ?? []).filter((c) => c.type === "direct");
    const existing = direct.find((c) => {
      const others = c.members.filter((m) => m.userId !== me.id);
      return others.length === 1 && others[0].userId === row.member!.userId;
    });
    if (existing) {
      setActiveView("dm", { channelId: existing.id });
      return;
    }
    createDirectChannel.mutate([row.member.userId], {
      onSuccess: (channel) => setActiveView("dm", { channelId: channel.id }),
    });
  }

  function remove(row: DirectoryRow) {
    if (!organisationId || !row.member) return;
    if (window.confirm(`Remove ${row.name} from the organisation?`)) {
      removeMember.mutate(
        { organisationId, membershipId: row.member.id },
        { onSuccess: () => setSelectedKey(null) },
      );
    }
  }

  const organisation = organisations?.find((o) => o.id === organisationId);

  const details = selectedRow ? (
    <MemberDetails
      row={selectedRow}
      roles={roles ?? []}
      canManage={canManage}
      canAssign={canAssignAssets && selectedRow.kind === "member"}
      onMessage={() => message(selectedRow)}
      onAssignAsset={() => setAssignRow(selectedRow)}
      onChangeRole={() => setRoleDialogRow(selectedRow)}
      onRemove={() => remove(selectedRow)}
      onResend={() =>
        organisationId &&
        selectedRow.invitation &&
        resendInvitation.mutate({
          organisationId,
          invitationId: selectedRow.invitation.id,
        })
      }
      onRevoke={() =>
        organisationId &&
        selectedRow.invitation &&
        revokeInvitation.mutate(
          {
            organisationId,
            invitationId: selectedRow.invitation.id,
          },
          { onSuccess: () => setSelectedKey(null) },
        )
      }
      actionPending={
        removeMember.isPending ||
        resendInvitation.isPending ||
        revokeInvitation.isPending ||
        createDirectChannel.isPending
      }
    />
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      {/* Header */}
      <header className="shrink-0 px-4 pb-3 pt-4 sm:px-6">
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <Building2 className="h-3.5 w-3.5" />
          <span>Administration</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-text">Users</span>
        </div>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-text">
              Users
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Manage members of {organisation?.name ?? "this organisation"},
              their access and invitations.
            </p>
          </div>
          {canManage ? (
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => setInvite({ open: true, external: true })}
              >
                <UserPlus className="mr-1.5 h-4 w-4" />
                Invite external
              </Button>
              <Button onClick={() => setInvite({ open: true, external: false })}>
                <UserPlus className="mr-1.5 h-4 w-4" />
                Invite member
              </Button>
            </div>
          ) : null}
        </div>

        {/* Stat cards */}
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-5">
          <StatCard
            icon={Users}
            label="Total Users"
            value={stats.total}
            iconClass="bg-primary-subtle text-primary"
          />
          <StatCard
            icon={UserCheck}
            label="Active"
            value={stats.active}
            iconClass="bg-success/10 text-success"
          />
          <StatCard
            icon={CalendarDays}
            label="On Leave"
            value={stats.onLeave}
            iconClass="bg-info/10 text-info"
          />
          <StatCard
            icon={UserPlus}
            label="New Joiners (30d)"
            value={stats.joiners}
            iconClass="bg-mention/10 text-mention"
          />
          <StatCard
            icon={MailPlus}
            label="Pending Invites"
            value={stats.invited}
            iconClass="bg-warning/10 text-warning"
          />
        </div>
      </header>

      {/* Tabs + view toggle */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5">
          {TABS.map((t) => {
            const count = rows.filter((r) => tabMatches(t.id, r)).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setPage(1);
                }}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === t.id
                    ? "border-primary bg-primary-subtle text-primary"
                    : "border-border bg-surface text-text-secondary hover:text-text",
                )}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">View</span>
          <div className="flex overflow-hidden rounded-lg border border-border bg-surface">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              title="List view"
              className={cn(
                "flex h-8 w-9 items-center justify-center",
                viewMode === "list"
                  ? "bg-primary text-white"
                  : "text-text-muted hover:text-text",
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              title="Grid view"
              className={cn(
                "flex h-8 w-9 items-center justify-center",
                viewMode === "grid"
                  ? "bg-primary text-white"
                  : "text-text-muted hover:text-text",
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-4 sm:px-6 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
          {/* Filters */}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border p-2.5">
            <FilterDropdown
              value={department}
              onChange={(v) => {
                setDepartment(v);
                setPage(1);
              }}
              options={departmentOptions}
            >
              Department
            </FilterDropdown>
            <FilterDropdown
              value={roleFilter}
              onChange={(v) => {
                setRoleFilter(v);
                setPage(1);
              }}
              options={roleOptions}
            >
              Role
            </FilterDropdown>
            <FilterDropdown
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
              options={statusOptions}
            >
              Status
            </FilterDropdown>
            <FilterDropdown
              value={assetType}
              onChange={(v) => {
                setAssetType(v);
                setPage(1);
              }}
              options={assetTypeOptions}
            >
              Asset type
            </FilterDropdown>
            <button
              type="button"
              onClick={clearFilters}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-text-secondary hover:text-text"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>

          {/* List / grid */}
          {isLoading ? (
            <div className="p-5">
              <SectionSkeleton rows={6} />
            </div>
          ) : membersQuery.isError ? (
            <SectionError onRetry={() => membersQuery.refetch()} />
          ) : filtered.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Users}
                title="No members found"
                description="Try changing your filters or invite someone to this organisation."
              />
            </div>
          ) : viewMode === "list" ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[1080px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-surface-elevated">
                  <tr className="h-10 border-b border-border">
                    <th className="w-10 px-3">
                      <button
                        type="button"
                        onClick={toggleAll}
                        aria-label="Select all"
                        className={cn(
                          "flex h-4 w-4 items-center justify-center rounded border",
                          paged.length > 0 &&
                            selected.size === paged.length
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-surface",
                        )}
                      >
                        {paged.length > 0 &&
                        selected.size === paged.length ? (
                          <Check className="h-3 w-3" />
                        ) : null}
                      </button>
                    </th>
                    <th className="w-10 px-2 text-[11px] font-medium text-text-muted">
                      #
                    </th>
                    <th className="px-2 text-[11px] font-medium text-text-muted">
                      User
                    </th>
                    <th className="px-2 text-[11px] font-medium text-text-muted">
                      Department
                    </th>
                    <th className="px-2 text-[11px] font-medium text-text-muted">
                      Designation
                    </th>
                    <th className="px-2 text-[11px] font-medium text-text-muted">
                      Role
                    </th>
                    <th className="px-2 text-[11px] font-medium text-text-muted">
                      Assets
                    </th>
                    <th className="px-2 text-[11px] font-medium text-text-muted">
                      Status
                    </th>
                    <th className="px-2 text-[11px] font-medium text-text-muted">
                      Joined
                    </th>
                    <th className="w-12 px-3 text-[11px] font-medium text-text-muted">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((row, index) => (
                    <tr
                      key={row.key}
                      onClick={() => openDetails(row)}
                      className={cn(
                        "cursor-pointer border-b border-border transition-colors hover:bg-surface-elevated/60",
                        selectedKey === row.key && "bg-primary-subtle/40",
                      )}
                    >
                      <td className="px-3" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => toggleSelect(row.key)}
                          aria-label={`Select ${row.name}`}
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border",
                            selected.has(row.key)
                              ? "border-primary bg-primary text-white"
                              : "border-border bg-surface",
                          )}
                        >
                          {selected.has(row.key) ? (
                            <Check className="h-3 w-3" />
                          ) : null}
                        </button>
                      </td>
                      <td className="px-2 text-xs text-text-muted">
                        {(safePage - 1) * perPage + index + 1}
                      </td>
                      <td className="min-w-[200px] px-2 py-2.5">
                        <div className="flex items-center gap-3">
                          <UserAvatar user={row.user} className="h-9 w-9" />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-text">
                              {row.name}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-text-muted">
                              {row.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 text-xs text-text-secondary">
                        {row.department ?? "—"}
                      </td>
                      <td className="px-2 text-xs text-text-secondary">
                        {row.designation ?? "—"}
                      </td>
                      <td className="px-2">
                        <Badge
                          variant={row.external ? "warning" : "secondary"}
                          className="capitalize"
                        >
                          {row.roleName}
                        </Badge>
                      </td>
                      <td className="px-2">
                        {row.assets.length > 0 ? (
                          <span
                            className="inline-flex items-center gap-1.5 text-xs text-text-secondary"
                            title={row.assets.map((a) => a.name).join(", ")}
                          >
                            <Package className="h-3.5 w-3.5 text-text-muted" />
                            {row.assets.length}
                          </span>
                        ) : (
                          <span className="text-xs text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-2">
                        <StatusPill status={row.status} />
                      </td>
                      <td className="px-2 text-xs text-text-secondary">
                        {row.kind === "invite"
                          ? "—"
                          : formatDate(row.joinedAt)}
                      </td>
                      <td className="px-3">
                        <RowActionsMenu
                          row={row}
                          canManage={canManage}
                          canAssign={canAssignAssets}
                          onView={() => openDetails(row)}
                          onMessage={() => message(row)}
                          onAssignAsset={() => setAssignRow(row)}
                          onChangeRole={() => setRoleDialogRow(row)}
                          onRemove={() => remove(row)}
                          onResend={() =>
                            organisationId &&
                            row.invitation &&
                            resendInvitation.mutate({
                              organisationId,
                              invitationId: row.invitation.id,
                            })
                          }
                          onRevoke={() =>
                            organisationId &&
                            row.invitation &&
                            revokeInvitation.mutate({
                              organisationId,
                              invitationId: row.invitation.id,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {paged.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    onClick={() => openDetails(row)}
                    className={cn(
                      "rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:border-primary/40",
                      selectedKey === row.key && "border-primary/60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <UserAvatar user={row.user} className="h-10 w-10" />
                      <StatusPill status={row.status} />
                    </div>
                    <h3 className="mt-3 truncate text-sm font-semibold text-text">
                      {row.name}
                    </h3>
                    <p className="mt-0.5 truncate text-xs capitalize text-text-secondary">
                      {row.designation || row.roleName}
                    </p>
                    <div className="mt-3 space-y-1.5 text-[11px] text-text-muted">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {row.department ?? "—"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-3 w-3 shrink-0" />
                        <span className="truncate capitalize">
                          {row.roleName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        <span>
                          {row.kind === "invite"
                            ? "Invitation pending"
                            : `Joined ${formatDate(row.joinedAt)}`}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="shrink-0">
            <div className="flex items-center justify-end border-t border-border px-4 pt-2">
              <FilterDropdown
                label="Rows per page: "
                value={String(perPage)}
                onChange={(v) => {
                  setPerPage(Number(v));
                  setPage(1);
                }}
                options={[
                  { value: "10", label: "10" },
                  { value: "25", label: "25" },
                  { value: "50", label: "50" },
                ]}
              />
            </div>
            <Pagination
              page={safePage}
              total={filtered.length}
              perPage={perPage}
              onPage={setPage}
            />
          </div>
        </section>

        {/* Profile panel (wide screens) */}
        <aside className="hidden min-h-0 overflow-hidden rounded-lg border border-border bg-surface 2xl:block">
          {details ?? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-text-muted">
                <Users className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium text-text">
                Select a member
              </p>
              <p className="max-w-[220px] text-xs text-text-muted">
                Pick someone from the list to see their profile, access and
                quick actions.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Profile dialog (narrow screens) */}
      {!wideLayout ? (
        <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
          <DialogContent className="h-[80dvh] max-w-md overflow-hidden p-0">
            <DialogTitle className="sr-only">Member details</DialogTitle>
            {details}
          </DialogContent>
        </Dialog>
      ) : null}

      <InviteMemberDialog
        open={invite.open}
        onOpenChange={(open) => setInvite({ open, external: invite.external })}
        external={invite.external}
        roles={roles ?? []}
        organisationId={organisationId}
        organisationName={organisation?.name}
      />
      <ChangeRoleDialog
        key={roleDialogRow?.key ?? "none"}
        open={roleDialogRow !== null}
        onOpenChange={(open) => !open && setRoleDialogRow(null)}
        row={roleDialogRow}
        roles={roles ?? []}
        organisationId={organisationId}
      />
      <AssignAssetDialog
        key={assignRow?.key ?? "none"}
        open={assignRow !== null}
        onOpenChange={(open) => !open && setAssignRow(null)}
        row={assignRow}
        organisationId={organisationId}
      />
    </div>
  );
}
