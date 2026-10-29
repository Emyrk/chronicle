import type { LandingFeaturedDeath, LandingFeaturedRun } from "@/api/typesGenerated";
import type { Instance } from "@/pages/Instance/InstancePage";
import type { ExplorePlacement } from "@/utils/funnel";
import type { HeroDeathRecap } from "./heroReplay";
import { runPageHref } from "./heroMeter";

/** What the Explore in 3D modal opens on: a run, the pull to play, and where it was opened from. */
export interface ExploreTarget {
  placement: ExplorePlacement;
  instanceId: string;
  /** The run as the landing payload has it (the hero's runs); without one it is built from the instance once loaded. */
  run?: LandingFeaturedRun | null;
  /** The boss pull to open on; without one, the run's last boss kill (else its last boss pull). */
  encounterId?: string | null;
  /** Where in the pull's window to start, in ms (the hero's position when it hands over). */
  startMs?: number;
  /** Shown under the spinner while the run loads. */
  poster?: string | null;
}

/** The run page's Watch preset for a run. */
export function fullRunHref(instance: { id: string; slug?: string | null }): string {
  return runPageHref(instance);
}

/** Boss pulls shorter than this are near-zero duplicates (the Ruins log ends on a 15 ms Rath'mael pull), as `landingMinBossPull` in api/landing.go. */
const MIN_BOSS_PULL_MS = 3_000;

/**
 * A loaded instance as the hero's scrubber and boss rail see a featured run: its boss pulls in order,
 * offsets from the instance's start, and the pull to open on (the last boss kill, else the last boss pull).
 * Deaths come later, from the replay's recaps.
 */
export function exploreRunFromInstance(instance: Instance): LandingFeaturedRun {
  const startMs = Date.parse(instance.startTime);
  const bosses = instance.encounters
    .filter((encounter) => encounter.boss)
    .map((encounter) => ({
      id: encounter.id,
      name: encounter.name,
      kill: encounter.kill_type === "clean" || encounter.kill_type === "partial",
      start_offset_ms: Date.parse(encounter.start_time) - startMs,
      end_offset_ms: Date.parse(encounter.end_time) - startMs,
    }))
    .filter((boss) => boss.end_offset_ms - boss.start_offset_ms >= MIN_BOSS_PULL_MS)
    .sort((left, right) => left.start_offset_ms - right.start_offset_ms);
  const ends = instance.encounters.map((encounter) => Date.parse(encounter.end_time) - startMs);
  const last = [...bosses].reverse().find((boss) => boss.kill) ?? bosses[bosses.length - 1] ?? null;
  return {
    instance_id: instance.id,
    instance_name: instance.name,
    duration_ms: Math.max(0, ...ends),
    player_count: Object.keys(instance.players ?? {}).length,
    bosses,
    deaths: [],
    upload: { source: "unknown", delay_ms: null },
    encounter: last,
    speedrun: null,
  };
}

/**
 * The live 3D's run as the hero sees a featured run when the landing payload has none: built from its loaded
 * instance, with the deaths processed so far (`recaps` timed from the instance's start, so a pull's window scopes them).
 */
export function liveHeroRun(instance: Instance, recaps: readonly HeroDeathRecap[] | null): LandingFeaturedRun {
  return { ...exploreRunFromInstance(instance), deaths: deathsFromRecaps(recaps ?? []) };
}

/** The scrubber's death dots from the replay's processed recaps (already timed like the scrubber). */
export function deathsFromRecaps(recaps: readonly HeroDeathRecap[]): LandingFeaturedDeath[] {
  return recaps
    .map((recap) => ({
      offset_ms: recap.offsetMs,
      victim_name: recap.victimName,
      victim_class: recap.victimClass,
      ...(recap.killerName ? { killer_name: recap.killerName } : {}),
    }))
    .sort((left, right) => left.offset_ms - right.offset_ms);
}
