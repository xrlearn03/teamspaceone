import { useEffect, useMemo, useState } from "react";
import { Mail, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { PermissionGate } from "@teamspace-one/authorization/react";
import { Card, CardContent, CardHeader, CardTitle } from "@teamspace-one/ui/card";
import { Badge } from "@teamspace-one/ui/badge";
import { Button } from "@teamspace-one/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@teamspace-one/ui/dialog";
import { EmptyState } from "@teamspace-one/ui/empty-state";
import { Input } from "@teamspace-one/ui/input";
import { Skeleton } from "@teamspace-one/ui/skeleton";
import {
  useMembers,
  usePermissionsList,
  useRoles,
  useUpdateMemberRole,
  useRemoveMember,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useUsers,
  useInviteMember,
  useEmailProvider,
  useUpdateEmailProvider,
} from "../hooks/api";
import { getActiveOrganisation, ADMIN_MANAGED_ROLE_CATEGORIES, type OrganisationRole, type Permission, type RoleCategory, type UserDataScope, type UpdateEmailProvider } from "../lib/api";
import { getUserDisplayName } from "../lib/utils";

const SCOPES: UserDataScope["scope"][] = ["own", "assigned", "team", "department", "organisation"];

function groupPermissions(permissions: Permission[]) {
  const groups = new Map<string, Permission[]>();
  for (const p of permissions) {
    const list = groups.get(p.module) ?? [];
    list.push(p);
    groups.set(p.module, list);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function RoleDialog({
  open,
  onOpenChange,
  role,
  permissions,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: OrganisationRole;
  permissions: Permission[];
  onSubmit: (values: {
    name: string;
    description: string;
    roleCategory: RoleCategory;
    permissionIds: string[];
    scopes: UserDataScope[];
  }) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<RoleCategory>("administrative");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scopes, setScopes] = useState<UserDataScope[]>([]);

  useEffect(() => {
    if (!open) return;
    if (role) {
      setName(role.name);
      setDescription(role.description ?? "");
      setCategory(role.roleCategory);
      setSelected(new Set(role.rolePermissions.map((rp) => rp.permissionId)));
      setScopes(role.roleScopes ?? []);
    } else {
      setName("");
      setDescription("");
      setCategory("administrative");
      setSelected(new Set());
      setScopes([]);
    }
  }, [open, role]);

  const grouped = useMemo(() => groupPermissions(permissions), [permissions]);

  function togglePermission(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addScope() {
    setScopes((prev) => [...prev, { module: "", scope: "organisation" }]);
  }

  function updateScope(index: number, patch: Partial<UserDataScope>) {
    setScopes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function removeScope(index: number) {
    setScopes((prev) => prev.filter((_, i) => i !== index));
  }

  function submit() {
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      roleCategory: category,
      permissionIds: Array.from(selected),
      scopes: scopes.filter((s) => s.module.trim() !== "").map((s) => ({ ...s, module: s.module.trim() })),
    });
  }

  const canSubmit = name.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{role ? "Edit role" : "Create role"}</DialogTitle>
          <DialogDescription>
            {role
              ? "Update the role's name, permissions and data scopes."
              : "Create a custom role and assign permissions."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto p-1">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">Name</span>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. content_editor" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">Category</span>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm text-text"
                value={category}
                onChange={(e) => setCategory(e.target.value as RoleCategory)}
              >
                {ADMIN_MANAGED_ROLE_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-text-secondary">Description</span>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
            </label>
          </div>

          <p className="rounded-md border bg-surface px-3 py-2 text-xs text-text-muted">
            Employee and member access is managed through the appropriate onboarding workflow, not through
            administrative role creation.
          </p>

          <div className="rounded-md border bg-surface p-3">
            <p className="mb-2 text-sm font-medium text-text">Permissions</p>
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {Array.from(grouped.entries()).map(([module, perms]) => (
                <div key={module}>
                  <p className="mb-1 text-xs font-semibold uppercase text-text-muted">{module}</p>
                  <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {perms.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-text-secondary">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => togglePermission(p.id)}
                          className="h-4 w-4 rounded border-border bg-background text-primary"
                        />
                        <span className="truncate">{p.resource === "*" ? p.action : `${p.resource}.${p.action}`}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-text">Data scopes</p>
              <Button type="button" variant="secondary" size="sm" onClick={addScope}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add
              </Button>
            </div>
            {scopes.length === 0 ? (
              <p className="text-xs text-text-muted">No data scopes. Members with this role will have no scoped data access.</p>
            ) : (
              <div className="space-y-2">
                {scopes.map((s, i) => (
                  <div key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-12">
                    <Input
                      className="col-span-5"
                      value={s.module}
                      onChange={(e) => updateScope(i, { module: e.target.value })}
                      placeholder="Module, e.g. hrms"
                    />
                    <select
                      className="col-span-5 h-9 rounded-md border bg-background px-2 text-sm text-text"
                      value={s.scope}
                      onChange={(e) => updateScope(i, { scope: e.target.value as UserDataScope["scope"] })}
                    >
                      {SCOPES.map((scope) => (
                        <option key={scope} value={scope}>{scope}</option>
                      ))}
                    </select>
                    <Button type="button" variant="ghost" size="icon" className="col-span-2" onClick={() => removeScope(i)}>
                      <Trash2 className="h-4 w-4 text-error" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit || isPending}>
              {isPending ? "Saving..." : role ? "Save changes" : "Create role"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Role categories that can be granted through an admin invitation. */
const INVITABLE_ROLE_CATEGORIES: RoleCategory[] = ["administrative", "managerial", "member", "external", "guest"];

function InviteMemberDialog({
  open,
  onOpenChange,
  roles,
  organisationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: OrganisationRole[];
  organisationId?: string;
}) {
  const invite = useInviteMember();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const invitableRoles = useMemo(
    () => roles.filter((r) => INVITABLE_ROLE_CATEGORIES.includes(r.roleCategory)),
    [roles],
  );

  useEffect(() => {
    if (open) {
      setEmail("");
      setFirstName("");
      setLastName("");
      setRoleId("");
      setError(null);
    }
  }, [open]);

  function submit() {
    if (!organisationId || !roleId) return;
    invite.mutate(
      {
        organisationId,
        email: email.trim(),
        roleId,
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
      },
      {
        onSuccess: () => onOpenChange(false),
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to invite member"),
      },
    );
  }

  const canSubmit = email.trim().length > 0 && roleId && !invite.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            The member gets an account and is emailed their login and a temporary password. They must set a
            new password on first sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Email</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">First name</span>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Optional" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-text-secondary">Last name</span>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Optional" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-text-secondary">Role</span>
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm text-text"
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
            >
              <option value="">Select a role…</option>
              {invitableRoles.map((r) => (
                <option key={r.id} value={r.id}>{r.name.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          <p className="rounded-md border bg-surface px-3 py-2 text-xs text-text-muted">
            Employee and candidate access is granted through the HR onboarding and recruitment workflows, not
            through member invitation.
          </p>
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {invite.isPending ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MembersPanel() {
  const organisationId = getActiveOrganisation() ?? undefined;
  const { data: members, isLoading } = useMembers(organisationId);
  const { data: roles } = useRoles(organisationId);
  const updateMemberRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const [inviteOpen, setInviteOpen] = useState(false);
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
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{members?.length ?? 0}</Badge>
          <Button variant="secondary" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="mr-1 h-3.5 w-3.5" /> Invite
          </Button>
        </div>
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
              const name = getUserDisplayName(u, "") ?? m.userId;
              return (
                <div key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text">{name}</p>
                    {u ? <p className="truncate text-xs text-text-muted">{u.email}</p> : null}
                  </div>
                  <select
                    className="h-8 rounded-md border bg-background px-2 text-xs text-text"
                    value={m.role?.id ?? ""}
                    onChange={(e) => {
                      if (e.target.value && e.target.value !== m.role?.id) {
                        updateMemberRole.mutate({
                          organisationId: organisationId as string,
                          membershipId: m.id,
                          roleId: e.target.value,
                        });
                      }
                    }}
                  >
                    {(roles ?? [])
                      .filter(
                        (r) =>
                          ADMIN_MANAGED_ROLE_CATEGORIES.includes(r.roleCategory) || r.id === m.role?.id,
                      )
                      .map((r) => (
                        <option key={r.id} value={r.id}>{r.name.replace(/_/g, " ")}</option>
                      ))}
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-error"
                    disabled={removeMember.isPending}
                    onClick={() => removeMember.mutate({ organisationId: organisationId as string, membershipId: m.id })}
                    title="Remove member"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={Users} title="No members" />
        )}
      </CardContent>
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        roles={roles ?? []}
        organisationId={organisationId}
      />
    </Card>
  );
}

function RolesPanel() {
  const organisationId = getActiveOrganisation() ?? undefined;
  const { data: roles, isLoading } = useRoles(organisationId);
  const { data: permissions = [] } = usePermissionsList(organisationId);
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<OrganisationRole | undefined>();

  function openCreate() {
    setEditing(undefined);
    setDialogOpen(true);
  }

  function openEdit(role: OrganisationRole) {
    setEditing(role);
    setDialogOpen(true);
  }

  async function handleSubmit(values: {
    name: string;
    description: string;
    roleCategory: RoleCategory;
    permissionIds: string[];
    scopes: UserDataScope[];
  }) {
    if (editing) {
      updateRole.mutate(
        { organisationId: organisationId as string, roleId: editing.id, ...values },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      createRole.mutate(
        { organisationId: organisationId as string, ...values },
        { onSuccess: () => setDialogOpen(false) },
      );
    }
  }

  function handleDelete(role: OrganisationRole) {
    if (window.confirm(`Delete the "${role.name}" role? This cannot be undone.`)) {
      deleteRole.mutate({ organisationId: organisationId as string, roleId: role.id });
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-text-muted" />
            <CardTitle className="text-sm">Roles</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{roles?.length ?? 0}</Badge>
            <Button variant="secondary" size="sm" onClick={openCreate}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : roles && roles.length > 0 ? (
            <div className="space-y-4">
              {(
                [
                  { key: "administrative", title: "Administrative Roles" },
                  { key: "managerial", title: "Managerial Roles" },
                  { key: "restricted", title: "Restricted Roles" },
                ] as const
              ).map((section) => {
                const sectionRoles = roles.filter((r) =>
                  section.key === "restricted"
                    ? !ADMIN_MANAGED_ROLE_CATEGORIES.includes(r.roleCategory)
                    : r.roleCategory === section.key,
                );
                if (sectionRoles.length === 0) return null;
                return (
                  <div key={section.key}>
                    <p className="mb-1 text-xs font-semibold uppercase text-text-muted">{section.title}</p>
                    {section.key === "restricted" ? (
                      <p className="mb-2 text-xs text-text-muted">
                        Employee and member access is managed through the appropriate onboarding workflow, not
                        through administrative role creation.
                      </p>
                    ) : null}
                    <div className="divide-y rounded-md border">
                      {sectionRoles.map((role) => (
                        <div key={role.id} className="flex items-center justify-between px-3 py-2">
                          <div>
                            <p className="text-sm capitalize text-text">
                              {role.name.replace(/_/g, " ")}
                            </p>
                            <p className="text-xs text-text-muted">
                              {role.rolePermissions?.length ?? 0} permissions
                              {role.roleScopes && role.roleScopes.length > 0
                                ? ` · ${role.roleScopes.length} scope${role.roleScopes.length === 1 ? "" : "s"}`
                                : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {role.isDefault ? <Badge variant="secondary">Default</Badge> : null}
                            {role.isSystem ? <Badge variant="secondary">System</Badge> : null}
                            {section.key === "restricted" ? (
                              <Badge variant="secondary" className="capitalize">{role.roleCategory}</Badge>
                            ) : null}
                            {!role.isSystem && section.key !== "restricted" && (
                              <>
                                <Button variant="ghost" size="icon" onClick={() => openEdit(role)}>
                                  <Pencil className="h-4 w-4 text-text-muted" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(role)}>
                                  <Trash2 className="h-4 w-4 text-error" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={ShieldCheck} title="No roles" />
          )}
        </CardContent>
      </Card>

      <RoleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        role={editing}
        permissions={permissions}
        onSubmit={handleSubmit}
        isPending={createRole.isPending || updateRole.isPending}
      />
    </>
  );
}

function EmailSettingsPanel() {
  const organisationId = getActiveOrganisation() ?? undefined;
  const { data: provider, isLoading } = useEmailProvider(organisationId);
  const update = useUpdateEmailProvider();
  const [form, setForm] = useState<Partial<UpdateEmailProvider>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (provider) {
      setForm({
        host: provider.host,
        port: provider.port,
        secure: provider.secure,
        user: provider.user ?? "",
        from: provider.from,
        enabled: provider.enabled,
        pass: "",
      });
    }
  }, [provider]);

  function updateField<K extends keyof UpdateEmailProvider>(key: K, value: UpdateEmailProvider[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    if (!organisationId || !form.host || form.port === undefined || !form.from) return;
    const body: UpdateEmailProvider = {
      host: form.host.trim(),
      port: Number.isNaN(form.port) ? 0 : Number(form.port),
      secure: Boolean(form.secure),
      from: form.from.trim(),
      enabled: form.enabled ?? true,
      user: form.user?.trim() || undefined,
      pass: form.pass ? form.pass : undefined,
    };
    setError(null);
    update.mutate(
      { organisationId, body },
      {
        onSuccess: () => setForm((prev) => ({ ...prev, pass: "" })),
        onError: (err) => setError(err instanceof Error ? err.message : "Failed to save email settings"),
      },
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-text-muted" />
          <CardTitle className="text-sm">Email provider</CardTitle>
        </div>
        {provider ? (
          <Badge variant="secondary">{provider.enabled ? "Enabled" : "Disabled"}</Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-text-muted">
              Configure an organisation-specific SMTP server. When set, all emails from this
              organisation (notifications, AI summaries, invitations) are sent through it. Leave it
              unset to use the platform default gateway.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">SMTP host</span>
                <Input value={form.host ?? ""} onChange={(e) => updateField("host", e.target.value)} placeholder="smtp.example.com" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">Port</span>
                <Input
                  type="number"
                  value={form.port === undefined || Number.isNaN(form.port) ? "" : form.port}
                  onChange={(e) => updateField("port", e.target.value === "" ? Number.NaN : Number(e.target.value))}
                  placeholder="587"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">Username</span>
                <Input value={form.user ?? ""} onChange={(e) => updateField("user", e.target.value)} placeholder="no-reply@example.com" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">Password</span>
                <Input
                  type="password"
                  value={form.pass ?? ""}
                  onChange={(e) => updateField("pass", e.target.value)}
                  placeholder={provider ? "Leave blank to keep existing" : "Optional"}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">From address</span>
                <Input value={form.from ?? ""} onChange={(e) => updateField("from", e.target.value)} placeholder="no-reply@example.com" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text-secondary">Secure</span>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm text-text"
                  value={String(form.secure ?? false)}
                  onChange={(e) => updateField("secure", e.target.value === "true")}
                >
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs font-medium text-text-secondary">Enabled</span>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm text-text"
                  value={String(form.enabled ?? true)}
                  onChange={(e) => updateField("enabled", e.target.value === "true")}
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </label>
            </div>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <div className="flex justify-end">
              <Button onClick={submit} disabled={update.isPending || !form.host || form.port === undefined || Number.isNaN(form.port) || !form.from}>
                {update.isPending ? "Saving…" : "Save email settings"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminScreen() {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 border-b bg-background/95 px-3 py-4 backdrop-blur sm:px-6">
        <h1 className="text-xl font-semibold text-text">Administration</h1>
        <p className="text-sm text-text-secondary">
          Members, roles and organisation settings.
        </p>
      </header>

      <div className="grid auto-rows-min grid-cols-1 gap-4 p-3 sm:p-4 lg:p-6 xl:grid-cols-2">
        <PermissionGate permission="admin.user.manage">
          <MembersPanel />
        </PermissionGate>
        <PermissionGate permission="admin.role.manage">
          <RolesPanel />
        </PermissionGate>
        <PermissionGate permission="admin.organization.settings">
          <EmailSettingsPanel />
        </PermissionGate>
      </div>
    </div>
  );
}
