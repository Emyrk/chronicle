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
  tray: string;
  install: string;
  warning: string;
}

export const PLATFORMS: Platform[] = [
  {
    os: "windows",
    label: "Windows",
    files: [
      { label: "64-bit", file: "Chronicle-Sidekick-windows-amd64.exe" },
      { label: "ARM64", file: "Chronicle-Sidekick-windows-arm64.exe" },
    ],
    tray: "system tray, near the clock",
    install: "Run the downloaded .exe. There is no installer.",
    warning: "The build isn't signed yet, so SmartScreen warns you once. Click More info, then Run anyway.",
  },
  {
    os: "macos",
    label: "macOS",
    files: [{ label: "Apple silicon and Intel", file: "Chronicle-Sidekick-macos.zip" }],
    tray: "menu bar",
    install: "Unzip it, drag Chronicle Sidekick into Applications and open it.",
    warning: "The app isn't notarized yet, so macOS warns you once. Right-click the app, choose Open, then Open again.",
  },
  {
    os: "linux",
    label: "Linux",
    files: [
      { label: "x86-64", file: "Chronicle-Sidekick-linux-amd64.tar.gz" },
      { label: "ARM64", file: "Chronicle-Sidekick-linux-arm64.tar.gz" },
    ],
    tray: "system tray",
    install: "Extract the archive and run chronicle-sidekick.",
    warning: "Some desktops hide tray icons. If you don't see it, turn on tray or AppIndicator icons in your desktop settings.",
  },
];

export function detectOS(ua: string = navigator.userAgent): OS {
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "macos";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "windows";
}
