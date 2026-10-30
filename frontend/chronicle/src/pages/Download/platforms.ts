export type OS = "macos" | "windows" | "linux";

export const REPO = "https://github.com/Emyrk/chronicle-sidekick";

/** Release asset names carry no version, so /latest/download always serves the newest build. */
export function assetUrl(file: string) {
  return `${REPO}/releases/latest/download/${file}`;
}

interface Platform {
  os: OS;
  label: string;
  /** Primary download, then alternate architectures. */
  files: { label: string; file: string }[];
  /** Where the icon lives, e.g. "menu bar". */
  tray: string;
  install: string;
  note: string;
}

export const PLATFORMS: Platform[] = [
  {
    os: "windows",
    label: "Windows",
    files: [
      { label: "64-bit, no installer", file: "Chronicle-Sidekick-windows-amd64.exe" },
      { label: "ARM64", file: "Chronicle-Sidekick-windows-arm64.exe" },
    ],
    tray: "system tray",
    install:
      "Double-click the downloaded .exe. Sidekick appears in your system tray, near the clock. That is the whole install.",
    note: "Windows will warn you once because this build is not signed yet. On the SmartScreen prompt click More info, then Run anyway.",
  },
  {
    os: "macos",
    label: "macOS",
    files: [{ label: "Universal: Apple silicon and Intel", file: "Chronicle-Sidekick-macos.zip" }],
    tray: "menu bar",
    install:
      "Unzip, drag Chronicle Sidekick into Applications and open it. Sidekick appears in your menu bar. That is the whole install.",
    note: "macOS will warn you once because this build is not notarized yet. Right-click the app, choose Open, then Open again.",
  },
  {
    os: "linux",
    label: "Linux",
    files: [
      { label: "64-bit", file: "Chronicle-Sidekick-linux-amd64.tar.gz" },
      { label: "ARM64", file: "Chronicle-Sidekick-linux-arm64.tar.gz" },
    ],
    tray: "system tray",
    install: "Extract the archive and run chronicle-sidekick. Sidekick appears in your system tray. That is the whole install.",
    note: "Some desktops hide tray icons by default. If you don't see it, enable tray or AppIndicator icons in your desktop settings.",
  },
];

export function detectOS(ua: string = navigator.userAgent): OS {
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "macos";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "windows";
}
