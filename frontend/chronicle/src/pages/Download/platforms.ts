export type OS = "macos" | "windows" | "linux";

export const REPO = "https://github.com/Emyrk/chronicle-sidekick";

/** Release asset names carry no version, so /latest/download always serves the newest build. */
export function assetUrl(file: string) {
  return `${REPO}/releases/latest/download/${file}`;
}

interface Asset {
  label: string;
  file: string;
}

interface Platform {
  os: OS;
  label: string;
  /** The download most players want. */
  primary: Asset;
  /** Fallbacks, each introduced by who it's for, e.g. "ARM PC?". */
  alternates: { prompt: string; links: Asset[] }[];
  /** Where the icon lives, e.g. "menu bar". */
  tray: string;
  install: string;
  note: string;
}

export const PLATFORMS: Platform[] = [
  {
    os: "windows",
    label: "Windows",
    primary: { label: "Installer for most PCs", file: "Chronicle-Sidekick-Setup-windows-amd64.exe" },
    alternates: [
      { prompt: "Rather not install?", links: [{ label: "Portable .exe", file: "Chronicle-Sidekick-windows-amd64.exe" }] },
      {
        prompt: "ARM PC, like Snapdragon?",
        links: [
          { label: "Installer", file: "Chronicle-Sidekick-Setup-windows-arm64.exe" },
          { label: "Portable", file: "Chronicle-Sidekick-windows-arm64.exe" },
        ],
      },
    ],
    tray: "system tray",
    install:
      "Run the installer and leave Start Chronicle Sidekick checked on the last screen. Sidekick appears in your system tray, near the clock, and in your Start menu. No admin rights needed.",
    note: "Windows will warn you once because this build is not signed yet. On the SmartScreen prompt click More info, then Run anyway.",
  },
  {
    os: "macos",
    label: "macOS",
    primary: { label: "Works on Apple silicon and Intel", file: "Chronicle-Sidekick-macos.dmg" },
    alternates: [{ prompt: "Prefer a zip?", links: [{ label: "Zipped app", file: "Chronicle-Sidekick-macos.zip" }] }],
    tray: "menu bar",
    install:
      "Open the .dmg, drag Chronicle Sidekick into Applications and open it from there. Sidekick appears in your menu bar. That is the whole install.",
    note: "macOS will warn you once because this build is not notarized yet. Right-click the app, choose Open, then Open again.",
  },
  {
    os: "linux",
    label: "Linux",
    primary: { label: "For x86_64 PCs", file: "Chronicle-Sidekick-linux-amd64.tar.gz" },
    alternates: [{ prompt: "ARM device?", links: [{ label: "ARM64 tarball", file: "Chronicle-Sidekick-linux-arm64.tar.gz" }] }],
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
