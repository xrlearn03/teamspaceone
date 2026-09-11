import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Bot,
  Briefcase,
  Camera,
  Code,
  Command,
  CreditCard,
  HardDrive,
  Info,
  Key,
  KeyRound,
  Monitor,
  Moon,
  Palette,
  Plug,
  Shield,
  Sun,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { useShallow } from "zustand/shallow";
import {
  useChangePassword,
  useClients,
  useCreateClient,
  useCreateOrganisation,
  useCreateWorkspace,
  useDeleteClient,
  useInvitations,
  useInviteMember,
  useMe,
  useNotificationPreference,
  useOrganisations,
  useResendInvitation,
  useRevokeInvitation,
  useRoles,
  useSetNotificationPreference,
  useUpdateProfile,
  useUploadFile,
  useWorkspaces,
} from "@/hooks/api";
import { getActiveOrganisation, setActiveOrganisation, type UserDto } from "@/lib/api";
import { Button } from "@teamspace-one/ui/button";
import { Card } from "@teamspace-one/ui/card";
import { Input } from "@teamspace-one/ui/input";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@teamspace-one/ui/badge";
import { cn, getUserDisplayName } from "@/lib/utils";

const sections = [
  { id: "account", label: "My account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: Command },
  { id: "privacy", label: "Privacy & security", icon: Shield },
  { id: "devices", label: "Connected devices", icon: Monitor },
  { id: "sessions", label: "Active sessions", icon: KeyRound },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "ai", label: "AI preferences", icon: Bot },
  { id: "developer", label: "Developer", icon: Code },
  { id: "organisation", label: "Organisation", icon: Users },
  { id: "clients", label: "Clients", icon: Briefcase },
  { id: "about", label: "About", icon: Info },
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
      <header className="flex h-14 items-center border-b px-3 sm:px-6"><h1 className="text-lg font-semibold text-text">Settings</h1></header>
      <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
        <div className="h-48 w-full shrink-0 overflow-y-auto border-r bg-surface p-2 sm:h-auto sm:w-56">{sections.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setSection(item.id)} className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors", section === item.id ? "bg-primary-subtle text-primary" : "text-text-secondary hover:bg-surface-elevated hover:text-text")}><Icon className="h-4 w-4" />{item.label}</button>; })}</div>
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          {section === "account" ? <AccountSettings user={user} /> : null}
          {section === "appearance" ? <AppearanceSettings theme={theme} setTheme={setTheme} /> : null}
          {section === "notifications" ? <NotificationSettings /> : null}
          {section === "shortcuts" ? <ShortcutSettings /> : null}
          {section === "privacy" ? <PasswordSettings /> : null}
          {section === "devices" ? <ConnectedDevicesSettings /> : null}
          {section === "sessions" ? <SessionsSettings /> : null}
          {section === "billing" ? <BillingSettings /> : null}
          {section === "storage" ? <StorageSettings /> : null}
          {section === "integrations" ? <IntegrationsSettings /> : null}
          {section === "ai" ? <AISettings /> : null}
          {section === "developer" ? <DeveloperSettings /> : null}
          {section === "organisation" ? <OrganisationSettings organisationId={activeOrgId} organisationName={organisation?.name} workspaces={workspaces ?? []} roles={roles ?? []} /> : null}
          {section === "clients" ? <ClientSettings organisationId={activeOrgId} /> : null}
          {section === "about" ? <AboutSettings /> : null}
        </div>
      </div>
    </div>
  );
}

