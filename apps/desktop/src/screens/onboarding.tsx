import { useState } from "react";
import { Building2, Mail, Sparkles } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card } from "../components/ui/card";
import { useAcceptInvitation, useCreateOrganisation, useMe } from "../hooks/api";
import { useSwitchOrganisation } from "../hooks/useOrganisationSwitch";
import { ApiError, logout } from "../lib/api";
import { cn, getUserDisplayName } from "../lib/utils";

/** Shown after sign-in when the user has no organisation yet. */
export function OnboardingScreen() {
  const { data: user } = useMe();
  const createOrganisation = useCreateOrganisation();
  const acceptInvitation = useAcceptInvitation();
  const switchOrganisation = useSwitchOrganisation();
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");

  async function signOut() {
    await logout();
    window.location.reload();
  }

  const displayName = getUserDisplayName(user, "there");

  function submitCreate() {
    if (!name.trim()) return;
    createOrganisation.mutate(name.trim(), {
      onSuccess: (org) => switchOrganisation(org.id),
    });
  }

  function submitJoin() {
    if (!token.trim()) return;
    acceptInvitation.mutate(token.trim(), {
      onSuccess: (member) => switchOrganisation(member.organisationId),
    });
  }

  const busy = createOrganisation.isPending || acceptInvitation.isPending;
  const error = createOrganisation.error ?? acceptInvitation.error;
  const errorMessage =
    mode === "create" && error instanceof ApiError && error.status === 409
      ? "An organisation with this name already exists. Try a different name."
      : error?.message;

  return (
    <div className="flex h-full items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Sparkles className="mx-auto mb-3 h-8 w-8 text-primary" />
          <h1 className="text-xl font-semibold text-text">Welcome, {displayName}</h1>
          <p className="mt-1 text-sm text-text-muted">
            To get started, create an organisation or join an existing one with an invitation.
          </p>
        </div>

        {mode === "choose" ? (
          <div className="space-y-3">
            <Card
              className="flex cursor-pointer items-center gap-3 p-4 transition-colors hover:border-primary/40"
              onClick={() => setMode("create")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setMode("create")}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-subtle text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text">Create an organisation</p>
                <p className="text-xs text-text-muted">Set up a new workspace for your team.</p>
              </div>
            </Card>
            <Card
              className="flex cursor-pointer items-center gap-3 p-4 transition-colors hover:border-primary/40"
              onClick={() => setMode("join")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && setMode("join")}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-elevated text-text-secondary">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-text">Join an organisation</p>
                <p className="text-xs text-text-muted">Use an invitation token you received.</p>
              </div>
            </Card>
          </div>
        ) : (
          <Card className="space-y-3 p-4">
            <h2 className="text-sm font-semibold text-text">
              {mode === "create" ? "Create organisation" : "Join organisation"}
            </h2>
            {mode === "create" ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Organisation name"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && submitCreate()}
              />
            ) : (
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Invitation token"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && submitJoin()}
              />
            )}
            {errorMessage ? <p className="text-sm text-error">{errorMessage}</p> : null}
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setMode("choose")} disabled={busy}>
                Back
              </Button>
              <Button
                onClick={mode === "create" ? submitCreate : submitJoin}
                disabled={busy || (mode === "create" ? !name.trim() : !token.trim())}
                className={cn(busy && "opacity-70")}
              >
                {busy ? "Working…" : mode === "create" ? "Create" : "Join"}
              </Button>
            </div>
          </Card>
        )}

        <p className="mt-6 text-center text-xs text-text-muted">
          Signed in as {getUserDisplayName(user, "…")} ·{" "}
          <button type="button" className="text-primary hover:underline" onClick={signOut}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
