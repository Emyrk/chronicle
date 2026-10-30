import { Link, useLocation } from "react-router-dom";
import { Check, Download as DownloadIcon, ExternalLink, Info, MonitorUp, Puzzle, ScrollText, Swords, Upload } from "lucide-react";
import { useSiteConfig } from "@/api/queries";
import { tenantAddons, type TenantAddons } from "./formatAddons";
import { PLATFORMS, REPO, assetUrl, detectOS, type OS } from "./platforms";


function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
      {children}
    </a>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
          {n}
        </span>
        <h3 className="flex items-center gap-2 font-semibold">
          {icon}
          {title}
        </h3>
      </div>
      <div className="space-y-3 text-sm text-muted-foreground">{children}</div>
    </li>
  );
}

/** Step 3: the tenant's companion addon, which turns on combat logging by itself. */
export function AddonStep({ addons, defaultNeedsNoAddon }: TenantAddons) {
  if (defaultNeedsNoAddon || addons.length === 0) {
    return (
      <Step n={3} icon={<ScrollText className="h-4 w-4" />} title="Turn on combat logging">
        <p>
          No addon needed. In WoW, open <strong className="text-foreground">Options › System › Network</strong> and
          check <strong className="text-foreground">Advanced Combat Logging</strong>, then type{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">/combatlog</code> before the raid.
        </p>
      </Step>
    );
  }
  const [primary, ...others] = addons;
  return (
    <Step n={3} icon={<Puzzle className="h-4 w-4" />} title="Install the addon">
      <p>
        Install{" "}
        <ExtLink href={primary.url}>
          <strong>{primary.name}</strong>
        </ExtLink>{" "}
        into your <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Interface/AddOns</code> folder. It turns on
        combat logging every time you log in, so there's nothing to type.
      </p>
      {primary.requires.length > 0 && (
        <p>
          It also needs{" "}
          {primary.requires.map((r, i) => (
            <span key={r.name}>
              {i > 0 && ", "}
              <ExtLink href={r.url}>{r.name}</ExtLink>
            </span>
          ))}
          .
        </p>
      )}
      {others.length > 0 && (
        <p>
          On another client?{" "}
          {others.map((a, i) => (
            <span key={`${a.name}-${a.client}`}>
              {i > 0 && " · "}
              <ExtLink href={a.url}>{a.name}</ExtLink> ({a.client})
            </span>
          ))}
        </p>
      )}
    </Step>
  );
}

export function DownloadView({ os, addons }: { os: OS; addons: TenantAddons }) {
  const current = PLATFORMS.find((p) => p.os === os) ?? PLATFORMS[0];
  const [primary, ...alternates] = current.files;
  const others = PLATFORMS.filter((p) => p !== current);

  return (
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <section className="space-y-5 text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Chronicle Sidekick</p>
        <h1 className="font-wow text-4xl font-bold sm:text-5xl">Stop dragging log files around.</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          A small app that lives in your {current.tray}, finds your WoW folder and watches the combat log while you
          play. When the raid is done, one click sends it to Chronicle.
        </p>
        <div className="flex flex-col items-center gap-3">
          <a
            href={assetUrl(primary.file)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-lg transition-opacity hover:opacity-90"
          >
            <DownloadIcon className="h-5 w-5" aria-hidden="true" />
            Download for {current.label}
          </a>
          <p className="text-sm text-muted-foreground">
            {primary.label}
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
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Set up once</h2>
        <ol className="grid gap-4 md:grid-cols-3">
          <Step n={1} icon={<MonitorUp className="h-4 w-4" />} title="Open it">
            <p>{current.install} The icon appears in your {current.tray}.</p>
            <p className="flex gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{current.warning}</span>
            </p>
          </Step>
          <Step n={2} icon={<Swords className="h-4 w-4" />} title="Connect to Chronicle">
            <p>
              Click the icon, choose <strong className="text-foreground">Connect to Chronicle…</strong> and approve in
              your browser. New here? Signing in with Discord creates your account. No passwords go into the app.
            </p>
            <p>
              It finds your WoW install on its own. If it can't, pick{" "}
              <strong className="text-foreground">Add WoW folder…</strong> from the menu.
            </p>
          </Step>
          <AddonStep {...addons} />
        </ol>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Then, every raid</h2>
        <ol className="grid gap-4 sm:grid-cols-3">
          <li className="flex gap-3 rounded-lg border border-border p-4 text-sm">
            <Swords className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span><strong>Raid as usual.</strong> The icon turns green while it records.</span>
          </li>
          <li className="flex gap-3 rounded-lg border border-border p-4 text-sm">
            <Upload className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span><strong>Click Upload now</strong> in the menu when you're done.</span>
          </li>
          <li className="flex gap-3 rounded-lg border border-border p-4 text-sm">
            <ScrollText className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <span><strong>Open last report</strong> takes you straight to the log.</span>
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-6 border-t border-border pt-8 text-sm text-muted-foreground sm:flex-row sm:justify-between">
        <ul className="space-y-2">
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            Only reads your combat log. Never touches the game.
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            Updates itself.
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>
              <ExtLink href={REPO}>Open source</ExtLink>, like the rest of Chronicle.
            </span>
          </li>
        </ul>
        <div className="space-y-2 sm:text-right">
          <p>
            Prefer to upload by hand? <Link to="/upload" className="text-link hover:underline">Use the upload page.</Link>
          </p>
          <p>
            Already set up? <Link to="/account/sidekick" className="text-link hover:underline">See your computers.</Link>
          </p>
          <p>
            <ExtLink href={`${REPO}/releases`}>
              All releases <ExternalLink className="inline h-3 w-3" aria-hidden="true" />
            </ExtLink>
          </p>
        </div>
      </section>
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
