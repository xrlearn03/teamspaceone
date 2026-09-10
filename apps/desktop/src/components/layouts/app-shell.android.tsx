import { useDevice } from "../../hooks/useDevice";
import { MobileShell } from "./mobile-shell";
import { TabletShell } from "./tablet-shell";

export function AppShellAndroid() {
  const { formFactor } = useDevice();

  // Android phones → mobile bottom navigation, Android tablets → tablet sidebar.
  return formFactor === "tablet" ? <TabletShell /> : <MobileShell />;
}
