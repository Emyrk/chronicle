import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

type OS = "mac" | "windows" | "linux";

interface Asset {
  os: OS;
  name: string;
  label: string;
  note: string;
}

const RELEASES_URL = "https://github.com/Emyrk/chronicle/releases";
const API_URL = "https://api.github.com/repos/Emyrk/chronicle/releases?per_page=30";

// File names are fixed by .goreleaser.uploader.yaml.
const ASSETS: Asset[] = [
  { os: "mac", name: "Chronicle-Uploader-macos.zip", label: "macOS (Apple silicon & Intel)", note: "Unzip and drag to Applications." },
  { os: "windows", name: "Chronicle-Uploader-windows-amd64.exe", label: "Windows (64-bit)", note: "A single .exe, no installer." },
  { os: "linux", name: "Chronicle-Uploader-linux-amd64.tar.gz", label: "Linux (64-bit)", note: "Extract and run." },
];

function detectOS(): OS | null {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "mac";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return null;
}

interface GHAsset {
  name: string;
  browser_download_url: string;
}

async function latestUploaderRelease() {
  const res = await fetch(API_URL, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error("Could not load releases.");
  const releases = (await res.json()) as {
    tag_name: string;
    draft: boolean;
    prerelease: boolean;
    assets: GHAsset[];
  }[];
  return releases.find((r) => !r.draft && !r.prerelease && r.tag_name.startsWith("uploader/v")) ?? null;
}

export function DownloadPage() {
  const release = useQuery({ queryKey: ["uploader-release"], queryFn: latestUploaderRelease, staleTime: 5 * 60_000 });
  const detected = detectOS();
  const ordered = [...ASSETS].sort((a, b) => Number(b.os === detected) - Number(a.os === detected));
  const urlFor = (a: Asset) =>
    release.data?.assets.find((x) => x.name === a.name)?.browser_download_url ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Chronicle Uploader</h1>
        <p className="mt-2 text-muted-foreground">
          A small tray app that uploads your combat log after each play session. Pair it once with your Chronicle
          account and you are done.
        </p>
      </div>

      {release.isLoading && <p className="text-sm text-muted-foreground">Looking up the latest release...</p>}
      {(release.isError || (release.isSuccess && !release.data)) && (
        <p className="text-sm text-muted-foreground">
          Couldn't find a release automatically. Browse them on{" "}
          <a className="text-blue-500 hover:underline" href={RELEASES_URL}>
            GitHub
          </a>
          .
        </p>
      )}

      <div className="space-y-3">
        {ordered.map((a, i) => {
          const url = urlFor(a);
          const primary = i === 0 && a.os === detected;
          return (
            <div key={a.os} className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <div className="font-medium">
                  {a.label}
                  {primary && <span className="ml-2 text-xs text-muted-foreground">Recommended for you</span>}
                </div>
                <div className="text-sm text-muted-foreground">{a.note}</div>
              </div>
              {url ? (
                <Button asChild variant={primary ? "default" : "outline"}>
                  <a href={url}>Download</a>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Unavailable
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <section className="space-y-2">
        <h2 className="font-medium">Opening an unsigned build</h2>
        <p className="text-sm text-muted-foreground">
          This version isn't signed yet, so your OS will warn you the first time.
        </p>
        <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">macOS:</strong> right-click (or Control-click) the app and choose{" "}
            <strong className="text-foreground">Open</strong>, then confirm. If it is still blocked, open System
            Settings &gt; Privacy &amp; Security and click <strong className="text-foreground">Open Anyway</strong>.
          </li>
          <li>
            <strong className="text-foreground">Windows:</strong> on the SmartScreen prompt click{" "}
            <strong className="text-foreground">More info</strong>, then <strong className="text-foreground">Run anyway</strong>.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Turn on combat logging in WoW</h2>
        <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
          <li>
            Go to <strong className="text-foreground">Options &gt; System &gt; Network</strong> and check{" "}
            <strong className="text-foreground">Advanced Combat Logging</strong>.
          </li>
          <li>
            Before the raid, type <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/combatlog</code>.
          </li>
        </ol>
        <p className="text-sm text-muted-foreground">
          Prefer to upload by hand? See{" "}
          <Link to="/upload" className="text-blue-500 hover:underline">
            the upload page
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
