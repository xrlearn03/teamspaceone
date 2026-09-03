import { useState } from "react";
import {
  Bell,
  Command,
  CreditCard,
  Key,
  Monitor,
  Moon,
  Palette,
  Plug,
  Shield,
  Sun,
  User,
  Users,
} from "lucide-react";
import { useUIStore } from "../stores/ui";
import { useShallow } from "zustand/shallow";
import { useMe, useOrganisations, useWorkspaces } from "../hooks/api";
import { getActiveOrganisation } from "../lib/api";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { cn } from "../lib/utils";

const sections = [
  { id: "account", label: "My account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "shortcuts", label: "Keyboard shortcuts", icon: Command },
  { id: "privacy", label: "Privacy & security", icon: Shield },
  { id: "organisation", label: "Organisation", icon: Users },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "integrations", label: "Integrations", icon: Plug },
];

export function SettingsScreen() {
  const [section, setSection] = useState("appearance");
  const { data: user } = useMe();
  const activeOrgId = getActiveOrganisation();
  const { data: organisations } = useOrganisations();
  const { data: workspaces } = useWorkspaces(activeOrgId ?? undefined);
  const organisation = organisations?.find((o) => o.id === activeOrgId);
  const workspace = workspaces?.[0];
  const userName =
    user?.firstName
      ? `${user.firstName} ${user.lastName ?? ""}`.trim()
      : user?.email ?? "User";
  const { theme, setTheme } = useUIStore(
    useShallow((s) => ({ theme: s.theme, setTheme: s.setTheme })),
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center border-b px-6">
        <h1 className="text-lg font-semibold text-text">Settings</h1>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 shrink-0 border-r bg-surface p-2">
          {sections.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  section === s.id
                    ? "bg-primary-subtle text-primary"
                    : "text-text-secondary hover:bg-surface-elevated hover:text-text",
                )}
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {section === "account" && (
            <SettingsSection title="My account">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="text-xl">{userName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-base font-semibold text-text">{userName}</p>
                  <p className="text-sm text-text-muted">{user?.email}</p>
                </div>
              </div>
              <Button variant="secondary" className="mt-4">Edit profile</Button>
            </SettingsSection>
          )}

          {section === "appearance" && (
            <SettingsSection title="Appearance">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Theme</label>
                  <div className="flex gap-2">
                    {(["light", "dark", "system"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTheme(t)}
                        className={cn(
                          "flex flex-1 items-center justify-center gap-2 rounded-md border py-2 text-sm capitalize transition-colors",
                          theme === t
                            ? "border-primary bg-primary-subtle text-primary"
                            : "text-text-secondary hover:bg-surface-elevated",
                        )}
                      >
                        {t === "light" && <Sun className="h-4 w-4" />}
                        {t === "dark" && <Moon className="h-4 w-4" />}
                        {t === "system" && <Monitor className="h-4 w-4" />}
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Density</label>
                  <div className="flex gap-2">
                    {["Compact", "Default", "Comfortable"].map((d) => (
                      <button
                        key={d}
                        type="button"
                        className={cn(
                          "rounded-md border px-3 py-1.5 text-sm transition-colors",
                          d === "Default"
                            ? "border-primary bg-primary-subtle text-primary"
                            : "text-text-secondary hover:bg-surface-elevated",
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Accent color</label>
                  <div className="flex gap-2">
                    {["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#f43f5e"].map((c) => (
                      <button
                        key={c}
                        type="button"
                        className="h-6 w-6 rounded-full border"
                        style={{ backgroundColor: c }}
                        aria-label={`Accent color ${c}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </SettingsSection>
          )}

          {section === "notifications" && (
            <SettingsSection title="Notifications">
              <div className="space-y-3">
                {[
                  "Enable desktop notifications",
                  "Play sound for new messages",
                  "Show unread badge",
                  "Mute mentions outside work hours",
                ].map((label) => (
                  <label key={label} className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-sm text-text">{label}</span>
                    <input type="checkbox" defaultChecked className="h-4 w-4 accent-primary" />
                  </label>
                ))}
              </div>
            </SettingsSection>
          )}

          {section === "shortcuts" && (
            <SettingsSection title="Keyboard shortcuts">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { shortcut: "⌘K", action: "Global search" },
                  { shortcut: "⌘⇧]", action: "Open inbox" },
                  { shortcut: "Esc", action: "Close panels" },
                  { shortcut: "⌘+", action: "Increase font size" },
                ].map((s) => (
                  <div key={s.action} className="flex items-center justify-between rounded-md border p-3">
                    <span className="text-sm text-text">{s.action}</span>
                    <kbd className="rounded bg-surface-elevated px-2 py-0.5 text-xs font-mono text-text-secondary">
                      {s.shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            </SettingsSection>
          )}

          {section === "privacy" && (
            <SettingsSection title="Privacy & security">
              <div className="space-y-3">
                <Button variant="secondary" className="w-full justify-start">
                  <Key className="mr-2 h-4 w-4" /> Change password
                </Button>
                <Button variant="secondary" className="w-full justify-start">
                  <Shield className="mr-2 h-4 w-4" /> Manage two-factor auth
                </Button>
              </div>
            </SettingsSection>
          )}

          {section === "organisation" && (
            <SettingsSection title={organisation?.name ?? "Organisation"}>
              <p className="text-sm text-text-secondary">Workspace: {workspace?.name ?? "Default"}</p>
              <div className="mt-4 flex gap-2">
                <Button variant="secondary">Invite members</Button>
                <Button variant="secondary">Manage roles</Button>
              </div>
            </SettingsSection>
          )}

          {section === "billing" && (
            <SettingsSection title="Billing">
              <p className="text-sm text-text-secondary">Current plan: Pro</p>
              <p className="text-sm text-text-secondary">Next invoice: Sep 15, 2026</p>
              <Button variant="secondary" className="mt-4">View invoices</Button>
            </SettingsSection>
          )}

          {section === "integrations" && (
            <SettingsSection title="Integrations">
              <p className="text-sm text-text-secondary">Connect tools to Reactify.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {["Slack", "GitHub", "Figma", "Linear", "Notion"].map((tool) => (
                  <Button key={tool} variant="secondary" size="sm">
                    <Plug className="mr-1.5 h-3.5 w-3.5" />
                    {tool}
                  </Button>
                ))}
              </div>
            </SettingsSection>
          )}
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mb-6">
      <h2 className="mb-4 text-base font-semibold text-text">{title}</h2>
      {children}
    </Card>
  );
}