function AccountSettings({ user }: { user?: UserDto }) {
  const update = useUpdateProfile();
  const upload = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  useEffect(() => { setFirstName(user?.firstName ?? ""); setLastName(user?.lastName ?? ""); }, [user]);
  const name = getUserDisplayName(user, "User");
  const avatarBusy = upload.isPending || update.isPending;

  function onAvatarSelected(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    upload.mutate({ file }, {
      onSuccess: (record) => update.mutate({ avatarFileId: record.id }),
    });
  }

  return (
    <SettingsSection title="My account">
      <div className="flex items-center gap-4">
        <div className="relative">
          <UserAvatar user={user} className="h-16 w-16" fallbackClassName="text-xl" />
          <button
            type="button"
            title="Change avatar"
            disabled={avatarBusy}
            onClick={() => fileInputRef.current?.click()}
            className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface-elevated text-text-secondary transition-colors hover:bg-surface hover:text-text disabled:opacity-50"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => { onAvatarSelected(event.target.files?.[0]); event.currentTarget.value = ""; }}
          />
        </div>
        <div>
          <p className="font-semibold">{name}</p>
          <p className="text-sm text-text-muted">{user?.email}</p>
          <div className="mt-1 flex gap-2">
            <Button variant="ghost" size="sm" disabled={avatarBusy} onClick={() => fileInputRef.current?.click()}>
              {upload.isPending ? "Uploading…" : user?.avatarFileId ? "Change photo" : "Upload photo"}
            </Button>
            {user?.avatarFileId ? (
              <Button variant="ghost" size="sm" className="text-error" disabled={avatarBusy} onClick={() => update.mutate({ avatarFileId: null })}>
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-4 grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2"><Input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="First name" /><Input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Last name" /></div>
      {update.error ? <p className="mt-2 text-sm text-error">{update.error.message}</p> : null}
      {upload.error ? <p className="mt-2 text-sm text-error">{upload.error instanceof Error ? upload.error.message : "Upload failed"}</p> : null}
      <Button className="mt-3" disabled={update.isPending} onClick={() => update.mutate({ firstName, lastName })}>Save profile</Button>
    </SettingsSection>
  );
}

function AppearanceSettings({ theme, setTheme }: { theme: "light" | "dark" | "system"; setTheme: (theme: "light" | "dark" | "system") => void }) {
  const themes = ["light", "dark", "system"] as const;
  return <SettingsSection title="Appearance"><div><label className="mb-2 block text-sm font-medium">Theme</label><div className="flex gap-2">{themes.map((item) => <button key={item} type="button" onClick={() => setTheme(item)} className={cn("flex flex-1 items-center justify-center gap-2 rounded-md border py-2 text-sm capitalize", theme === item ? "border-primary bg-primary-subtle text-primary" : "text-text-secondary hover:bg-surface-elevated")}>{item === "light" ? <Sun className="h-4 w-4" /> : item === "dark" ? <Moon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}{item}</button>)}</div></div></SettingsSection>;
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

function ConnectedDevicesSettings() {
  const devices = [{ id: "1", name: "This device", type: "desktop", lastActive: "Active now" }];
  return <SettingsSection title="Connected devices"><p className="mb-3 text-sm text-text-muted">Manage devices that are signed in to your account.</p><div className="space-y-2">{devices.map((device) => <div key={device.id} className="flex items-center justify-between rounded-md border p-3"><div><p className="text-sm font-medium">{device.name}</p><p className="text-xs text-text-muted capitalize">{device.type} · {device.lastActive}</p></div><Button variant="ghost" size="sm" className="text-error">Remove</Button></div>)}</div></SettingsSection>;
}

function SessionsSettings() {
  const sessions = [{ id: "1", name: "Current session", createdAt: new Date().toLocaleDateString(), location: "Local" }];
  return <SettingsSection title="Active sessions"><p className="mb-3 text-sm text-text-muted">Review and revoke active sign-in sessions.</p><div className="space-y-2">{sessions.map((session) => <div key={session.id} className="flex items-center justify-between rounded-md border p-3"><div><p className="text-sm font-medium">{session.name}</p><p className="text-xs text-text-muted">{session.location} · {session.createdAt}</p></div><Button variant="ghost" size="sm" className="text-error"><Trash2 className="mr-1 h-4 w-4" />Revoke</Button></div>)}</div></SettingsSection>;
}

function BillingSettings() {
  return (
    <SettingsSection title="Billing">
      <div className="max-w-lg space-y-4">
        <div className="rounded-md border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Current plan</p>
              <p className="text-xs text-text-muted">Free</p>
            </div>
            <Badge variant="secondary">Free</Badge>
          </div>
        </div>
        <p className="text-sm text-text-muted">Billing management and invoices will be available once a paid plan is configured.</p>
      </div>
    </SettingsSection>
  );
}

function StorageSettings() {
  const used = 0;
  const total = 10 * 1024 * 1024 * 1024;
  const percent = 0;
  function formatBytes(bytes: number) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }
  return (
    <SettingsSection title="Storage">
      <div className="max-w-lg space-y-4">
        <div>
          <div className="mb-1 flex justify-between text-sm"><span>Used</span><span>{formatBytes(used)} of {formatBytes(total)}</span></div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-elevated"><div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} /></div>
        </div>
        <p className="text-sm text-text-muted">Storage usage will be calculated from file uploads and meeting recordings.</p>
      </div>
    </SettingsSection>
  );
}

function IntegrationsSettings() {
  const integrations = [
    { id: "slack", name: "Slack", status: "disconnected" },
    { id: "github", name: "GitHub", status: "disconnected" },
    { id: "linear", name: "Linear", status: "disconnected" },
    { id: "calendar", name: "Google Calendar", status: "disconnected" },
  ];
  return (
    <SettingsSection title="Integrations">
      <div className="space-y-2">
        {integrations.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{item.name}</p>
              <p className="text-xs capitalize text-text-muted">{item.status}</p>
            </div>
            <Button variant="secondary" size="sm" disabled>Connect</Button>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}

function AISettings() {
  const [suggest, setSuggest] = useState(false);
  const [summarize, setSummarize] = useState(false);
  return (
    <SettingsSection title="AI preferences">
      <div className="max-w-lg space-y-3">
        <label className="flex items-center justify-between rounded-md border p-3">
          <span className="text-sm">Smart reply suggestions</span>
          <input type="checkbox" checked={suggest} onChange={(event) => setSuggest(event.target.checked)} className="h-4 w-4 accent-primary" />
        </label>
        <label className="flex items-center justify-between rounded-md border p-3">
          <span className="text-sm">Auto-summarize long channels</span>
          <input type="checkbox" checked={summarize} onChange={(event) => setSummarize(event.target.checked)} className="h-4 w-4 accent-primary" />
        </label>
        <p className="text-sm text-text-muted">AI preferences are stored locally until a backend preferences service is available.</p>
      </div>
    </SettingsSection>
  );
}

function DeveloperSettings() {
  const [copied, setCopied] = useState(false);
  const token = "dev-token-placeholder";
  return (
    <SettingsSection title="Developer">
      <div className="max-w-lg space-y-3">
        <p className="text-sm text-text-muted">API tokens for third-party integrations and scripts.</p>
        <div className="flex gap-2">
          <Input readOnly value={token} />
          <Button variant="secondary" onClick={() => { void navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy"}</Button>
        </div>
      </div>
    </SettingsSection>
  );
}

function OrganisationSettings({ organisationId, organisationName, workspaces, roles }: { organisationId: string | null; organisationName?: string; workspaces: { id: string; name: string }[]; roles: { id: string; name: string; isDefault: boolean }[] }) {
  const createWorkspace = useCreateWorkspace();
  const createOrganisation = useCreateOrganisation();
  const invite = useInviteMember();
  const [newOrganisationName, setNewOrganisationName] = useState("");
  const { data: invitations } = useInvitations(organisationId ?? undefined);
  const revokeInvitation = useRevokeInvitation();
  const resendInvitation = useResendInvitation();
  const [workspaceName, setWorkspaceName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  useEffect(() => { if (!roleId) setRoleId(roles.find((role) => role.isDefault)?.id ?? roles[0]?.id ?? ""); }, [roleId, roles]);

  return <SettingsSection title={organisationName ?? "Organisation"}><div className="mb-6"><h3 className="mb-2 text-sm font-semibold">Create organisation</h3><div className="flex flex-col gap-2 sm:flex-row"><Input value={newOrganisationName} onChange={(event) => setNewOrganisationName(event.target.value)} placeholder="Organisation name" /><Button disabled={!newOrganisationName.trim() || createOrganisation.isPending} onClick={() => createOrganisation.mutate(newOrganisationName.trim(), { onSuccess: (org) => { setActiveOrganisation(org.id); setNewOrganisationName(""); } })}>Create</Button></div>{createOrganisation.error ? <p className="mt-2 text-sm text-error">{createOrganisation.error.message}</p> : null}</div><div className="grid gap-3 sm:p-4 lg:p-6 lg:grid-cols-2"><div><h3 className="mb-2 text-sm font-semibold">Workspaces</h3><div className="mb-3 space-y-1">{organisationId ? workspaces.map((workspace) => <div key={workspace.id} className="rounded-md border px-3 py-2 text-sm">{workspace.name}</div>) : <p className="text-sm text-text-muted">No organisation yet. Creating a workspace will create one for you.</p>}</div><div className="flex flex-col gap-2 sm:flex-row"><Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} placeholder="Workspace name" /><Button disabled={!workspaceName.trim() || createWorkspace.isPending} onClick={() => createWorkspace.mutate({ name: workspaceName.trim() }, { onSuccess: () => setWorkspaceName("") })}>Create</Button></div></div><div><h3 className="mb-2 text-sm font-semibold">Invite member</h3><div className="space-y-2"><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" /><select className="h-9 w-full rounded-md border bg-surface px-3 text-sm" value={roleId} onChange={(event) => setRoleId(event.target.value)}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><Button disabled={!organisationId || !email.trim() || !roleId || invite.isPending} onClick={() => { if (!organisationId) return; invite.mutate({ organisationId, email: email.trim(), roleId }, { onSuccess: () => setEmail("") }); }}>Invite</Button></div>{invitations && invitations.length > 0 ? <div className="mt-4 space-y-2">{invitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"><span>{invitation.email}</span><div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => resendInvitation.mutate({ organisationId: organisationId!, invitationId: invitation.id })}>Resend</Button><Button variant="ghost" size="sm" className="text-error" onClick={() => revokeInvitation.mutate({ organisationId: organisationId!, invitationId: invitation.id })}>Revoke</Button></div></div>)}</div> : null}</div></div></SettingsSection>;
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

function AboutSettings() {
  return (
    <SettingsSection title="About">
      <div className="max-w-lg space-y-2 text-sm text-text-secondary">
        <p><strong className="text-text">Teamspace One</strong></p>
        <p>Version 0.1.0</p>
        <p>
          Teamspace One brings your team&apos;s conversations, projects, and files together in one
          secure desktop workspace — so you can chat, collaborate, and stay organised without
          switching between apps.
        </p>
      </div>
    </SettingsSection>
  );
}

function ShortcutSettings() {
  const shortcuts = [
    { shortcut: "⌘/Ctrl K", action: "Global search" },
    { shortcut: "⌘/Ctrl ⇧ ]", action: "Open inbox" },
    { shortcut: "Enter", action: "Send message" },
    { shortcut: "Shift Enter", action: "New line in composer" },
    { shortcut: "@", action: "Mention autocomplete" },
    { shortcut: "/", action: "Slash commands" },
    { shortcut: "↑ ↓", action: "Navigate autocomplete & search results" },
    { shortcut: "Esc", action: "Close menus, dialogs, and panels" },
  ];
  return <SettingsSection title="Keyboard shortcuts"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{shortcuts.map((item) => <div key={item.action} className="flex items-center justify-between rounded-md border p-3"><span className="text-sm">{item.action}</span><kbd className="rounded bg-surface-elevated px-2 py-0.5 text-xs font-mono">{item.shortcut}</kbd></div>)}</div></SettingsSection>;
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card className="mb-6"><h2 className="mb-4 text-base font-semibold text-text">{title}</h2>{children}</Card>;
}
