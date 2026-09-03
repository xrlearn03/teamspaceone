import { AppShell } from "./components/layouts/app-shell";
import { RealtimeProvider } from "./hooks/useRealtime";

function App() {
  return (
    <RealtimeProvider>
      <AppShell />
    </RealtimeProvider>
  );
}

export default App;
