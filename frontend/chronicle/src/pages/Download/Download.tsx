import { Link, useLocation } from "react-router-dom";
import { BatteryFull, Check, ChevronRight, Download as DownloadIcon, ExternalLink, Info, Wifi } from "lucide-react";
import { useSiteConfig } from "@/api/queries";
import { cn } from "@/lib/utils";
import { tenantAddons, type TenantAddons } from "./formatAddons";
import { PLATFORMS, REPO, assetUrl, detectOS, type OS } from "./platforms";

const ICON = "/c/chronicle/ChronicleIconSquare.webp";

// Sidekick's tray state colors (chronicle-sidekick icons.go).
const GREY = "#8a8f98";
const GREEN = "#22c55e";
const BLUE = "#3b82f6";

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
      {children}
    </a>
  );
}

/** The Sidekick tray icon with its state dot. */
function TrayIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <img src={ICON} alt="" className="h-full w-full rounded-sm" />
      <span
        className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-black"
        style={{ background: color }}
      />
    </span>
  );
}

type MenuItem = [label: string, style: "dim" | "hot" | "sep" | "sub" | ""];

/** A mocked Sidekick tray menu. */
function TrayMenu({ items, className }: { items: MenuItem[]; className?: string }) {
  return (
    <div
      className={cn(
        "w-60 max-w-full rounded-lg border border-white/10 bg-zinc-800/95 p-1 text-xs text-zinc-100 shadow-2xl shadow-black/60",
        className,
      )}
    >
      {items.map(([label, style], i) =>
        style === "sep" ? (
          <div key={i} className="mx-1.5 my-1 h-px bg-white/10" />
        ) : (
          <div
            key={i}
            className={cn(
              "flex items-center justify-between rounded px-2.5 py-1",
              style === "dim" && "text-zinc-400",
              style === "hot" && "bg-primary font-semibold text-primary-foreground",
            )}
          >
            {label}
            {style === "sub" && <ChevronRight className="h-3 w-3 text-zinc-400" />}
          </div>
        ),
      )}
    </div>
  );
}

function Shot({ label, children, className }: { label?: string; children: React.ReactNode; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("flex h-40 flex-col justify-center gap-3 overflow-hidden rounded-lg bg-black/40 px-4", className)}>
      {label && <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</div>}
      {children}
    </div>
  );
}

function StepCard({ n, title, shot, children }: { n: number; title: string; shot: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      {shot}
      <div className="flex items-baseline gap-3 px-1">
        <span className="font-wow text-2xl text-primary">{n}</span>
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <div className="space-y-3 px-1 pb-1 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </li>
  );
}

