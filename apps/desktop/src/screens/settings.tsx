import { useEffect, useState } from "react";
import { Bell, Briefcase, Command, Key, Monitor, Moon, Palette, Shield, Sun, User, Users } from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import {
  useChangePassword,
  useClients,
  useCreateClient,
  useCreateInvitation,
  useCreateWorkspace,
  useDeleteClient,
  useInvitations,
  useMe,
  useNotificationPreference,
  useOrganisations,
  useRevokeInvitation,
  useRoles,
  useSetNotificationPreference,
  useUpdateProfile,
  useWorkspaces,
} from "../hooks/api";
import { getActiveOrganisation } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { cn } from "../lib/utils";

const sections = [
  { id: "account", label: "My account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: Command },
  { id: "privacy", label: "Privacy & security", icon: Shield },
  { id: "organisation", label: "Organisation", icon: Users },
  { id: "clients", label: "Clients", icon: Briefcase },
];

export function SettingsScreen() {
  const [section, setSection] = useState("account");
  const { data: user } = useMe();
  const activeOrgId = getActiveOrganisation();
  const { data: organisations } = useOrganisations();
  const { data: workspaces } = useWorkspaces(activeOrgId ?? undefined);
  const { data: roles } = useRoles(activeOrgId ?? undefined);
  const organisation = organisations?.find((item) => item.id === activeOrgId);
  const { theme, setTheme } = useUIStore(useShallow((state) => ({ theme: state.theme, setTheme: state.setTheme })));

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b px-6"><h1 className="text-lg font-semibold text-text">Settings</h1></header>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 shrink-0 border-r bg-surface p-2">{sections.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setSection(item.id)} className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors", section === item.id ? "bg-primary-subtle text-primary" : "text-text-secondary hover:bg-surface-elevated hover:text-text")}><Icon className="h-4 w-4" />{item.label}</button>; })}</div>
        <div className="flex-1 overflow-y-auto p-6">
          {section === "account" ? <AccountSettings user={user} /> : null}
          {section === "appearance" ? <SettingsSection title="Appearance"><div><label className="mb-2 block text-sm font-medium">Theme</label><div className="flex gap-2">{(["light", "dark", "system"] as const).map((item) => <button key={item} type="button" onClick={() => setTheme(item)} className={cn("flex flex-1 items-center justify-center gap-2 rounded-md border py-2 text-sm capitalize", theme === item ? "border-primary bg-primary-subtle text-primary" : "text-text-secondary hover:bg-surface-elevated")}>{item === "light" ? <Sun className="h-4 w-4" /> : item === "dark" ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}{item}</button>)}</div></div></SettingsSection> : null}
          {section === "notifications" ? <NotificationSettings /> : null}
          {section === "shortcuts" ? <ShortcutSettings /> : null}
          {section === "privacy" ? <PasswordSettings /> : null}
          {section === "organisation" ? <OrganisationSettings organisationId={activeOrgId} organisationName={organisation?.name} workspaces={workspaces ?? []} roles={roles ?? []} /> : null}
          {section === "clients" ? <ClientSettings organisationId={activeOrgId} /> : null}
        </div>
      </div>
    </div>
  );
}

function AccountSettings({ user }: { user?: { email: string; firstName?: string | null; lastName?: string | null } }) {
  const update = useUpdateProfile();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  useEffect(() => { setFirstName(user?.firstName ?? ""); setLastName(user?.lastName ?? ""); }, [user]);
  const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || user?.email || "User";
  return <SettingsSection title="My account"><div className="flex items-center gap-4"><Avatar className="h-16 w-16"><AvatarFallback className="text-xl">{name.charAt(0).toUpperCase()}</AvatarFallback></Avatar><div><p className="font-semibold">{name}</p><p className="text-sm text-text-muted">{user?.email}</p></div></div><div className="mt-4 grid max-w-lg grid-cols-2 gap-3"><Input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" /><Input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" /></div>{update.error ? <p className="mt-2 text-sm text-error">{update.error.message}</p> : null}<Button className="mt-3" disabled={update.isPending} onClick={() => update.mutate({ firstName, lastName })}>Save profile</Button></SettingsSection>;
}

function NotificationSettings() {
  const eventType = "teamspace-one.message.created";
  const { data: preference } = useNotificationPreference(eventType);
  const update = useSetNotificationPreference();
  const options = [{ key: "inApp", label: "Show in-app notifications" }, { key: "desktop", label: "Enable desktop notifications" }, { key: "email", label: "Send email notifications" }, { key: "push", label: "Send push notifications" }] as const;
  return <SettingsSection title="Message notifications"><div className="space-y-3">{options.map((option) => <label key={option.key} className="flex items-center justify-between rounded-md border p-3"><span className="text-sm">{option.label}</span><input type="checkbox" checked={preference?.[option.key] ?? false} onChange={(event) => update.mutate({ eventType, body: { [option.key]: event.target.checked } })} className="h-4 w-4 accent-primary" /></label>)}</div>{update.error ? <p className="mt-2 text-sm text-error">{update.error.message}</p> : null}</SettingsSection>;
}

