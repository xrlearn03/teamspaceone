import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { PermissionProvider } from "@teamspace-one/authorization/react";
import type { AuthorizableUser } from "@teamspace-one/authorization";
import { AppShell } from "./components/layouts/app-shell";
import { SplashScreen } from "./components/splash/splash-screen";
import { RealtimeProvider } from "./hooks/useRealtime";
import { AuthScreen } from "./screens/auth";
import { GuestMeetingScreen } from "./screens/guest-meeting";
import { OnboardingScreen } from "./screens/onboarding";
import { ForcePasswordChangeDialog } from "./components/auth/force-password-change-dialog";
import { getAccessToken, getMe, getMyContext, getOrganisations, getActiveOrganisation, setActiveOrganisation, setOnSessionCleared, extractMeetingJoinToken } from "./lib/api";
import { Button } from "@teamspace-one/ui/button";
import { useUIStore } from "./stores/ui";
import { UpdateChecker } from "./components/update/update-checker";

const MIN_SPLASH_DURATION_MS = 4000;

function AuthGate({ onJoinAsGuest }: { onJoinAsGuest?: () => void }) {
  const [session, setSession] = useState(0);
  const queryClient = useQueryClient();
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);

  // Minimum splash duration applies only at app launch: AuthGate never
  // remounts, so this timer does not replay on login or org switches.
  useEffect(() => {
    const timer = setTimeout(() => setMinSplashElapsed(true), MIN_SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  // If an API call invalidates the session (expired/rotated refresh token),
  // clear the cached auth state and remount the gate so the login screen
  // is shown instead of leaving the user on an error screen.
  useEffect(() => {
    setOnSessionCleared(() => {
      queryClient.clear();
      setSession((s) => s + 1);
    });
    return () => setOnSessionCleared(null);
  }, [queryClient]);

  if (!minSplashElapsed) {
    return <SplashScreen />;
  }

  return (
    <AuthGateInner
      key={session}
      onAuthenticated={() => {
        // Drop every cached query so data from a previously signed-in
        // account cannot leak through, then remount the gate so the
        // access-token query refetches from localStorage.
        queryClient.clear();
        setSession((s) => s + 1);
      }}
      onJoinAsGuest={onJoinAsGuest}
    />
  );
}

function AuthGateInner({ onAuthenticated, onJoinAsGuest }: { onAuthenticated: () => void; onJoinAsGuest?: () => void }) {
  const { data: token, isLoading } = useQuery({
    queryKey: ["access-token"],
    queryFn: getAccessToken,
    staleTime: Infinity,
    retry: false,
  });
  const organisationId = useUIStore((s) => s.organisationId);
  const setOrganisation = useUIStore((s) => s.setOrganisation);
  const {
    data: organisations,
    isLoading: organisationsLoading,
    isError: organisationsError,
    error: organisationsErrorDetail,
    refetch: refetchOrganisations,
  } = useQuery({
    queryKey: ["organisations"],
    queryFn: getOrganisations,
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    retry: false,
  });
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    retry: false,
  });
  const forcePasswordChange = Boolean(token && me?.mustChangePassword);

  // Keep the active organisation in sync with what the backend reports:
  // pick the first org when none (or a stale one) is selected, and clear
  // the selection entirely when the user belongs to no organisation.
  useEffect(() => {
    if (!organisations) return;
    const active = getActiveOrganisation();
    if (organisations.length === 0) {
      if (active) {
        setActiveOrganisation(null);
        setOrganisation(null);
      }
      return;
    }
    if (!active || !organisations.some((o) => o.id === active)) {
      setActiveOrganisation(organisations[0].id);
      setOrganisation(organisations[0].id);
    }
  }, [organisations, setOrganisation]);

  // The branded splash only shows at app launch (handled in AuthGate).
  // Post-login/org transitions get a lightweight spinner while the token
  // read and organisation fetch are in flight.
  if (isLoading || (token && organisationsLoading)) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!token) {
    return (
      <AuthScreen onAuthenticated={onAuthenticated} onJoinAsGuest={onJoinAsGuest} />
    );
  }

  if (organisationsError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm font-medium text-text">Couldn&apos;t load your organisations</p>
        <p className="max-w-sm text-xs text-text-muted">
          {organisationsErrorDetail instanceof Error
            ? organisationsErrorDetail.message
            : "Check your connection and try again."}
        </p>
        <Button variant="secondary" onClick={() => refetchOrganisations()}>
          Retry
        </Button>
      </div>
    );
  }

  // Welcome / workspace-selection step: no organisations yet.
  if (organisations && organisations.length === 0) {
    return (
      <>
        <OnboardingScreen />
        {forcePasswordChange ? <ForcePasswordChangeDialog me={me} /> : null}
      </>
    );
  }

  // Keying on the organisation id remounts the whole authenticated subtree
  // on switch: the realtime socket reconnects and joins only the new
  // organisation's rooms, and every screen refetches under the new org.
  return (
    <RealtimeProvider key={organisationId ?? "none"}>
      <PermissionBoundary organisationId={organisationId} />
      {forcePasswordChange ? <ForcePasswordChangeDialog me={me} /> : null}
    </RealtimeProvider>
  );
}

/**
 * Loads the caller's RBAC context (permissions + data scopes) for the active
 * organisation and exposes it to the shell. Until it resolves, nothing
 * permission-gated renders; on failure the user gets a retry instead of a
 * silently de-permissioned app.
 */
function PermissionBoundary({ organisationId }: { organisationId: string | null }) {
  const {
    data: context,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["me-context", organisationId],
    queryFn: () => getMyContext(organisationId as string),
    enabled: Boolean(organisationId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  if (!organisationId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm font-medium text-text">No organisation selected</p>
        <p className="max-w-sm text-xs text-text-muted">
          Select or create an organisation to continue.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !context) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <p className="text-sm font-medium text-text">Couldn&apos;t load your permissions</p>
        <p className="max-w-sm text-xs text-text-muted">
          {error instanceof Error ? error.message : "Check your connection and try again."}
        </p>
        <Button variant="secondary" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const user: AuthorizableUser = {
    id: context.id,
    organisationId: context.organisationId,
    permissions: context.permissions,
    dataScopes: context.dataScopes,
    isSuperAdmin: context.isSuperAdmin,
    roleName: context.roleName,
    roleCategory: context.roleCategory,
  };

  return (
    <PermissionProvider user={user}>
      <AppShell />
    </PermissionProvider>
  );
}

function App() {
  // Guest meeting links: `teamspace-one://join/<token>` deep links (cold start
  // via the `get_deep_link` command, warm start via the plugin's
  // `deep-link://new-url` event) and the manual "join as guest" entry both land
  // here. A non-null value replaces the whole app with the guest join screen.
  const [guestToken, setGuestToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    const handle = (urls: string[] | string) => {
      for (const url of Array.isArray(urls) ? urls : [urls]) {
        const token = extractMeetingJoinToken(url);
        if (token) {
          setGuestToken(token);
          break;
        }
      }
    };
    invoke<string[] | null>("get_deep_link")
      .then((urls) => { if (urls) handle(urls); })
      .catch(() => undefined);
    const unlisten = listen<string[]>("deep-link://new-url", (e) => handle(e.payload));
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  if (guestToken !== null) {
    return (
      <GuestMeetingScreen
        initialToken={guestToken || undefined}
        onExit={() => setGuestToken(null)}
      />
    );
  }

  return (
    <>
      <AuthGate onJoinAsGuest={() => setGuestToken("")} />
      <UpdateChecker />
    </>
  );
}

export default App;
