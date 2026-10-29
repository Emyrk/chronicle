import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import type { LandingFeaturedDeath, LandingFeaturedRun } from "@/api/typesGenerated";
import { Button } from "@/components/ui/button";
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon";
import { trackFunnel } from "@/utils/funnel";
import type { HeroDeathRecap, HeroReplay } from "./heroReplay";

// Boss chips shown inline on desktop; the rest collapse into a "+N" chip.
const DESKTOP_CHIPS = 3;
/** A death dot plays from this long before the death. */
const DEATH_LEAD_MS = 10_000;
/** The death card's strip spans this long before the death. */
const DEATH_STRIP_MS = 10_000;
/** ←/→ move the replay this far. */
const KEY_SEEK_MS = 5_000;
/** A tapped death's card stays up this long (touch has no hover to end it). */
const TAP_CARD_MS = 5_000;

interface LandingHeroProps {
  /** Poster image; it stays in the DOM under the 3D layer so a slow or failed 3D load is invisible. */
  poster: string;
  /** Portrait crop served below the lg breakpoint, where the hero is taller than wide. */
  posterPortrait?: string;
  posterAlt: string;
  /** The featured run (scoped to the boss pull the hero plays). Without one the hero shows the poster and copy only. */
  featured?: LandingFeaturedRun | null;
  /** Playback position in ms from the run start; the 3D replay drives it. */
  currentMs?: number;
  /** The 3D replay's controls once it plays: the scrubber's play button and boss chips drive it. */
  playback?: HeroReplay | null;
  /** Where the hero's install CTA points (the download band on desktop, the send-link form on phones). */
  getSidekickHref: string;
  /**
   * Slot for the live 3D replay, layered above the poster and below the
   * gradients and copy (HeroReplayLayer mounts the lazy LandingHero3D here).
   */
  layer3D?: ReactNode;
  /** The live stats column, docked on the replay's right on desktop once the 3D replay plays a pull. */
  stats?: ReactNode;
}

