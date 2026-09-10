import { useEffect, useState } from "react";
import { getDeviceInfo, type DeviceInfo } from "../lib/device";

export function useDevice(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(getDeviceInfo());

  useEffect(() => {
    function onChange() {
      setInfo(getDeviceInfo());
    }

    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);

    // Re-evaluate when touch capability becomes known (Tauri webview sometimes
    // reports 0 touch points until after first paint).
    const timeout = window.setTimeout(onChange, 0);

    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
      window.clearTimeout(timeout);
    };
  }, []);

  return info;
}
