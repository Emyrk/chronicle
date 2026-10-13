import {
  ArrowLeft,
  Check,
  Coins,
  Database,
  EyeOff,
  Heart,
  ShieldCheck,
} from "lucide-react";

const COMMITMENTS = [
  "Chronicle will remain free to use and useful features will not be placed behind a subscription.",
  "Ad placements will be limited so the raid data stays the focus of the page.",
  "Chronicle does not give advertisers raid logs, character performance, or private account content for targeting.",
  "Advertising is part of a funding mix that also includes voluntary community support.",
];

export function AdsPage() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[34rem] bg-[radial-gradient(ellipse_at_top,_rgba(95,143,166,0.34)_0%,_rgba(22,26,29,0.7)_48%,_transparent_76%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-20 h-[42rem] opacity-[0.12] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] [background-size:48px_48px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />

      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
        <a
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Back to server directory
        </a>

        <header className="mx-auto mt-12 max-w-3xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-amber-300/30 bg-[#211a0f] shadow-xl shadow-black/30 ring-1 ring-white/5">
            <Coins aria-hidden="true" className="h-8 w-8 text-[#f0c060]" />
          </div>
          <p className="mt-6 font-wow text-sm font-bold uppercase tracking-[0.24em] text-[#f0c060]">
            Funding the service
          </p>
          <h1 className="mt-3 font-wow text-4xl leading-tight text-white sm:text-6xl">
            Why Chronicle Runs Ads
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Chronicle runs limited advertising to help pay the recurring cost of keeping raid logs, rankings, tools, and community pages online without charging players for access.
          </p>
        </header>

        <div className="mt-14 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <article className="rounded-2xl border border-border bg-card/90 p-6 shadow-2xl shadow-black/25 sm:p-8">
            <div className="flex items-center gap-3">
              <Database aria-hidden="true" className="h-6 w-6 text-primary" />
              <h2 className="font-wow text-2xl text-foreground">The short version</h2>
            </div>
            <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
              <p>
                Chronicle is a source-available community project, but operating it is not free. More realms, more uploads, and more visitors mean larger bills for memory, storage, bandwidth, and backups.
              </p>
              <p>
                Rather than put analysis tools behind a premium account, Chronicle uses a mix of voluntary contributions and advertising. Ad revenue helps narrow the gap between community support and the real monthly cost of the service.
              </p>
              <p className="font-medium text-foreground">
                The goal is sustainability, not maximizing profit or time spent looking at ads.
              </p>
            </div>
          </article>

          <aside className="rounded-2xl border border-[#6b5320] bg-[#1e1710] p-6 shadow-2xl shadow-black/30 sm:p-8">
            <ShieldCheck aria-hidden="true" className="h-7 w-7 text-[#f0c060]" />
            <h2 className="mt-4 font-wow text-2xl text-[#f0c060]">The promise</h2>
            <ul className="mt-5 space-y-4">
              {COMMITMENTS.map((commitment) => (
                <li key={commitment} className="flex gap-3 text-sm leading-relaxed text-[#d8cdb8]">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f0c060]/15 text-[#f0c060]">
                    <Check aria-hidden="true" className="h-3 w-3" />
                  </span>
                  {commitment}
                </li>
              ))}
            </ul>
          </aside>
        </div>

        <section className="mt-16">
          <div className="max-w-2xl">
            <h2 className="font-wow text-3xl text-foreground">Keeping the meters moving</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              The{" "}
              <a href="/support/" className="font-semibold text-primary transition-colors hover:text-foreground">
                support page
              </a>{" "}
              explains Chronicle&apos;s operating costs and how community contributions help cover them.
            </p>
          </div>
          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <article className="rounded-xl border border-border bg-muted/30 p-6">
              <EyeOff aria-hidden="true" className="h-6 w-6 text-primary" />
              <h2 className="mt-4 font-wow text-xl text-foreground">What is not for sale</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Chronicle does not sell raid logs or use character performance, parses, guild rosters, or private account content to target ads. Advertising providers may process ordinary technical information needed to deliver and measure ads, as described in the privacy policy.
              </p>
              <a href="/privacy/" className="mt-4 inline-flex text-sm font-semibold text-primary transition-colors hover:text-foreground">
                Read the privacy policy →
              </a>
            </article>

            <article className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-6">
              <Heart aria-hidden="true" className="h-6 w-6 text-rose-300" />
              <h2 className="mt-4 font-wow text-xl text-foreground">Community support still matters</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Contributions directly offset operating costs and reduce how much Chronicle needs to rely on advertising. Support is always optional; everyone gets the same core experience.
              </p>
              <a href="/support/" className="mt-4 inline-flex text-sm font-semibold text-rose-300 transition-colors hover:text-foreground">
                See the costs and ways to support →
              </a>
            </article>
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h2 className="font-wow text-2xl text-foreground">Self Hosting Is Always an Option</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Communities that prefer to operate Chronicle themselves can run an independent deployment on their own infrastructure and control its configuration, including whether it serves advertising.
          </p>
          <a href="/self-hosting/" className="mt-4 inline-flex text-sm font-semibold text-primary transition-colors hover:text-foreground">
            Review the self-hosting requirements →
          </a>
        </section>
      </div>
    </section>
  );
}
