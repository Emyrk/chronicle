import { useRef, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import type { LandingFeaturedRun } from "@/api/typesGenerated";
import { trackFunnel } from "@/utils/funnel";

// Boss chips shown inline on desktop; the rest collapse into a "+N" chip.
const DESKTOP_CHIPS = 3;

interface LandingHeroProps {
  /** Poster image; it stays in the DOM under the 3D layer so a slow or failed 3D load is invisible. */
  poster: string;
  /** Portrait crop served below the lg breakpoint, where the hero is taller than wide. */
  posterPortrait?: string;
  posterAlt: string;
  /** The admin-featured run. Without one the hero shows the poster and copy only. */
  featured?: LandingFeaturedRun | null;
  /** Playback position in ms from the run start; the 3D replay drives it. */
  currentMs?: number;
  /** The 3D replay's controls once it plays: the scrubber's play button and boss chips drive it. */
  playback?: HeroPlayback | null;
  /** Where the hero's install CTA points (the download band on desktop, the send-link form on phones). */
  getSidekickHref: string;
  /**
   * Slot for the live 3D replay, layered above the poster and below the
   * gradients and copy (HeroReplayLayer mounts the lazy LandingHero3D here).
   */
  layer3D?: ReactNode;
}

export interface HeroPlayback {
  playing: boolean;
  togglePlay: () => void;
  /** Moves the replay to `offsetMs` from the run start (the boss chips' jumps). */
  seek: (offsetMs: number) => void;
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

function percentOf(ms: number, durationMs: number) {
  return durationMs > 0 ? Math.min(100, Math.max(0, (ms / durationMs) * 100)) : 0;
}

/** The boss being fought (or last fought) at `currentMs`; before the first pull, the first boss. */
function currentBossName(run: LandingFeaturedRun, currentMs: number) {
  let name = run.bosses[0]?.name;
  for (const boss of run.bosses) {
    if (boss.start_offset_ms <= currentMs) name = boss.name;
  }
  return name;
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

/** Scrubber chrome pinned to the hero bottom; with `playback` (the 3D replay is up) it drives the replay. */
function HeroScrubber({ run, currentMs, playback }: { run: LandingFeaturedRun; currentMs: number; playback?: HeroPlayback | null }) {
  const current = currentBossName(run, currentMs);
  // Wipes repeat a boss on the bar; chips list each boss once.
  const chips = [...new Set(run.bosses.map((b) => b.name))];
  const currentChip = current ? chips.indexOf(current) : 0;
  const firstChip = Math.max(0, Math.min(currentChip - 1, chips.length - DESKTOP_CHIPS));
  const desktopChips = chips.slice(firstChip, firstChip + DESKTOP_CHIPS);
  const hiddenChips = chips.length - desktopChips.length;
  // A chip jumps to that boss's first pull.
  const jumpTo = (name: string) => {
    const boss = run.bosses.find((b) => b.name === name);
    return playback && boss ? () => playback.seek(boss.start_offset_ms) : undefined;
  };
  const playing = playback?.playing ?? false;
  // The first touch of the scrubber's controls, once per page view.
  const interacted = useRef(false);
  const trackInteraction = (control: "play_pause" | "boss_jump") => {
    if (interacted.current) return;
    interacted.current = true;
    trackFunnel("scrub_or_bossjump", { control });
  };
  const chipClick = (name: string) => {
    const jump = jumpTo(name);
    return jump && (() => {
      trackInteraction("boss_jump");
      jump();
    });
  };

  return (
    <div className="flex flex-col gap-2.5 lg:gap-2">
      <div className="flex items-center gap-2.5 lg:gap-3.5">
        <button
          type="button"
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => {
            trackInteraction("play_pause");
            playback?.togglePlay();
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#5f6d88] bg-[#0c1322]/70 text-[#e8eef8] lg:h-10 lg:w-10"
        >
          {playing
            ? <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            : <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
        </button>
        <div className="order-last font-mono text-xs text-[#e8eef8] lg:order-none lg:text-[13px]">
          {formatClock(currentMs)}
          <span className="hidden text-[#8a97ad] lg:inline"> / {formatClock(run.duration_ms)}</span>
        </div>
        <div className="relative h-1.5 min-w-0 flex-1 rounded-full bg-white/20">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-[#4fd1c5]"
            style={{ width: `${percentOf(currentMs, run.duration_ms)}%` }}
          />
          {run.bosses.map((boss, i) => (
            <div
              key={`${boss.name}-${i}`}
              title={boss.name}
              className="absolute -top-[3px] h-3 w-0.5 bg-[#e0b45c]"
              style={{ left: `${percentOf(boss.start_offset_ms, run.duration_ms)}%` }}
            />
          ))}
          {run.deaths.map((death, i) => (
            <div
              key={i}
              title={`${death.victim_name}${death.killer_name ? ` killed by ${death.killer_name}` : " died"}`}
              className="absolute -top-[5px] h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-[#0c1322] bg-[#f0a8a8]"
              style={{ left: `${percentOf(death.offset_ms, run.duration_ms)}%` }}
            />
          ))}
        </div>
        {chips.length > 0 && (
          <div className="hidden gap-1.5 lg:flex">
            {desktopChips.map((name) => (
              <BossChip key={name} label={name} active={name === current} onClick={chipClick(name)} />
            ))}
            {hiddenChips > 0 && (
              <span className="rounded-md border border-[#5f6d88] bg-[#0c1322]/70 px-2.5 py-1 text-xs text-[#8a97ad]">
                +{hiddenChips}
              </span>
            )}
          </div>
        )}
      </div>
      {chips.length > 0 && (
        <div className="styled-scrollbar flex gap-1.5 overflow-x-auto lg:hidden">
          {chips.map((name) => (
            <BossChip key={name} label={name} active={name === current} onClick={chipClick(name)} />
          ))}
        </div>
      )}
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

export function LandingHero({
  poster,
  posterPortrait,
  posterAlt,
  featured,
  currentMs = 0,
  playback,
  getSidekickHref,
  layer3D,
}: LandingHeroProps) {
  const bossName = featured ? currentBossName(featured, currentMs) : undefined;
  const delayMs = featured?.upload.source === "sidekick" ? featured.upload.delay_ms : null;
  const delayMinutes = delayMs != null ? Math.max(1, Math.round(delayMs / 60_000)) : 0;

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
        {featured && (
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4fd1c5] lg:text-xs">
            <span className="inline-block h-2 w-2 rounded-full bg-[#4fd1c5]" />
            Playing now · {featured.instance_name}
            {bossName && <span className="hidden lg:inline"> · {bossName}</span>}
          </div>
        )}
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
            onClick={() => trackFunnel("cta_sidekick", { placement: "hero" })}
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
        {delayMs != null && (
          <div className="hidden items-center gap-2.5 self-start rounded-lg border border-[#27324a] bg-[#0c1322]/70 px-3 py-2 text-[13px] text-[#d2dae8] lg:inline-flex">
            <span className="inline-block h-3 w-3 rounded-full bg-[#7ed98a]" />
            Recorded by Sidekick. Online {delayMinutes} {delayMinutes === 1 ? "minute" : "minutes"} after the group left.
          </div>
        )}
        {featured && (
          <div className="mt-1 lg:mt-auto lg:pb-[22px]">
            <HeroScrubber run={featured} currentMs={currentMs} playback={playback} />
          </div>
        )}
      </div>
    </section>
  );
}
