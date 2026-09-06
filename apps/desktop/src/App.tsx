import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "./components/layouts/app-shell";
import { SplashScreen } from "./components/splash/splash-screen";
import { RealtimeProvider } from "./hooks/useRealtime";
import { AuthScreen } from "./screens/auth";
import { OnboardingScreen } from "./screens/onboarding";
import { getAccessToken, getOrganisations, getActiveOrganisation, setActiveOrganisation, setOnSessionCleared } from "./lib/api";
import { Button } from "./components/ui/button";
import { useUIStore } from "./stores/ui";

const MIN_SPLASH_DURATION_MS = 4000;

function AuthGate() {
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
    />
  );
}

function AuthGateInner({ onAuthenticated }: { onAuthenticated: () => void }) {
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
      <AuthScreen onAuthenticated={onAuthenticated} />
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
    return <OnboardingScreen />;
  }

  // Keying on the organisation id remounts the whole authenticated subtree
  // on switch: the realtime socket reconnects and joins only the new
  // organisation's rooms, and every screen refetches under the new org.
  return (
    <RealtimeProvider key={organisationId ?? "none"}>
      <AppShell />
    </RealtimeProvider>
  );
}

function App() {
  return <AuthGate />;
}

export default App;
