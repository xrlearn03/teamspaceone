import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "./components/layouts/app-shell";
import { SplashScreen } from "./components/splash/splash-screen";
import { RealtimeProvider } from "./hooks/useRealtime";
import { AuthScreen } from "./screens/auth";
import { OnboardingScreen } from "./screens/onboarding";
import { getAccessToken, getOrganisations, getActiveOrganisation, setActiveOrganisation } from "./lib/api";
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
  const { data: organisations } = useQuery({
    queryKey: ["organisations"],
    queryFn: getOrganisations,
    enabled: Boolean(token),
    staleTime: 60 * 1000,
    retry: false,
  });

  // Auto-select the first organisation when none is active yet.
  useEffect(() => {
    if (organisations && organisations.length > 0 && !getActiveOrganisation()) {
      setActiveOrganisation(organisations[0].id);
      setOrganisation(organisations[0].id);
    }
  }, [organisations, setOrganisation]);

  useEffect(() => {
    const timer = setTimeout(() => setMinSplashElapsed(true), MIN_SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading || !minSplashElapsed) {
    return <SplashScreen />;
  }

  if (!token) {
    return (
      <AuthScreen
        onAuthenticated={() => {
          queryClient.invalidateQueries({ queryKey: ["access-token"] });
        }}
      />
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
