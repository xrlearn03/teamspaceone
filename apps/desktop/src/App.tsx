import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "./components/layouts/app-shell";
import { SplashScreen } from "./components/splash/splash-screen";
import { RealtimeProvider } from "./hooks/useRealtime";
import { AuthScreen } from "./screens/auth";
import { OnboardingScreen } from "./screens/onboarding";
import { getAccessToken, getOrganisations, getActiveOrganisation, setActiveOrganisation } from "./lib/api";
import { Button } from "./components/ui/button";
import { useUIStore } from "./stores/ui";

const MIN_SPLASH_DURATION_MS = 4000;

function AuthGate() {
  const queryClient = useQueryClient();
  const { data: token, isLoading } = useQuery({
    queryKey: ["access-token"],
    queryFn: getAccessToken,
    staleTime: Infinity,
    retry: false,
  });
  const [minSplashElapsed, setMinSplashElapsed] = useState(false);
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

  useEffect(() => {
    const timer = setTimeout(() => setMinSplashElapsed(true), MIN_SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading || !minSplashElapsed || (token && organisationsLoading)) {
    return <SplashScreen />;
  }

  if (!token) {
    return (
      <AuthScreen
        onAuthenticated={() => {
          // Drop every cached query so data from a previously signed-in
          // account (e.g. an empty organisation list) cannot leak through,
          // then seed the token query directly — clearing the cache removes
          // the mounted access-token query, so invalidation alone would not
          // refetch it and the user would be bounced back to sign-in.
          void (async () => {
            const newToken = await getAccessToken();
            queryClient.clear();
            queryClient.setQueryData(["access-token"], newToken);
          })();
        }}
      />
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
