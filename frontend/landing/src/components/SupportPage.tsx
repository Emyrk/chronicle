import { ArrowLeft, ExternalLink, Heart, Server, ShieldCheck } from "lucide-react";

const GITHUB_SPONSORS_URL = "https://github.com/sponsors/Emyrk";
const PATREON_URL = "https://www.patreon.com/cw/ChronicleClassic";
const BUY_ME_A_COFFEE_URL = "https://buymeacoffee.com/chronicleclassic";

export function SupportPage() {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_at_top,_var(--primary-darker)_0%,_transparent_65%)] opacity-50" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to server directory
        </a>
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-sky-300">
          <span aria-hidden="true">◆</span>
          Hosted by Chronicle
        </div>
      </div>

      <div className="mt-6 max-w-3xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
          Keeping Chronicle available to Classic WoW communities
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Chronicle is an open-source, not-for-profit project that is free to
          use. I personally cover the hosting and infrastructure costs required
          to keep the service running.
        </p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <article className="rounded-xl border border-sky-400/30 bg-card/90 p-6 shadow-lg shadow-sky-950/10">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-400/10 text-sky-300">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Hosted by Chronicle</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            I operate the deployment and cover its infrastructure costs. The badge
            identifies communities whose Chronicle service depends directly on the
            project&apos;s hosting budget and maintenance.
          </p>
        </article>

        <article className="rounded-xl border border-border bg-card/70 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Server aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-foreground">Community hosted</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            These communities run Chronicle on their own infrastructure. They still
            use the same open-source project, but their operators handle hosting and
            service costs independently.
          </p>
        </article>
      </div>

      <div className="mt-10 rounded-xl border border-border bg-card p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-pink-400/10 text-pink-300 sm:flex">
            <Heart aria-hidden="true" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Support the project</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Contributions help cover hosting for Chronicle-operated deployments
              and support continued development. Support is appreciated, never required.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              {[
                ["GitHub Sponsors", GITHUB_SPONSORS_URL],
                ["Patreon", PATREON_URL],
                ["Buy Me a Coffee", BUY_ME_A_COFFEE_URL],
              ].map(([label, href]) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted"
                >
                  {label}
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
