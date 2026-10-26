import type { ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import type { HeroReplay } from "./heroReplay";

// The poster's scrubber, in percent of the run, until the live 3D replay
// reports the featured run's own bosses, deaths and time.
const BOSS_TICKS = [2, 31, 48, 66, 84, 96];
const DEATH_DOTS = [36, 72];
const PROGRESS = 34;
const BOSS_CHIPS = [
  { label: "Witherfang", active: false },
  { label: "The Butcher", active: true },
  { label: "Viktor the Vile", active: false },
];
/** Boss chips on the desktop bar; the rest fold into "+N". */
const DESKTOP_CHIPS = 3;

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
   * gradients and copy (HeroReplayLayer mounts the lazy LandingHero3D here).
   */
  layer3D?: ReactNode;
  /** The live replay's state once it plays; the scrubber drives it. Null: the poster's static scrubber. */
  replay?: HeroReplay | null;
}

function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function BossChip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  const className = `whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs text-[#e8eef8] lg:py-1 ${
    active ? "border-[#4fd1c5] bg-[#4fd1c5]/20" : "border-[#5f6d88] bg-[#0c1322]/70"
  }`;
  if (!onClick) return <span className={className}>{label}</span>;
  return (
    <button type="button" onClick={onClick} title={`Jump to ${label}`} className={`${className} hover:border-[#8a97ad]`}>
      {label}
    </button>
  );
}

/** Scrubber chrome pinned to the hero bottom: static over the poster, live once the 3D replay plays. */
function HeroScrubber({ replay }: { replay?: HeroReplay | null }) {
  const progress = replay ? (replay.elapsedMs / replay.durationMs) * 100 : PROGRESS;
  const ticks = replay ? replay.bosses.map((boss) => boss.fraction * 100) : BOSS_TICKS;
  const dots = replay ? replay.deaths.map((fraction) => fraction * 100) : DEATH_DOTS;
  const chips = replay
    ? replay.bosses.map((boss) => ({ label: boss.name, active: boss.id === replay.activeBossId, onClick: () => replay.jumpToBoss(boss.id) }))
    : BOSS_CHIPS;
  // Desktop: a window of chips from the one playing (or the first), the rest counted.
  const activeIndex = Math.max(0, chips.findIndex((chip) => chip.active));
  const firstChip = Math.max(0, Math.min(activeIndex - 1, chips.length - DESKTOP_CHIPS));
  const desktopChips = chips.slice(firstChip, firstChip + DESKTOP_CHIPS);
  const moreChips = replay ? chips.length - desktopChips.length : 5;
  const playing = replay?.playing ?? false;
  return (
    <div className="flex flex-col gap-2.5 lg:gap-2">
      <div className="flex items-center gap-2.5 lg:gap-3.5">
        <button
          type="button"
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={replay?.togglePlay}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#5f6d88] bg-[#0c1322]/70 text-[#e8eef8] lg:h-10 lg:w-10"
        >
          {playing
            ? <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            : <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
        </button>
        <div className="order-last font-mono text-xs text-[#e8eef8] lg:order-none lg:text-[13px]">
          {replay ? formatClock(replay.elapsedMs) : "9:41"}
          <span className="hidden text-[#8a97ad] lg:inline"> / {replay ? formatClock(replay.durationMs) : "28:42"}</span>
        </div>
        <div className="relative h-1.5 min-w-0 flex-1 rounded-full bg-white/20">
          <div className="absolute inset-y-0 left-0 rounded-full bg-[#4fd1c5]" style={{ width: `${progress}%` }} />
          {ticks.map((left, i) => (
            <div key={i} className="absolute -top-[3px] h-3 w-0.5 bg-[#e0b45c]" style={{ left: `${left}%` }} />
          ))}
          {dots.map((left, i) => (
            <div
              key={i}
              className="absolute -top-[5px] h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-[#0c1322] bg-[#f0a8a8]"
              style={{ left: `${left}%` }}
            />
          ))}
        </div>
        <div className="hidden gap-1.5 lg:flex">
          {desktopChips.map((chip, i) => (
            <BossChip key={i} {...chip} />
          ))}
          {moreChips > 0 && (
            <span className="rounded-md border border-[#5f6d88] bg-[#0c1322]/70 px-2.5 py-1 text-xs text-[#8a97ad]">+{moreChips}</span>
          )}
        </div>
      </div>
      <div className="styled-scrollbar flex gap-1.5 overflow-x-auto lg:hidden">
        {chips.map((chip, i) => (
          <BossChip key={i} {...chip} />
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

export function LandingHero({ poster, posterPortrait, posterAlt, instanceName, bossName, getSidekickHref, layer3D, replay }: LandingHeroProps) {
  const playingBoss = replay?.bosses.find((boss) => boss.id === replay.activeBossId)?.name;
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
          {/* Live: the boss pull playing, none before the first. */}
          {(replay ? playingBoss : bossName) && <span className="hidden lg:inline"> · {replay ? playingBoss : bossName}</span>}
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
          <HeroScrubber replay={replay} />
        </div>
      </div>
    </section>
  );
}