function PasswordSettings() {
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  return <SettingsSection title="Privacy & security"><div className="max-w-lg space-y-3"><Input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Current password" /><Input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="New password (12+ characters)" />{change.error ? <p className="text-sm text-error">{change.error.message}</p> : null}{change.isSuccess ? <p className="text-sm text-success">Password changed. Other sessions were revoked.</p> : null}<Button disabled={!currentPassword || newPassword.length < 12 || change.isPending} onClick={() => change.mutate({ currentPassword, newPassword }, { onSuccess: () => { setCurrentPassword(""); setNewPassword(""); } })}><Key className="mr-2 h-4 w-4" />Change password</Button></div></SettingsSection>;
}

function OrganisationSettings({ organisationId, organisationName, workspaces, roles }: { organisationId: string | null; organisationName?: string; workspaces: { id: string; name: string }[]; roles: { id: string; name: string; isDefault: boolean }[] }) {
  const createWorkspace = useCreateWorkspace();
  const invite = useCreateInvitation();
  const { data: invitations } = useInvitations(organisationId ?? undefined);
  const revokeInvitation = useRevokeInvitation();
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  useEffect(() => { if (!roleId) setRoleId(roles.find((role) => role.isDefault)?.id ?? roles[0]?.id ?? ""); }, [roleId, roles]);
  if (!organisationId) return <SettingsSection title="Organisation"><p className="text-sm text-text-muted">Select an organisation first.</p></SettingsSection>;
  return <SettingsSection title={organisationName ?? "Organisation"}><div className="grid gap-6 lg:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold">Workspaces</h3><div className="mb-3 space-y-1">{workspaces.map((workspace) => <div key={workspace.id} className="rounded-md border px-3 py-2 text-sm">{workspace.name}</div>)}</div><div className="flex gap-2"><Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Workspace name" /><Button disabled={!workspaceName.trim() || createWorkspace.isPending} onClick={() => createWorkspace.mutate({ organisationId, name: workspaceName.trim() }, { onSuccess: () => setWorkspaceName("") })}>Create</Button></div></div><div><h3 className="mb-2 text-sm font-semibold">Invite member</h3><div className="space-y-2"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" /><select className="h-9 w-full rounded-md border bg-surface px-3 text-sm" value={roleId} onChange={(event) => setRoleId(event.target.value)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><Button disabled={!email.trim() || !roleId || invite.isPending} onClick={() => invite.mutate({ organisationId, email: email.trim(), roleId }, { onSuccess: () => setEmail("") })}>Send invitation</Button>{invite.isSuccess ? <p className="text-sm text-success">Invitation created.</p> : null}</div></div></div><div className="mt-6"><h3 className="mb-2 text-sm font-semibold">Invitations</h3><div className="space-y-2">{invitations?.map((item) => <div key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2"><div><p className="text-sm">{item.email}</p><p className="text-xs text-text-muted">{item.status} · expires {new Date(item.expiresAt).toLocaleDateString()}</p></div>{item.status === "pending" ? <Button variant="ghost" size="sm" className="text-error" onClick={() => revokeInvitation.mutate({ organisationId, invitationId: item.id })}>Revoke</Button> : null}</div>)}</div></div>{(createWorkspace.error || invite.error || revokeInvitation.error) ? <p className="mt-3 text-sm text-error">{(createWorkspace.error ?? invite.error)?.message}</p> : null}</SettingsSection>;
}

function ClientSettings({ organisationId }: { organisationId: string | null }) {
  const { data: clients } = useClients(organisationId ?? undefined);
  const create = useCreateClient();
  const remove = useDeleteClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  if (!organisationId) return <SettingsSection title="Clients"><p className="text-sm text-text-muted">Select an organisation first.</p></SettingsSection>;
  return <SettingsSection title="Clients"><div className="mb-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Client name" /><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Contact email" /><Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ organisationId, name: name.trim(), email: email.trim() || undefined }, { onSuccess: () => { setName(""); setEmail(""); } })}>Add client</Button></div><div className="space-y-2">{clients?.map((client) => <div key={client.id} className="flex items-center justify-between rounded-md border px-3 py-2"><div><p className="text-sm font-medium">{client.name}</p><p className="text-xs text-text-muted">{client.email || "No contact email"}</p></div><Button variant="ghost" size="sm" className="text-error" onClick={() => remove.mutate({ organisationId, clientId: client.id })}>Delete</Button></div>)}{!clients?.length ? <p className="py-6 text-center text-sm text-text-muted">No clients yet.</p> : null}</div>{(create.error || remove.error) ? <p className="mt-3 text-sm text-error">{(create.error ?? remove.error)?.message}</p> : null}</SettingsSection>;
}

function ShortcutSettings() {
  const shortcuts = [{ shortcut: "⌘K", action: "Global search" }, { shortcut: "Esc", action: "Close panels" }];
  return <SettingsSection title="Keyboard shortcuts"><div className="grid grid-cols-2 gap-3">{shortcuts.map((item) => <div key={item.action} className="flex items-center justify-between rounded-md border p-3"><span className="text-sm">{item.action}</span><kbd className="rounded bg-surface-elevated px-2 py-0.5 text-xs font-mono">{item.shortcut}</kbd></div>)}</div></SettingsSection>;
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="mb-6"><h2 className="mb-4 text-base font-semibold text-text">{title}</h2>{children}</Card>;
}
