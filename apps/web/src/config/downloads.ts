/**
 * Centralized download configuration for Teamspace One installers.
 *
 * The macOS installer (.dmg) is shipped in `public/downloads/`.
 *
 * ⚠️ Windows installer: the `.exe` build is not yet available in this repo
 * (the Tauri Windows build must be produced on a Windows/CI machine).
 * When the installer is ready, place it at:
 *   apps/web/public/downloads/Teamspace-One-Setup.exe
 * and the Windows button will work immediately — no code changes needed.
 */
export const downloadLinks = {
  windows: "/downloads/Teamspace-One-Setup.exe",
  macos: "/downloads/Teamspace%20One.dmg",
} as const;

export const platformMeta = {
  windows: {
    label: "Download for Windows",
    sublabel: "Windows 10 and later",
  },
  macos: {
    label: "Download for macOS",
    sublabel: "macOS 12 and later",
  },
} as const;