/** Step 3: the tenant's companion addon, which turns on combat logging by itself. */
export function AddonStep({ addons, defaultNeedsNoAddon }: TenantAddons) {
  if (defaultNeedsNoAddon || addons.length === 0) {
    return (
      <StepCard
        n={3}
        title="Turn on combat logging"
        shot={
          <Shot label="In-game chat">
            <div className="space-y-1 rounded border border-white/10 bg-black/60 px-2.5 py-2 font-mono text-xs">
              <div className="text-yellow-300">Combat logging enabled.</div>
              <div className="rounded bg-white/5 px-1.5 py-0.5 text-white">
                <span className="text-zinc-500">Say: </span>/combatlog
              </div>
            </div>
          </Shot>
        }
      >
        <p>
          No addon needed. Check{" "}
          <strong className="text-foreground">Options › System › Network › Advanced Combat Logging</strong>, then type{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/combatlog</code> before the raid.
        </p>
      </StepCard>
    );
  }
  const [primary, ...others] = addons;
  return (
    <StepCard
      n={3}
      title="Install the addon"
      shot={
        <Shot label="In game">
          <div className="flex items-center gap-2 rounded border border-amber-200/20 bg-black/60 px-2.5 py-2 text-xs text-amber-100">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-amber-300/60 bg-amber-400/20">
              <Check className="h-3 w-3 text-amber-300" strokeWidth={3} />
            </span>
            {primary.name}
          </div>
          <div className="rounded border border-white/10 bg-black/60 px-2.5 py-1.5 font-mono text-xs text-yellow-300">
            Combat logging enabled.
          </div>
        </Shot>
      }
    >
      <p>
        Install{" "}
        <ExtLink href={primary.url}>
          <strong>{primary.name}</strong>
        </ExtLink>
        . It turns on combat logging every time you log in, so there's nothing to type.
        {primary.requires.length > 0 && (
          <>
            {" "}It needs{" "}
            {primary.requires.map((r, i) => (
              <span key={r.name}>
                {i > 0 && ", "}
                <ExtLink href={r.url}>{r.name}</ExtLink>
              </span>
            ))}
            .
          </>
        )}
      </p>
      {others.length > 0 && (
        <p className="text-xs">
          On another client?{" "}
          {others.map((a, i) => (
            <span key={`${a.name}-${a.client}`}>
              {i > 0 && " · "}
              <ExtLink href={a.url}>{a.name}</ExtLink> ({a.client})
            </span>
          ))}
        </p>
      )}
    </StepCard>
  );
}

const NIGHT = [
  { time: "19:45", color: GREY, text: "Open WoW. The addon turns logging on." },
  { time: "20:02", color: GREEN, text: "First pull. The icon goes green while it records." },
  { time: "23:10", color: BLUE, text: "Done? Click Upload now in the tray." },
];

export function DownloadView({ os, addons }: { os: OS; addons: TenantAddons }) {
  const current = PLATFORMS.find((p) => p.os === os) ?? PLATFORMS[0];
  const [primary, ...alternates] = current.files;
  const others = PLATFORMS.filter((p) => p !== current);

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-240px] h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl"
      />

      <div className="relative mx-auto max-w-6xl space-y-20 px-4 py-12 sm:py-16">
        <section className="grid items-center gap-12 md:grid-cols-[1.15fr_1fr]">
          <div className="space-y-6">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Chronicle Sidekick</p>
            <h1 className="font-wow text-4xl leading-[1.05] sm:text-6xl">
              Install once.
              <br />
              Every raid, one click.
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
              A tiny app in your {current.tray} that finds WoW, watches the combat log while you play, and sends it to
              Chronicle when you're done. No digging for log files.
            </p>
            <div className="space-y-3">
              <a
                href={assetUrl(primary.file)}
                className="group inline-flex min-h-14 items-center gap-3 rounded-lg bg-primary px-8 text-lg font-bold text-primary-foreground shadow-xl shadow-primary/25 transition-transform hover:-translate-y-0.5"
              >
                <DownloadIcon className="h-5 w-5 transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
                Download for {current.label}
              </a>
              <p className="text-sm text-muted-foreground">
                Free · {primary.label}
                {alternates.map((a) => (
                  <span key={a.file}>
                    {" · "}
                    <a href={assetUrl(a.file)} className="text-link hover:underline">
                      {a.label}
                    </a>
                  </span>
                ))}
                {" · Also for "}
                {others.map((p, i) => (
                  <span key={p.os}>
                    {i > 0 && " and "}
                    <a href={assetUrl(p.files[0].file)} className="text-link hover:underline">
                      {p.label}
                    </a>
                  </span>
                ))}
              </p>
            </div>
          </div>

          {/* The real tray menu, mid-raid. */}
          <div aria-hidden="true" className="mx-auto w-full max-w-sm">
            <div className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 shadow-2xl shadow-black/50">
              <div className="flex h-8 items-center justify-end gap-3 bg-black/70 px-3 text-[11px] font-semibold text-zinc-100">
                <span className="rounded bg-white/15 p-0.5">
                  <TrayIcon color={GREEN} size={16} />
                </span>
                <Wifi className="h-3.5 w-3.5" />
                <BatteryFull className="h-4 w-4" />
                <span>Wed 21:14</span>
              </div>
              <div className="flex justify-end p-3 pb-10">
                <TrayMenu
                  items={[
                    ["Recording", "dim"],
                    ["sep", "sep"],
                    ["Upload now", "hot"],
                    ["Open last report", ""],
                    ["sep", "sep"],
                    ["World of Warcraft folders", "sub"],
                    ["Add WoW folder…", ""],
                    ["sep", "sep"],
                    ["Quit", "dim"],
                  ]}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6">
          <h2 className="font-wow text-3xl">Three steps, then forget about it</h2>
          <ol className="grid gap-5 md:grid-cols-3">
            <StepCard
              n={1}
              title="Open it"
              shot={
                <Shot label={`Your ${current.tray}`}>
                  <div className="flex h-8 items-center justify-end gap-3 rounded-md border border-white/10 bg-black/70 px-3 text-[11px] font-semibold text-zinc-100">
                    <TrayIcon color={GREY} />
                    <Wifi className="h-3.5 w-3.5" />
                    <BatteryFull className="h-4 w-4" />
                    <span>19:41</span>
                  </div>
                </Shot>
              }
            >
              <p>{current.install}</p>
              <p className="flex gap-2 rounded-md bg-muted/50 p-2.5 text-xs">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                <span>{current.warning}</span>
              </p>
            </StepCard>
            <StepCard
              n={2}
              title="Connect to Chronicle"
              shot={
                <Shot className="items-center">
                  <TrayMenu
                    className="w-52"
                    items={[
                      ["Not connected", "dim"],
                      ["sep", "sep"],
                      ["Upload now", "dim"],
                      ["Connect to Chronicle…", "hot"],
                      ["sep", "sep"],
                      ["Quit", "dim"],
                    ]}
                  />
                </Shot>
              }
            >
              <p>
                Click the icon, choose <strong className="text-foreground">Connect to Chronicle…</strong> and approve in
                your browser. New here? Signing in with Discord creates your account.
              </p>
            </StepCard>
            <AddonStep {...addons} />
          </ol>
        </section>

        <section className="space-y-8">
          <h2 className="font-wow text-3xl">Raid night, as Sidekick sees it</h2>
          <ol className="relative grid gap-6 sm:grid-cols-4">
            <div
              aria-hidden="true"
              className="absolute left-[12%] right-[12%] top-7 hidden border-t-2 border-dashed border-border sm:block"
            />
            {NIGHT.map((n) => (
              <li key={n.time} className="relative flex items-center gap-4 sm:flex-col sm:text-center">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                  <TrayIcon color={n.color} size={26} />
                </div>
                <div className="space-y-1">
                  <div className="font-semibold">{n.time}</div>
                  <div className="text-sm text-muted-foreground">{n.text}</div>
                </div>
              </li>
            ))}
            <li className="relative flex items-center gap-4 sm:flex-col sm:text-center">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary ring-[6px] ring-primary/20">
                <img src={ICON} alt="" className="h-7 w-7 rounded" />
              </div>
              <div className="space-y-1">
                <div className="font-semibold">23:11</div>
                <div className="text-sm text-muted-foreground">Your report is up. Go argue about parses.</div>
              </div>
            </li>
          </ol>
        </section>

        <section className="flex flex-col gap-6 border-t border-border pt-8 text-sm text-muted-foreground md:flex-row md:items-start md:justify-between">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              Only reads your combat log
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              Updates itself
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" aria-hidden="true" />
              <ExtLink href={REPO}>Open source</ExtLink>
            </li>
          </ul>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/upload" className="text-link hover:underline">
              Upload by hand
            </Link>
            <Link to="/account/sidekick" className="text-link hover:underline">
              Your computers
            </Link>
            <ExtLink href={`${REPO}/releases`}>
              All releases <ExternalLink className="inline h-3 w-3" aria-hidden="true" />
            </ExtLink>
          </div>
        </section>
      </div>
    </div>
  );
}

export function DownloadPage() {
  const { data: siteConfig } = useSiteConfig();
  // ?os= lets a link pick the platform, e.g. "Download for Windows".
  const requested = new URLSearchParams(useLocation().search).get("os");
  const os = PLATFORMS.some((p) => p.os === requested) ? (requested as OS) : detectOS();
  return <DownloadView os={os} addons={tenantAddons(siteConfig)} />;
}
