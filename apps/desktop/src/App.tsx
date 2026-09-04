import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "./components/layouts/app-shell";
import { SplashScreen } from "./components/splash/splash-screen";
import { RealtimeProvider } from "./hooks/useRealtime";
import { AuthScreen } from "./screens/auth";
import { getAccessToken } from "./lib/api";

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

  return (
    <RealtimeProvider>
      <AppShell />
    </RealtimeProvider>
  );
}

function App() {
  return <AuthGate />;
}

export default App;
