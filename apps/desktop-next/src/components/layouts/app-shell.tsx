"use client";

import { useDevice } from "@/hooks/useDevice";
import { AppShellDesktop } from "./app-shell.desktop";
import { AppShellIOS } from "./app-shell.ios";
import { AppShellAndroid } from "./app-shell.android";

export function AppShell() {
  const { platform } = useDevice();

  if (platform === "ios") {
    return <AppShellIOS />;
  }

  if (platform === "android") {
    return <AppShellAndroid />;
  }

  // Desktop and unknown platforms default to the desktop shell.
  return <AppShellDesktop />;
}
