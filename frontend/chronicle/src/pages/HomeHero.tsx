import { Download, Play, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import styles from "./HomeHero.module.css";

const DAMAGE_ROWS = [
  { name: "Firebrand", value: "1.84m", width: "100%", color: "#3fc7eb" },
  { name: "Wildheart", value: "1.62m", width: "88%", color: "#ff7c0a" },
  { name: "Ashenblade", value: "1.39m", width: "76%", color: "#c69b6d" },
  { name: "Dawnkeeper", value: "1.08m", width: "59%", color: "#f48cba" },
];

export function HomeHero() {
  return (
    <section className={`${styles.stage} relative isolate overflow-hidden border-b bg-[#0b1114]`}>
      <picture className={`${styles.poster} absolute inset-0`}>
        <source
          media="(max-width: 767px)"
          srcSet="/c/images/landing/replay/ragnaros-portrait-poster.webp"
        />
        <img
          src="/c/images/landing/replay/ragnaros-poster.webp"
          alt="Chronicle 3D replay of a raid fighting Ragnaros"
          fetchPriority="high"
          className="h-full w-full object-cover"
        />
      </picture>

      <video
        className={`${styles.video} absolute inset-0 h-full w-full object-cover`}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        poster="/c/images/landing/replay/ragnaros-poster.webp"
        aria-hidden="true"
        tabIndex={-1}
      >
        <source
          media="(max-width: 767px)"
          src="/c/images/landing/replay/ragnaros-portrait.webm"
          type="video/webm"
        />
        <source
          media="(max-width: 767px)"
          src="/c/images/landing/replay/ragnaros-portrait.mp4"
          type="video/mp4"
        />
        <source src="/c/images/landing/replay/ragnaros.webm" type="video/webm" />
        <source src="/c/images/landing/replay/ragnaros.mp4" type="video/mp4" />
      </video>

      <div className={`${styles.vignette} absolute inset-0`} />
      <div className={`${styles.grid} pointer-events-none absolute inset-0`} />

      <div className="relative z-10 mx-auto grid min-h-[620px] w-full max-w-7xl items-end gap-10 px-5 pb-24 pt-12 sm:px-6 sm:pb-28 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center lg:px-8 lg:py-16">
        <div className="max-w-3xl">
          <div className={`${styles.reveal} ${styles.delay1} mb-5 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-[#102129]/75 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-[#9bc5d8] shadow-lg shadow-black/25 backdrop-blur-md`}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#7ed98a] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#7ed98a]" />
            </span>
            A raid is already playing
          </div>

          <h1 className={`${styles.reveal} ${styles.delay2} max-w-[760px] font-wow text-5xl font-bold leading-[0.98] tracking-[-0.035em] text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.75)] sm:text-6xl lg:text-7xl`}>
            Every pull,
            <span className="block text-[#9bc5d8]">remembered.</span>
          </h1>
          <p className={`${styles.reveal} ${styles.delay3} mt-6 max-w-2xl text-base leading-7 text-white/80 drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] sm:text-lg sm:leading-8`}>
            Chronicle turns combat logs into a living record of your raid. Rewatch the fight,
            inspect every death, and understand what happened from every angle.
          </p>

          <div className={`${styles.reveal} ${styles.delay4} mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center`}>
            <Button asChild variant="button-bright" size="lg" className="h-12 px-6 text-base font-bold shadow-xl shadow-black/35">
              <Link to="/download">
                <Download aria-hidden="true" className="h-5 w-5" />
                Get Sidekick, free
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 border-white/25 bg-black/25 px-6 text-base font-semibold text-white backdrop-blur-md hover:bg-black/40 hover:text-white">
              <Link to="/recent">Watch recent raids</Link>
            </Button>
          </div>
          <p className={`${styles.reveal} ${styles.delay4} mt-3 text-xs font-medium text-white/55 sm:text-sm`}>
            Sidekick uploads while you play · Windows and macOS · no account needed to watch
          </p>
        </div>

        <aside
          className={`${styles.meter} ${styles.reveal} ${styles.delay3} hidden rounded-xl border border-white/15 bg-[#0a1115]/80 p-4 shadow-2xl shadow-black/45 backdrop-blur-xl lg:block`}
          aria-label="Example Chronicle damage meter"
        >
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
                <div
                  className="absolute inset-y-0 left-0 opacity-30"
                  style={{ width: row.width, backgroundColor: row.color }}
                />
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

      <div className="absolute inset-x-5 bottom-5 z-20 mx-auto max-w-7xl rounded-lg border border-white/12 bg-[#080d10]/78 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur-xl sm:inset-x-6 lg:inset-x-8">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Play aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
          </span>
          <span className="hidden font-mono text-xs text-white/55 sm:block">3:42</span>
          <div className="relative h-1.5 flex-1 rounded-full bg-white/15">
            <div className="absolute inset-y-0 left-0 w-[58%] rounded-full bg-primary" />
            <div className="absolute left-[58%] top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow-[0_0_0_5px_rgba(95,143,166,0.16)]" />
            <span className="absolute left-[31%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-[#ffadad] bg-[#bb3d3d]" />
            <span className="absolute left-[72%] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border border-[#ffadad] bg-[#bb3d3d]" />
          </div>
          <span className="font-mono text-xs text-white/55">6:19</span>
          <span className="hidden border-l border-white/10 pl-3 text-xs font-semibold text-white/60 md:block">
            Replay every decision
          </span>
        </div>
      </div>
    </section>
  );
}
