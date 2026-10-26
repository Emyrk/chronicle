import type { ReactNode } from "react";
import { Play } from "lucide-react";

// Positions on the scrubber bar, in percent of the run. Static until the
// replay data car wires real encounters and deaths in.
const BOSS_TICKS = [2, 31, 48, 66, 84, 96];
const DEATH_DOTS = [36, 72];
const PROGRESS = 34;
const BOSS_CHIPS = [
  { label: "Witherfang", active: false },
  { label: "The Butcher", active: true },
  { label: "Viktor the Vile", active: false },
];

interface LandingHeroProps {
  /** Poster image; it stays in the DOM under the 3D layer so a slow or failed 3D load is invisible. */
  poster: string;
  /** Portrait crop served below the lg breakpoint, where the hero is taller than wide. */
  posterPortrait?: string;
  posterAlt: string;
  instanceName: string;
  bossName: string;
  /** Where the hero's install CTA points (the download band on desktop, the send-link form on phones). */
  getSidekickHref: string;
  /**
   * Slot for the live 3D replay, layered above the poster and below the
   * gradients and copy. Empty in the shell; a later car mounts a lazy
   * LandingHero3D here after first paint.
   */
  layer3D?: ReactNode;
}

function BossChip({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs text-[#e8eef8] lg:py-1 ${
        active ? "border-[#4fd1c5] bg-[#4fd1c5]/20" : "border-[#5f6d88] bg-[#0c1322]/70"
      }`}
    >
      {label}
    </span>
  );
}

/** Presentational scrubber chrome pinned to the hero bottom. */
function HeroScrubber() {
  return (
    <div className="flex flex-col gap-2.5 lg:gap-2">
      <div className="flex items-center gap-2.5 lg:gap-3.5">
        <button
          type="button"
          aria-label="Play replay"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#5f6d88] bg-[#0c1322]/70 text-[#e8eef8] lg:h-10 lg:w-10"
        >
          <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
        </button>
        <div className="order-last font-mono text-xs text-[#e8eef8] lg:order-none lg:text-[13px]">
          9:41<span className="hidden text-[#8a97ad] lg:inline"> / 28:42</span>
        </div>
        <div className="relative h-1.5 min-w-0 flex-1 rounded-full bg-white/20">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[#4fd1c5]" style={{ width: `${PROGRESS}%` }} />
          {BOSS_TICKS.map((left) => (
            <div key={left} className="absolute -top-[3px] h-3 w-0.5 bg-[#e0b45c]" style={{ left: `${left}%` }} />
          ))}
          {DEATH_DOTS.map((left) => (
            <div
              key={left}
              className="absolute -top-[5px] h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-[#0c1322] bg-[#f0a8a8]"
              style={{ left: `${left}%` }}
            />
          ))}
        </div>
        <div className="hidden gap-1.5 lg:flex">
          {BOSS_CHIPS.map((chip) => (
            <BossChip key={chip.label} {...chip} />
          ))}
          <span className="rounded-md border border-[#5f6d88] bg-[#0c1322]/70 px-2.5 py-1 text-xs text-[#8a97ad]">+5</span>
        </div>
      </div>
      <div className="styled-scrollbar flex gap-1.5 overflow-x-auto lg:hidden">
        {BOSS_CHIPS.map((chip) => (
          <BossChip key={chip.label} {...chip} />
        ))}
      </div>
      <div className="hidden gap-4 pl-[54px] text-xs text-[#b7c2d6] lg:flex">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 bg-[#e0b45c]" />
          boss pull
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#f0a8a8]" />
          a death · hover to see the killing blow
        </span>
      </div>
    </div>
  );
}

export function LandingHero({ poster, posterPortrait, posterAlt, instanceName, bossName, getSidekickHref, layer3D }: LandingHeroProps) {
  return (
    <section id="top" className="relative h-[520px] overflow-hidden border-b border-[#27324a] bg-[#101829] lg:h-[580px]">
      <picture>
        {posterPortrait ? <source media="(max-width: 1023px)" srcSet={posterPortrait} /> : null}
        <img
          src={poster}
          alt={posterAlt}
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover object-[center_55%]"
        />
      </picture>
      {layer3D ? <div className="absolute inset-0">{layer3D}</div> : null}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0c1322]/25 via-[#0c1322]/35 to-[#0c1322]/95 lg:hidden" />
      <div className="absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(12,19,34,0.94)_0%,rgba(12,19,34,0.78)_38%,rgba(12,19,34,0.12)_100%)] lg:block" />
      <div className="absolute inset-x-0 bottom-0 hidden h-[150px] bg-gradient-to-b from-[#0c1322]/0 to-[#0c1322]/95 lg:block" />

      <div className="relative mx-auto flex h-full max-w-[1180px] flex-col justify-end gap-3 px-4 pb-[18px] pt-4 lg:justify-start lg:gap-[18px] lg:px-8 lg:pb-0 lg:pt-[52px]">
        <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4fd1c5] lg:text-xs">
          <span className="inline-block h-2 w-2 rounded-full bg-[#4fd1c5]" />
          Playing now · {instanceName}
          <span className="hidden lg:inline"> · {bossName}</span>
        </div>
        <h1 className="m-0 max-w-[640px] font-['Libre_Baskerville',Georgia,serif] text-[34px] font-bold leading-[1.06] text-[#e8eef8] lg:text-[54px] lg:leading-[1.04]">
          Your dungeon run, replayed in 3D.
        </h1>
        <p className="m-0 max-w-[540px] text-[15px] leading-normal text-[#d2dae8] lg:text-lg">
          Sidekick sits in your tray and uploads the fight while you loot. Watch your group walk the real floor, see
          who died to what, send the link to the party.
        </p>
        <div className="mt-1 hidden flex-wrap items-center gap-3 lg:flex">
          <a
            href={getSidekickHref}
            className="rounded-[10px] bg-[#e0b45c] px-[22px] py-3.5 text-base font-semibold text-[#0c1322] no-underline hover:bg-[#e8c477]"
          >
            Get Sidekick, free
          </a>
          <a
            href="#runs"
            className="rounded-[10px] border border-[#5f6d88] bg-[#0c1322]/50 px-5 py-3.5 text-base font-medium text-[#e8eef8] no-underline hover:border-[#8a97ad]"
          >
            Open this replay
          </a>
          <span className="text-[13px] text-[#b7c2d6]">Mac &amp; Windows · no account to watch</span>
        </div>
        <div className="hidden items-center gap-2.5 self-start rounded-lg border border-[#27324a] bg-[#0c1322]/70 px-3 py-2 text-[13px] text-[#d2dae8] lg:inline-flex">
          <span className="inline-block h-3 w-3 rounded-full bg-[#7ed98a]" />
          Recorded by Sidekick. Online 3 minutes after the group left.
        </div>
        <div className="mt-1 lg:mt-auto lg:pb-[22px]">
          <HeroScrubber />
        </div>
      </div>
    </section>
  );
}
