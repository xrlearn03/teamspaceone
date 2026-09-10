export type DevicePlatform = "ios" | "android" | "desktop" | "unknown";
export type DeviceFormFactor = "mobile" | "tablet" | "desktop";

export interface DeviceInfo {
  platform: DevicePlatform;
  formFactor: DeviceFormFactor;
  isTouch: boolean;
  isTauri: boolean;
  width: number;
  height: number;
}

function userAgentIncludes(token: string): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.toLowerCase().includes(token);
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function isTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 1;
}

function isIPad(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("ipad")) return true;
  // Modern iPadOS reports as Macintosh with touch support.
  if (ua.includes("macintosh") && navigator.maxTouchPoints > 1) return true;
  // Older iPad Pro user agent may contain "mac os" and touch points.
  if ((ua.includes("macintosh") || ua.includes("mac os")) && navigator.maxTouchPoints > 1) return true;
  return false;
}

export function getPlatform(): DevicePlatform {
  if (userAgentIncludes("iphone") || userAgentIncludes("ipod") || isIPad()) return "ios";
  if (userAgentIncludes("android")) return "android";
  if (isTauri()) return "desktop";
  if (userAgentIncludes("windows") || userAgentIncludes("macintosh") || userAgentIncludes("linux")) {
    return "desktop";
  }
  return "unknown";
}

function getFormFactor(platform: DevicePlatform, width: number, height: number): DeviceFormFactor {
  const min = Math.min(width, height);
  const max = Math.max(width, height);

  // iPad is always a tablet unless it's a very small window.
  if (platform === "ios" && isIPad() && max >= 768) return "tablet";

  // Desktop platform is always desktop (windowed app).
  if (platform === "desktop") return "desktop";

  // Phones: short edge <= 767
  if (min <= 767) return "mobile";

  // Tablets: short edge between 768 and 1024
  if (min <= 1024) return "tablet";

  return "desktop";
}

export function getDeviceInfo(): DeviceInfo {
  const width = typeof window !== "undefined" ? window.innerWidth : 1024;
  const height = typeof window !== "undefined" ? window.innerHeight : 768;
  const platform = getPlatform();

  return {
    platform,
    formFactor: getFormFactor(platform, width, height),
    isTouch: isTouchDevice(),
    isTauri: isTauri(),
    width,
    height,
  };
}
