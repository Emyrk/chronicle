import {
  ArrowLeft,
  ArrowRight,
  Blocks,
  Check,
  ExternalLink,
  Gauge,
  LayoutDashboard,
  Play,
  Server,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";

const comparisonRows = [
  {
    label: "Best fit",
    chronicle: "Raid teams that want a modern, customizable analysis workspace",
    warcraftLogs: "Players who prefer an established report workflow in the official ecosystem",
  },
  {
    label: "Report workflow",
    chronicle: "A canvas of panels you can resize, rearrange, duplicate, and save",
    warcraftLogs: "A mature set of structured report views",
  },
  {
    label: "Filtering",
    chronicle: "Visual AND / OR / NOT filters on abilities, actors, hit types, and more",
    warcraftLogs: "Powerful pins, expressions, and report queries",
  },
  {
    label: "Fight review",
    chronicle: "Live meter playback with timeline scrubbing and YouTube sync",
    warcraftLogs: "Combat replay and timeline-based investigation",
  },
  {
    label: "Rankings",
    chronicle: "Server-aware parses, speedruns, and clear-time leaderboards",
    warcraftLogs: "Deep, long-running rankings across supported game versions",
  },
  {
    label: "Extensibility",
    chronicle: "Install custom panels built with Chronicle’s public SDK and event streams",
    warcraftLogs: "Analysis is delivered through the platform’s built-in report system",
  },
  {
    label: "Deployment",
    chronicle: "Source-available code, per-server deployments, and licensed non-commercial self-hosting",
    warcraftLogs: "A centrally hosted service with its own uploader ecosystem",
  },
];

const chronicleReasons = [
  {
    icon: LayoutDashboard,
    title: "Build the report you need",
    body: "Start with a preset or arrange your own analysis workspace. Panels, encounters, filters, layout, and time range can all travel in one shareable link.",
  },
  {
    icon: Play,
    title: "Replay the pull, not just the totals",
    body: "Watch meters accumulate through the fight, scrub to a mechanic, or synchronize the report with a YouTube recording for raid review.",
  },
  {
    icon: Blocks,
    title: "Create the analysis Chronicle does not ship",
    body: "Build and install custom panels with Chronicle’s public SDK. Custom panels can consume combat-event streams and bring guild-specific analysis directly into the same report workspace.",
  },
  {
    icon: Server,
    title: "Source available and self-hostable",
    body: "Read and study the code, contribute to the project, or operate a licensed non-commercial deployment for your community while keeping Chronicle attribution intact.",
  },
];

const sharedStrengths = [
  "Damage, healing, deaths, buffs, debuffs, resources, and casts",
  "Encounter-level drilldowns and player-focused analysis",
  "Competitive parses and performance rankings",
  "Shareable reports for players, guilds, and raid leaders",
];

export function WarcraftLogsComparisonPage() {
  return (
    <div className="comparison-page relative isolate overflow-hidden">
      <div className="comparison-grid pointer-events-none absolute inset-0 -z-20" aria-hidden="true" />
      <div className="pointer-events-none absolute left-1/2 top-[-18rem] -z-10 h-[42rem] w-[74rem] -translate-x-1/2 rounded-full bg-primary/18 blur-[110px]" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-56 top-[42rem] -z-10 h-[34rem] w-[34rem] rounded-full bg-amber-500/10 blur-[100px]" aria-hidden="true" />

      <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6 sm:pb-28 sm:pt-12 lg:px-8">
        <nav className="comparison-reveal flex items-center justify-between" aria-label="Comparison page navigation">
          <a
            href="../"
            className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Chronicle home
          </a>
          <a
            href="#comparison"
            className="hidden text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline"
          >
            Skip to the comparison
          </a>
        </nav>

        <header className="comparison-reveal comparison-delay-1 relative mx-auto max-w-4xl pb-16 pt-16 text-center sm:pb-24 sm:pt-24">
          <div className="mx-auto mb-7 flex w-fit items-center gap-3 rounded-full border border-[#d9b46b]/30 bg-[#d9b46b]/8 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[#e5c98f] shadow-lg shadow-black/10">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Source available · self-hostable · extensible
          </div>
          <h1 className="font-wow text-4xl font-bold leading-[1.04] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Chronicle or Warcraft Logs?
          </h1>
          <p className="mx-auto mt-7 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
            Warcraft Logs set the standard for combat-log analysis. Chronicle offers a more modern, flexible
            workspace—with customizable layouts, installable custom panels, and source-available infrastructure communities can operate themselves.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <a
              href="../#supported-servers"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/15 transition hover:-translate-y-0.5 hover:bg-primary/90"
            >
              Find your Chronicle server
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              href="#why-chronicle"
              className="inline-flex items-center justify-center rounded-md border border-border bg-card/60 px-5 py-3.5 text-sm font-bold text-foreground backdrop-blur transition hover:border-foreground/30 hover:bg-card"
            >
              See what feels different
            </a>
          </div>
        </header>

        <section className="comparison-reveal comparison-delay-2" aria-labelledby="positioning-heading">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#211f1b]/90 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="grid lg:grid-cols-2">
              <div className="relative overflow-hidden border-b border-white/10 p-7 sm:p-10 lg:border-b-0 lg:border-r">
                <div className="absolute right-0 top-0 h-40 w-40 translate-x-1/3 -translate-y-1/3 rounded-full bg-primary/25 blur-3xl" aria-hidden="true" />
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <img src="../chronicle-logo.png" alt="" className="h-12 w-12 object-contain" />
                    <div>
                      <p className="font-wow text-sm uppercase tracking-[0.2em] text-[#9fc5d6]">Chronicle</p>
                      <h2 id="positioning-heading" className="font-wow text-2xl font-bold">A modern raid analysis workspace</h2>
                    </div>
                  </div>
                  <p className="mt-6 max-w-xl leading-7 text-muted-foreground">
                    Choose Chronicle when you want a cleaner, modular interface that can grow with your raid—from
                    rearranging built-in panels to installing entirely new analysis built against Chronicle’s event streams.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-2">
                    {[
                      "Modern interface",
                      "Custom panels",
                      "Source available",
                      "Self-hostable",
                    ].map((label) => (
                      <span key={label} className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-[#b8d7e5]">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="relative overflow-hidden p-7 sm:p-10">
                <div className="absolute right-0 top-0 h-40 w-40 translate-x-1/3 -translate-y-1/3 rounded-full bg-amber-500/15 blur-3xl" aria-hidden="true" />
                <div className="relative">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-300/25 bg-amber-300/8 text-[#d9b46b]">
                    <Trophy className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <p className="mt-5 font-wow text-sm uppercase tracking-[0.2em] text-[#d9b46b]">Warcraft Logs</p>
                  <h2 className="mt-1 font-wow text-2xl font-bold">The established global benchmark</h2>
                  <p className="mt-6 max-w-xl leading-7 text-muted-foreground">
                    Choose Warcraft Logs when you play in its supported official ecosystem and want its mature report
                    conventions, historical depth, and broad competitive community.
                  </p>
                  <div className="mt-7 flex flex-wrap gap-2">
                    {["Long ranking history", "Large community"].map((label) => (
                      <span key={label} className="rounded-full border border-amber-300/20 bg-amber-300/7 px-3 py-1.5 text-xs font-semibold text-[#ddc38d]">
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            This is not a feature-count contest. It is a choice between a familiar report system and a newer, more adaptable workspace.
          </p>
        </section>

        <section id="comparison" className="scroll-mt-8 pt-24" aria-labelledby="comparison-heading">
          <div className="max-w-3xl">
            <p className="font-wow text-sm uppercase tracking-[0.2em] text-[#d9b46b]">Side by side</p>
            <h2 id="comparison-heading" className="mt-3 font-wow text-3xl font-bold tracking-tight sm:text-5xl">
              Similar fundamentals. Different priorities.
            </h2>
            <p className="mt-5 text-lg leading-8 text-muted-foreground">
              Both products can answer the core raid question—what happened? Chronicle puts extra emphasis on how your
              community wants to explore and present the answer.
            </p>
          </div>

          <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-card/75 shadow-2xl shadow-black/20">
            <div className="hidden grid-cols-[0.72fr_1fr_1fr] border-b border-border bg-black/15 text-sm font-bold sm:grid">
              <div className="p-5 text-muted-foreground">Capability</div>
              <div className="border-l border-border p-5 text-[#9fc5d6]">Chronicle</div>
              <div className="border-l border-border p-5 text-[#d9b46b]">Warcraft Logs</div>
            </div>
            <div className="divide-y divide-border">
              {comparisonRows.map((row) => (
                <div key={row.label} className="grid transition-colors hover:bg-white/[0.025] sm:grid-cols-[0.72fr_1fr_1fr]">
                  <div className="p-5 font-wow font-bold text-foreground sm:p-6">{row.label}</div>
                  <div className="border-t border-border/70 p-5 text-sm leading-6 text-muted-foreground sm:border-l sm:border-t-0 sm:p-6">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-[#9fc5d6] sm:hidden">Chronicle</span>
                    {row.chronicle}
                  </div>
                  <div className="border-t border-border/70 p-5 text-sm leading-6 text-muted-foreground sm:border-l sm:border-t-0 sm:p-6">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-[#d9b46b] sm:hidden">Warcraft Logs</span>
                    {row.warcraftLogs}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="why-chronicle" className="scroll-mt-8 pt-24" aria-labelledby="why-heading">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:items-start">
            <div className="lg:sticky lg:top-10">
              <p className="font-wow text-sm uppercase tracking-[0.2em] text-[#d9b46b]">Why Chronicle</p>
              <h2 id="why-heading" className="mt-3 font-wow text-3xl font-bold tracking-tight sm:text-5xl">
                Analysis that bends around the raid.
              </h2>
              <p className="mt-5 text-lg leading-8 text-muted-foreground">
                Chronicle is built less like a fixed report and more like a modern raid-analysis platform: modular, visual, self-hostable, and open to custom analysis.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {chronicleReasons.map(({ icon: Icon, title, body }, index) => (
                <article
                  key={title}
                  className={`group rounded-2xl border border-border bg-card/60 p-6 shadow-lg shadow-black/10 transition duration-300 hover:-translate-y-1 hover:border-primary/45 hover:bg-card ${index % 2 === 1 ? "sm:translate-y-8 sm:hover:translate-y-7" : ""}`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-[#9fc5d6] transition-colors group-hover:border-primary/50 group-hover:bg-primary/15">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 font-wow text-xl font-bold">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="pt-28" aria-labelledby="shared-heading">
          <div className="rounded-2xl border border-[#d9b46b]/25 bg-[linear-gradient(135deg,rgba(95,143,166,0.10),rgba(217,180,107,0.08))] p-7 sm:p-10">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
              <div>
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#d9b46b]/30 bg-[#d9b46b]/10 text-[#e5c98f]">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 id="shared-heading" className="mt-5 font-wow text-3xl font-bold">The essentials are familiar.</h2>
                <p className="mt-4 leading-7 text-muted-foreground">
                  Switching tools does not mean giving up the core analysis your raid depends on.
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2">
                {sharedStrengths.map((strength) => (
                  <li key={strength} className="flex gap-3 rounded-xl border border-white/8 bg-black/10 p-4 text-sm leading-6 text-foreground/90">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="pt-24 text-center" aria-labelledby="cta-heading">
          <div className="relative overflow-hidden rounded-2xl border border-primary/35 bg-[#1f282c] px-6 py-14 shadow-2xl shadow-black/30 sm:px-12 sm:py-16">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(95,143,166,0.28),transparent_55%)]" aria-hidden="true" />
            <div className="relative mx-auto max-w-3xl">
              <Gauge className="mx-auto h-9 w-9 text-[#9fc5d6]" aria-hidden="true" />
              <h2 id="cta-heading" className="mt-5 font-wow text-3xl font-bold sm:text-5xl">See your next pull differently.</h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
                Find the Chronicle deployment for your server, open a recent raid, and explore the report as a workspace—not a template.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <a
                  href="../#supported-servers"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground transition hover:-translate-y-0.5 hover:bg-primary/90"
                >
                  Browse supported servers
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <a
                  href="https://github.com/Emyrk/chronicle"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/15 bg-black/10 px-5 py-3.5 text-sm font-bold text-foreground transition hover:border-white/30 hover:bg-black/20"
                >
                  View the source
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>
          </div>
        </section>

        <aside className="mx-auto mt-10 max-w-3xl text-center text-xs leading-5 text-muted-foreground/75">
          <p>
            Chronicle is an independent project and is not affiliated with or endorsed by Warcraft Logs. Product
            capabilities change over time; this page describes both products at a high level.
          </p>
        </aside>
      </div>
    </div>
  );
}
