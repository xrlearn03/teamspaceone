import { useDevice } from "../../hooks/useDevice";
import { AppShellDesktop } from "./app-shell.desktop";
import { AppShellIOS } from "./app-shell.ios";
import { AppShellAndroid } from "./app-shell.android";

export function AppShell() {
  const { platform } = useDevice();

  // Route to platform-specific shell files so iOS, Android, and desktop/laptop
  // can each have their own layout without everything living in one file.
  if (platform === "ios") {
    return <AppShellIOS />;
  }

  if (platform === "android") {
    return <AppShellAndroid />;
  }

  // Desktop, laptop, and unknown platforms use the desktop shell.
  // The resolver also falls back to desktop for large windows even if the
  // user agent is not recognised.
  return <AppShellDesktop />;
}
