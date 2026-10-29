import type { LandingFeaturedRun } from "@/api/typesGenerated";
import type { Instance } from "@/pages/Instance/InstancePage";
import type { SerializableProcessorContext } from "@/pages/Instance/EventsPanels/processorTypes";
import type { HeroPlayback } from "./LandingHero";
import type { HeroMeterData } from "./heroMeter";

/** The hero starts this long before the boss pull. */
export const HERO_PULL_LEAD_MS = 5_000;

/** The boss pull the hero loops, in ms from the instance's start. */
export interface HeroWindow {
  encounterId: string;
  startOffsetMs: number;
  endOffsetMs: number;
}

/**
 * The featured run's boss pull (from a few seconds before it), and the run as
 * the scrubber sees it: that window only, its bosses and deaths timed from the
 * window's start. A run without a boss pull plays whole (window null).
 * `encounterId` picks another of the run's boss pulls (the boss rail).
 */
export function heroWindow(run: LandingFeaturedRun, encounterId?: string | null): { window: HeroWindow | null; run: LandingFeaturedRun } {
  const encounter = run.bosses.find((boss) => boss.id === encounterId) ?? run.encounter;
  if (!encounter) return { window: null, run };
  const startOffsetMs = Math.max(0, encounter.start_offset_ms - HERO_PULL_LEAD_MS);
  const endOffsetMs = encounter.end_offset_ms;
  return {
    window: { encounterId: encounter.id, startOffsetMs, endOffsetMs },
    run: {
      ...run,
      duration_ms: endOffsetMs - startOffsetMs,
      bosses: [{
        id: encounter.id,
        name: encounter.name,
        kill: encounter.kill,
        start_offset_ms: encounter.start_offset_ms - startOffsetMs,
        end_offset_ms: endOffsetMs - startOffsetMs,
      }],
      deaths: run.deaths
        .filter((death) => death.offset_ms >= startOffsetMs && death.offset_ms <= endOffsetMs)
        .map((death) => ({ ...death, offset_ms: death.offset_ms - startOffsetMs })),
    },
  };
}

/** One beat in a death card's last-ten-seconds strip. */
export interface HeroDeathBeat {
  /** How long before the death it landed, in ms (0 is the death). */
  beforeMs: number;
  kind: "hit" | "heal" | "killing_blow";
  amount: number;
}

/** A player death's recap, from the Instance page's deaths processor. */
export interface HeroDeathRecap {
  /** Ms from the instance's start (the window's, when one plays), like the scrubber's death offsets. */
  offsetMs: number;
  victimName: string;
  victimClass: string;
  /** Who landed the killing blow, when the log names them. */
  killerName: string | null;
  /** The ability that landed the killing blow, when the log names it. */
  killingBlow: string | null;
  /** The killing blow's damage, when known. */
  killingBlowAmount: number | null;
  beats: HeroDeathBeat[];
}

/** What the live 3D hero reports to the shell's scrubber once it plays. */
export interface HeroReplay extends HeroPlayback {
  /** Where the replay is, in ms from the instance's start (the featured run's offsets), or from the window's start when one plays. */
  currentMs: number;
  /** The player deaths' recaps once processed (from streams the replay already fetched); null until then. */
  deathRecaps: HeroDeathRecap[] | null;
  /** The glass meter's live numbers for what plays (from the same streams); null until processed. */
  meter: HeroMeterData | null;
}

/** The processors' context for the run: its players and units, the given encounters, no entity selection. */
export function serializableContext(instance: Instance, selectedEncounterIds: string[]): SerializableProcessorContext {
  return {
    players: Object.fromEntries(Object.entries(instance.players ?? {})
      .map(([guid, player]) => [guid, { name: player.name, class: player.class, level: player.level }])),
    units: Object.fromEntries(Object.entries(instance.units ?? {})
      .map(([guid, unit]) => [guid, { name: unit.name, owner: unit.owner?.toString() ?? null, entry: unit.entry }])),
    selectedEncounterIds,
    entitySelection: { enemyIds: [], playerIds: [] },
    capabilities: instance.capabilities ?? [],
    positionCoordinateSpace: instance.positionCoordinateSpace,
  };
}
