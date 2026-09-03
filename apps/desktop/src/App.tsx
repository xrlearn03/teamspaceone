import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "./components/layouts/app-shell";
import { RealtimeProvider } from "./hooks/useRealtime";
import { AuthScreen } from "./screens/auth";
import { getAccessToken } from "./lib/api";

function AuthGate() {
  const queryClient = useQueryClient();
  const { data: token, isLoading } = useQuery({
    queryKey: ["access-token"],
    queryFn: getAccessToken,
    staleTime: Infinity,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-text-muted">
        Loading…
      </div>
    );
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