export interface HeroPlayback {
  playing: boolean;
  togglePlay: () => void;
  /** Moves the replay to `offsetMs` from the run start; `cut` jumps the camera there instead of gliding (boss chips, deaths). */
  seek: (offsetMs: number, options?: { cut?: boolean }) => void;
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

function BossChip({ label, active, fixedWidth, onClick }: { label: string; active?: boolean; fixedWidth?: boolean; onClick?: () => void }) {
  // Fixed width in the desktop window: the window keeps one width as the active boss moves, so the bar never shifts.
  const className = `whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs text-foreground lg:py-1 ${
    fixedWidth ? "w-28 truncate text-center" : ""
  } ${active ? "border-primary bg-primary/20" : "border-border bg-background/70"}`;
  if (!onClick) return <span className={className} title={label}>{label}</span>;
  return (
    <button type="button" onClick={onClick} title={`Jump to ${label}`} className={`${className} hover:border-primary`}>
      {label}
    </button>
  );
}

/** The card over a death dot: who fell, when, to what, and the last ten seconds on them. */
function DeathCard({ death, recap, leftPercent, open }: {
  death: LandingFeaturedDeath;
  recap: HeroDeathRecap | null;
  leftPercent: number;
  open: boolean;
}) {
  const strongest = Math.max(1, ...(recap?.beats.map((beat) => beat.amount) ?? []));
  return (
    <div
      role="tooltip"
      className={`pointer-events-none absolute bottom-full z-20 mb-3 w-60 flex-col gap-1.5 rounded-md border bg-popover/95 p-3 text-left text-xs text-popover-foreground shadow-lg ${
        open ? "flex" : "hidden"
      }`}
      // Centred on the dot, kept inside the bar's width.
      style={{ left: `clamp(0px, calc(${leftPercent}% - 7.5rem), calc(100% - 15rem))` }}
    >
      <div className="flex items-center gap-2">
        <ClassIcon cls={death.victim_class} className="h-5 w-5 rounded-sm" />
        <span className="truncate text-sm font-semibold text-foreground">{death.victim_name}</span>
        <span className="ml-auto shrink-0 font-mono text-muted-foreground">fell at {formatClock(death.offset_ms)}</span>
      </div>
      <div className="truncate">
        {death.killer_name ? <>Killed by <span className="font-semibold text-[#f0a8a8]">{death.killer_name}</span></> : "Died"}
        {recap?.killingBlow ? <span className="text-muted-foreground"> · {recap.killingBlow}</span> : null}
      </div>
      {recap && recap.beats.length > 0 && (
        <div className="flex flex-col gap-1">
          {/* Last ten seconds, oldest on the left: hits hang below the line, heals rise above it. */}
          <div className="relative h-8 rounded bg-white/5">
            <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
            {recap.beats.map((beat, i) => {
              const height = `${25 + 75 * Math.min(1, beat.amount / strongest)}%`;
              return (
                <div
                  key={i}
                  className={`absolute w-[3px] -translate-x-1/2 rounded-sm ${
                    beat.kind === "heal" ? "bottom-1/2 bg-[#7ed98a]" : beat.kind === "hit" ? "top-1/2 bg-[#f0a8a8]" : "top-0 bg-accent"
                  }`}
                  style={{
                    left: `${100 - (beat.beforeMs / DEATH_STRIP_MS) * 100}%`,
                    height: beat.kind === "killing_blow" ? "100%" : `calc(${height} / 2)`,
                  }}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
            <span>last 10 s</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 bg-[#f0a8a8]" />hits</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 bg-[#7ed98a]" />heals</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 bg-accent" />killing blow</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** The processed recap for a payload death: the same victim within a second of it. */
function recapFor(death: LandingFeaturedDeath, recaps: HeroDeathRecap[] | null | undefined) {
  return recaps?.find((recap) => recap.victimName === death.victim_name && Math.abs(recap.offsetMs - death.offset_ms) <= 1000) ?? null;
}

/**
 * Scrubber chrome pinned to the hero bottom. Dragging, the death dots and the
 * keys drive the 3D replay once it plays (`playback`); before that they only
 * move the time label.
 */
function HeroScrubber({ run, currentMs, playback }: { run: LandingFeaturedRun; currentMs: number; playback?: HeroReplay | null }) {
  const trackRef = useRef<HTMLDivElement>(null);
  // While dragging, the bar shows the pointer's time rather than the replay's.
  const [dragMs, setDragMs] = useState<number | null>(null);
  // Where the label sits before the 3D replay arrives.
  const [idleMs, setIdleMs] = useState(0);
  const [hoveredDeath, setHoveredDeath] = useState<number | null>(null);
  const [focusedDeath, setFocusedDeath] = useState<number | null>(null);
  const [tappedDeath, setTappedDeath] = useState<number | null>(null);
  const seekFrame = useRef<number | null>(null);
  const tapTimer = useRef<number | null>(null);
  const lastPointerType = useRef("mouse");
  useEffect(() => () => {
    if (seekFrame.current !== null) cancelAnimationFrame(seekFrame.current);
    if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
  }, []);

  const shownMs = dragMs ?? (playback ? currentMs : idleMs);
  const current = currentBossName(run, shownMs);
  // Wipes repeat a boss on the bar; chips list each boss once.
  const chips = [...new Set(run.bosses.map((b) => b.name))];
  const currentChip = current ? chips.indexOf(current) : 0;
  const firstChip = Math.max(0, Math.min(currentChip - 1, chips.length - DESKTOP_CHIPS));
  const desktopChips = chips.slice(firstChip, firstChip + DESKTOP_CHIPS);
  const hiddenChips = chips.length - desktopChips.length;
  const playing = playback?.playing ?? false;
  // The first touch of the scrubber's controls, once per page view.
  const interacted = useRef(false);
  const trackInteraction = (control: "play_pause" | "boss_jump" | "drag" | "death_jump") => {
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

  const clampMs = (ms: number) => Math.min(run.duration_ms, Math.max(0, ms));
  const goTo = (ms: number, cut = false) => {
    const at = clampMs(ms);
    if (playback) playback.seek(at, { cut });
    else setIdleMs(at);
  };
  // A chip jumps (a hard cut) to that boss's first pull.
  const jumpTo = (name: string) => {
    const boss = run.bosses.find((b) => b.name === name);
    return playback && boss ? () => playback.seek(boss.start_offset_ms, { cut: true }) : undefined;
  };

  const msAtPointer = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return clampMs(((clientX - rect.left) / rect.width) * run.duration_ms);
  };
  // At most one replay seek per frame while dragging.
  const seekSoon = (ms: number) => {
    if (!playback) return;
    if (seekFrame.current !== null) cancelAnimationFrame(seekFrame.current);
    seekFrame.current = requestAnimationFrame(() => {
      seekFrame.current = null;
      playback.seek(ms);
    });
  };
  const onTrackPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    trackInteraction("drag");
    e.currentTarget.setPointerCapture(e.pointerId);
    const ms = msAtPointer(e.clientX);
    setDragMs(ms);
    seekSoon(ms);
  };
  const onTrackPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragMs === null) return;
    const ms = msAtPointer(e.clientX);
    setDragMs(ms);
    seekSoon(ms);
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (dragMs === null) return;
    const ms = msAtPointer(e.clientX);
    if (seekFrame.current !== null) cancelAnimationFrame(seekFrame.current);
    seekFrame.current = null;
    goTo(ms);
    setDragMs(null);
  };

  const onDeathClick = (index: number) => {
    trackInteraction("death_jump");
    // 10 s before the death, playing, so the visitor sees it happen.
    goTo(run.deaths[index].offset_ms - DEATH_LEAD_MS, true);
    if (lastPointerType.current !== "mouse") {
      // A tap has no hover: the card stays up for a moment instead.
      setTappedDeath(index);
      if (tapTimer.current !== null) window.clearTimeout(tapTimer.current);
      tapTimer.current = window.setTimeout(() => setTappedDeath(null), TAP_CARD_MS);
    }
  };

  // Keys act only while focus is inside the scrubber (no global handlers).
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      trackInteraction("play_pause");
      playback?.togglePlay();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      goTo(shownMs + (e.key === "ArrowLeft" ? -KEY_SEEK_MS : KEY_SEEK_MS));
    }
  };

  const openDeath = hoveredDeath ?? focusedDeath ?? tappedDeath;
  const duration = formatClock(run.duration_ms);

  return (
    <div className="flex flex-col gap-2.5 lg:gap-2" onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2.5 lg:gap-3.5">
        <button
          type="button"
          aria-label={playing ? "Pause replay" : "Play replay"}
          onClick={() => {
            trackInteraction("play_pause");
            playback?.togglePlay();
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background/70 text-foreground hover:bg-accent/50 lg:h-10 lg:w-10"
        >
          {playing
            ? <Pause className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            : <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />}
        </button>
        <div className="order-last font-mono text-xs text-foreground lg:order-none lg:text-[13px]" aria-hidden="true">
          {/* As wide as the longest time, so the bar does not shift as digits are added. */}
          <span className="inline-block text-right" style={{ minWidth: `${duration.length}ch` }}>{formatClock(shownMs)}</span>
          <span className="hidden text-muted-foreground lg:inline"> / {duration}</span>
        </div>
        <div className="relative min-w-0 flex-1">
          {/* The hit area is taller than the 6 px bar; horizontal drags scrub, vertical ones still scroll the page. */}
          <div
            role="slider"
            tabIndex={0}
            aria-label="Replay position"
            aria-valuemin={0}
            aria-valuemax={Math.floor(run.duration_ms / 1000)}
            aria-valuenow={Math.floor(shownMs / 1000)}
            aria-valuetext={`${formatClock(shownMs)} of ${duration}`}
            className="relative flex h-6 cursor-pointer touch-pan-y items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerDown={onTrackPointerDown}
            onPointerMove={onTrackPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={() => setDragMs(null)}
          >
            <div ref={trackRef} className="relative h-1.5 w-full rounded-full bg-white/20">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{ width: `${percentOf(shownMs, run.duration_ms)}%` }}
              />
              {run.bosses.map((boss, i) => (
                <div
                  key={`${boss.name}-${i}`}
                  title={boss.name}
                  className="absolute -top-[3px] h-3 w-0.5 bg-accent"
                  style={{ left: `${percentOf(boss.start_offset_ms, run.duration_ms)}%` }}
                />
              ))}
            </div>
          </div>
          {run.deaths.map((death, i) => (
            // 24 px hit target around the 10 px dot.
            <button
              key={i}
              type="button"
              aria-label={`${death.victim_name} fell at ${formatClock(death.offset_ms)}${death.killer_name ? `, killed by ${death.killer_name}` : ""}. Play from 10 seconds before.`}
              className="absolute top-0 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#f0a8a8]"
              style={{ left: `${percentOf(death.offset_ms, run.duration_ms)}%` }}
              onPointerDown={(e) => {
                lastPointerType.current = e.pointerType;
              }}
              onPointerEnter={(e) => e.pointerType === "mouse" && setHoveredDeath(i)}
              onPointerLeave={() => setHoveredDeath(null)}
              onFocus={() => setFocusedDeath(i)}
              onBlur={() => setFocusedDeath(null)}
              onClick={() => onDeathClick(i)}
            >
              <span className="h-2.5 w-2.5 rounded-full border-2 border-background bg-[#f0a8a8]" />
            </button>
          ))}
          {/* Every card stays mounted (hidden until open), so its class icon loads once with the bar and a hover fetches nothing. */}
          {run.deaths.map((death, i) => (
            <DeathCard
              key={i}
              death={death}
              recap={recapFor(death, playback?.deathRecaps)}
              leftPercent={percentOf(death.offset_ms, run.duration_ms)}
              open={openDeath === i}
            />
          ))}
        </div>
        {chips.length > 0 && (
          <div className="hidden gap-1.5 lg:flex">
            {desktopChips.map((name) => (
              <BossChip key={name} label={name} active={name === current} fixedWidth onClick={chipClick(name)} />
            ))}
            {hiddenChips > 0 && (
              <span className="w-10 rounded-md border bg-background/70 py-1 text-center text-xs text-muted-foreground">
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
      <div className="hidden gap-4 pl-[54px] text-xs text-muted-foreground lg:flex">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 bg-accent" />
          boss pull
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-[#f0a8a8]" />
          a death · hover to see the killing blow
        </span>
        <span className="text-muted-foreground/80">Drag the bar. Yes, right now.</span>
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
  stats,
}: LandingHeroProps) {
  const bossName = featured ? currentBossName(featured, currentMs) : undefined;
  const delayMs = featured?.upload.source === "sidekick" ? featured.upload.delay_ms : null;
  const delayMinutes = delayMs != null ? Math.max(1, Math.round(delayMs / 60_000)) : 0;

  return (
    <section id="top" className="relative h-[520px] overflow-hidden border-b bg-card lg:h-[580px]">
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
      {/* The page background over the poster; index.html's poster shell draws the same gradients. */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/25 via-background/35 to-background/95 lg:hidden" />
      <div className="absolute inset-0 hidden bg-gradient-to-r from-background/95 via-background/80 via-38% to-background/10 lg:block" />
      <div className="absolute inset-x-0 bottom-0 hidden h-[150px] bg-gradient-to-b from-background/0 to-background/95 lg:block" />

      <div className="relative mx-auto flex h-full max-w-[1180px] flex-col justify-end gap-3 px-4 pb-[18px] pt-4 lg:justify-start lg:gap-[18px] lg:px-8 lg:pb-0 lg:pt-[52px]">
        {featured && (
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary lg:text-xs">
            <span className="inline-block h-2 w-2 rounded-full bg-primary" />
            Playing now · {featured.instance_name}
            {bossName && <span> · {bossName}</span>}
          </div>
        )}
        {featured?.speedrun && (
          // The montage entry's place on its speedrun board.
          <div className="-mt-1.5 text-xs text-muted-foreground lg:-mt-3 lg:text-[13px]">
            Fastest replayed {featured.instance_name} clear · {formatClock(featured.speedrun.duration_ms)} · rank {featured.speedrun.rank}
          </div>
        )}
        <h1 className="m-0 max-w-[640px] text-[34px] font-bold leading-[1.06] tracking-tight text-foreground lg:text-[54px] lg:leading-[1.04]">
          Your dungeon run, replayed in 3D.
        </h1>
        <p className="m-0 max-w-[540px] text-[15px] leading-normal text-foreground/85 lg:text-lg">
          Sidekick sits in your tray and uploads the fight while you loot. Watch your group walk the real floor, see
          who died to what, send the link to the party.
        </p>
        <div className="mt-1 hidden flex-wrap items-center gap-3 lg:flex">
          <Button asChild variant="button-bright" size="lg" className="h-12 text-base font-semibold">
            <a href={getSidekickHref} onClick={() => trackFunnel("cta_sidekick", { placement: "hero" })} className="no-underline">
              Get Sidekick, free
            </a>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 text-base">
            <a href="#runs" className="no-underline">
              Open this replay
            </a>
          </Button>
          <span className="text-[13px] text-muted-foreground">Mac &amp; Windows · no account to watch</span>
        </div>
        {delayMs != null && (
          <div className="hidden items-center gap-2.5 self-start rounded-md border bg-background/70 px-3 py-2 text-[13px] text-foreground/85 lg:inline-flex">
            <span className="inline-block h-3 w-3 rounded-full bg-[#7ed98a]" />
            Recorded by Sidekick. Online {delayMinutes} {delayMinutes === 1 ? "minute" : "minutes"} after the group left.
          </div>
        )}
        {stats ? (
          // Over the replay, right of the copy and above the scrubber; it arrives with the 3D, so nothing shifts.
          <div className="absolute right-8 top-[52px] hidden max-h-[calc(100%-52px-128px)] w-[300px] overflow-y-auto styled-scrollbar lg:block xl:w-[360px]">
            {stats}
          </div>
        ) : null}
        {featured && (
          <div className="mt-1 lg:mt-auto lg:pb-[22px]">
            <HeroScrubber run={featured} currentMs={currentMs} playback={playback} />
          </div>
        )}
      </div>
    </section>
  );
}
