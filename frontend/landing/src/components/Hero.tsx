import { ArrowDown, Download, Play, Sparkles } from "lucide-react";
import { trackedTenantUrl } from "../trackedLinks";

const SIDEKICK_DOWNLOAD_URL = "https://legacy.chronicleclassic.com/download";

const DAMAGE_ROWS = [
  { name: "Firebrand", className: "hero-meter-mage", value: "1.84m", width: "100%" },
  { name: "Wildheart", className: "hero-meter-druid", value: "1.62m", width: "88%" },
  { name: "Ashenblade", className: "hero-meter-warrior", value: "1.39m", width: "76%" },
  { name: "Dawnkeeper", className: "hero-meter-paladin", value: "1.08m", width: "59%" },
];

export function Hero() {
  const sidekickUrl = trackedTenantUrl(SIDEKICK_DOWNLOAD_URL, "hero_sidekick_download");

  return (
    <section className="hero-stage relative isolate overflow-hidden border-b border-white/10 bg-[#0b1114]">
      <picture className="hero-poster absolute inset-0">
        <source media="(max-width: 767px)" srcSet="/replay/ragnaros-portrait-poster.webp" />
        <img
          src="/replay/ragnaros-poster.webp"
          alt="Chronicle 3D replay of a raid fighting Ragnaros"
          fetchPriority="high"
          className="h-full w-full object-cover"
        />
      </picture>

      <video
        className="hero-video absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/replay/ragnaros-poster.webp"
        aria-hidden="true"
        tabIndex={-1}
      >
        <source media="(max-width: 767px)" src="/replay/ragnaros-portrait.webm" type="video/webm" />
        <source media="(max-width: 767px)" src="/replay/ragnaros-portrait.mp4" type="video/mp4" />
        <source src="/replay/ragnaros.webm" type="video/webm" />
        <source src="/replay/ragnaros.mp4" type="video/mp4" />
      </video>

      <div className="hero-vignette absolute inset-0" />
      <div className="hero-grid pointer-events-none absolute inset-0" />

      <nav aria-label="Primary" className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-5 sm:pl-6 sm:pr-[22rem] lg:pl-8">
        <a href="/" aria-label="Chronicle home" className="inline-flex items-center">
          <img
            src="/chronicle-logo.svg"
            alt="Chronicle"
            className="h-10 w-auto drop-shadow-[0_4px_14px_rgba(0,0,0,0.7)] sm:h-12"
          />
        </a>
        <div className="flex items-center gap-2 sm:gap-5">
          <a
            href="https://github.com/Emyrk/chronicle"
            target="_blank"
            rel="noreferrer noopener"
            className="hidden items-center gap-2 text-sm font-medium text-white/70 transition hover:text-white sm:inline-flex"
          >
            GitHub
          </a>
          <a href="/self-hosting/" className="hidden text-sm font-medium text-white/70 transition hover:text-white md:block">
            Bring Chronicle to your server
          </a>
          <a
            href={sidekickUrl}
            className="inline-flex items-center gap-2 rounded-md border border-primary/70 bg-[#13252d]/85 px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-black/20 backdrop-blur transition hover:border-primary hover:bg-[#18313b]"
          >
            <Download aria-hidden="true" className="h-4 w-4" />
            <span className="hidden sm:inline">Get Sidekick</span>
            <span className="sm:hidden">Download</span>
          </a>
        </div>
      </nav>

      <div className="relative z-10 mx-auto grid min-h-[590px] w-full max-w-7xl items-end gap-10 px-4 pb-28 pt-12 sm:min-h-[650px] sm:px-6 sm:pb-32 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:px-8 lg:pb-28 lg:pt-4">
        <div className="max-w-3xl">
          <div className="hero-reveal hero-delay-1 mb-5 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-[#102129]/75 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#9bc5d8] shadow-lg shadow-black/25 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7ed98a] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#7ed98a]" />
            </span>
            A raid is already playing
          </div>

          <h1 className="hero-reveal hero-delay-2 max-w-[760px] font-wow text-5xl font-bold leading-[0.98] tracking-[-0.035em] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.75)] sm:text-6xl lg:text-7xl">
            Every pull,
            <span className="block text-[#9bc5d8]">remembered.</span>
          </h1>
          <p className="hero-reveal hero-delay-3 mt-6 max-w-2xl text-base leading-7 text-white/78 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-lg sm:leading-8">
            Chronicle turns combat logs into a living record of your raid. Rewatch the fight, inspect every death, and understand what happened from every angle.
          </p>

          <div className="hero-reveal hero-delay-4 mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <a
              href={sidekickUrl}
              className="hero-primary-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 py-3 text-base font-bold text-primary-foreground shadow-xl shadow-black/35 transition hover:-translate-y-0.5 hover:bg-[#70a2b9]"
            >
              <Download aria-hidden="true" className="h-5 w-5" />
              Get Sidekick, free
            </a>
            <a
              href="#supported-servers"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/25 bg-black/25 px-6 py-3 text-base font-semibold text-white backdrop-blur-md transition hover:border-white/45 hover:bg-black/40"
            >
              Find your server
              <ArrowDown aria-hidden="true" className="h-4 w-4" />
            </a>
          </div>
          <p className="hero-reveal hero-delay-4 mt-3 text-xs font-medium text-white/55 sm:text-sm">
            Sidekick uploads while you play · Windows and macOS · no account needed to watch
          </p>
        </div>

        <aside className="hero-meter hero-reveal hero-delay-3 hidden rounded-xl border border-white/15 bg-[#0a1115]/78 p-4 shadow-2xl shadow-black/45 backdrop-blur-xl lg:block" aria-label="Example Chronicle damage meter">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Playing now</p>
              <h2 className="mt-1 font-wow text-lg font-bold text-white">Molten Core · Ragnaros</h2>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary">
              <Play aria-hidden="true" className="h-4 w-4 fill-current" />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-[0.14em] text-white/75">Damage done</span>
            <span className="text-white/45">live at 3:42</span>
          </div>
          <div className="mt-3 space-y-2.5">
            {DAMAGE_ROWS.map((row, index) => (
              <div key={row.name} className="relative overflow-hidden rounded bg-white/[0.045] px-2.5 py-2">
                <div className={`absolute inset-y-0 left-0 opacity-30 ${row.className}`} style={{ width: row.width }} />
                <div className="relative flex items-center gap-2 text-sm">
                  <span className="w-4 text-right font-mono text-[11px] text-white/40">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold text-white/90">{row.name}</span>
                  <span className="font-mono text-xs text-white/65">{row.value}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 px-3 py-2.5 text-xs text-white/70">
            <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
            Every number follows the replay cursor.
          </div>
        </aside>
      </div>

      <div className="hero-timeline absolute inset-x-4 bottom-5 z-20 mx-auto max-w-7xl rounded-lg border border-white/12 bg-[#080d10]/75 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:inset-x-6 lg:inset-x-8">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Play aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
          </span>
          <span className="hidden font-mono text-xs text-white/55 sm:block">3:42</span>
          <div className="relative h-1.5 flex-1 rounded-full bg-white/15">
            <div className="absolute inset-y-0 left-0 w-[58%] rounded-full bg-primary" />
            <div className="absolute left-[58%] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-[0_0_0_5px_rgba(95,143,166,0.16)]" />
            <span className="absolute left-[31%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-[#ffadad] bg-[#bb3d3d]" title="A player died here" />
            <span className="absolute left-[72%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-[#ffadad] bg-[#bb3d3d]" title="A player died here" />
          </div>
          <span className="font-mono text-xs text-white/55">6:19</span>
          <span className="hidden border-l border-white/10 pl-3 text-xs font-semibold text-white/60 md:block">Replay every decision</span>
        </div>
      </div>
    </section>
  );
}
