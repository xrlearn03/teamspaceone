import { useDevice } from "@/hooks/useDevice";
import { MobileShell } from "./mobile-shell";
import { TabletShell } from "./tablet-shell";

export function AppShellIOS() {
  const { formFactor } = useDevice();

  // iPhone → mobile bottom navigation, iPad → tablet sidebar.
  return formFactor === "tablet" ? <TabletShell /> : <MobileShell />;
}
