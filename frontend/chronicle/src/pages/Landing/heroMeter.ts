import type { HeroClip } from "./heroClips";

/** The glass meter's panes, named like the run page's panels. */
export type HeroMeterPane = "damage_done" | "healing_done" | "deaths";

/** One bar: a player's per-second rate and share of the pane's total (0–1). */
export interface HeroMeterRow {
  name: string;
  className: string;
  perSecond: number;
  share: number;
}

/** A damage or healing pane: the raid's total and rate, players best first. */
export interface HeroMeterTotals {
  total: number;
  perSecond: number;
  rows: HeroMeterRow[];
}

/** A player death; `atMs` is from the pull's start. */
export interface HeroMeterDeath {
  victim: string;
  className: string;
  atMs: number;
  ability: string | null;
  amount: number | null;
  source: string | null;
}

/** One ability row of a player's breakout: its rate and share of the player's total (0–1). */
export interface HeroMeterAbility {
  name: string;
  perSecond: number;
  share: number;
}

/** A player's damage or healing on the pull so far, by ability, with a few facts ("crit 31%"). */
export interface HeroMeterBreakout {
  total: number;
  perSecond: number;
  /** Share of the raid's total (0–1). */
  raidShare: number;
  /** Best first. */
  abilities: HeroMeterAbility[];
  facts: { label: string; value: string }[];
}

/** The panes a bar click drills into. */
export type HeroMeterDrillPane = "damage_done" | "healing_done";

/** The playing pull's breakouts at the cursor, read by player name. */
export interface HeroMeterBreakouts {
  encounterId: string;
  /** Where the cursor is, in ms from the pull's start. */
  elapsedMs: number;
  player: (pane: HeroMeterDrillPane, name: string) => HeroMeterBreakout | null;
  /** The player is in the run (a clip's bar can name someone the live run lacks). */
  hasPlayer: (name: string) => boolean;
}

/** What the meter shows for one pull. A null pane has no numbers for it (a clip carries damage only). */
export interface HeroMeterData {
  damage: HeroMeterTotals | null;
  healing: HeroMeterTotals | null;
  deaths: HeroMeterDeath[];
  /** Per-player breakouts at the cursor (the live replay on a pull); absent on a clip. */
  breakouts?: HeroMeterBreakouts | null;
  /** The run the numbers belong to, for the run page link (the live replay's instance). */
  run?: { id: string; slug?: string | null };
}

/**
 * Panels the run page offers, as the meter's footer claims ("60+ panels"). A test holds it to at most the
 * registry's count; the meter must not import the registry, which would pull it into the landing's chunks.
 */
export const RUN_PAGE_PANELS = 60;

/** The run page's preset for each pane (`presetLayouts.ts` ids); anything else opens Watch. */
const PANE_PRESETS: Record<HeroMeterPane, string> = { damage_done: "damage", healing_done: "healing", deaths: "deaths" };

/** The run page on a pane's preset (see `PANE_PRESETS`), without one on Watch. */
export function runPageHref(instance: { id: string; slug?: string | null }, pane?: HeroMeterPane): string {
  return `/instances/${instance.slug || instance.id}?preset=${(pane && PANE_PRESETS[pane]) ?? "watch"}`;
}

/** Players' amounts over a pull of `durationMs` as a pane, best first; zeros dropped. */
export function meterTotals(amounts: { name: string; className: string; amount: number }[], durationMs: number): HeroMeterTotals {
  const seconds = Math.max(1, durationMs / 1000);
  const total = amounts.reduce((sum, entry) => sum + entry.amount, 0);
  return {
    total,
    perSecond: total / seconds,
    rows: amounts
      .filter((entry) => entry.amount > 0)
      .sort((left, right) => right.amount - left.amount)
      .map((entry) => ({ name: entry.name, className: entry.className, perSecond: entry.amount / seconds, share: total > 0 ? entry.amount / total : 0 })),
  };
}

/** A clip's numbers from clips.json, as the meter shows them. */
export function clipMeter(clip: HeroClip): HeroMeterData {
  const { meter } = clip;
  const death = meter.death;
  return {
    damage: {
      total: meter.total,
      perSecond: meter.dps,
      rows: meter.rows.map((row) => ({ name: row.name, className: row.class, perSecond: row.dps, share: row.share })),
    },
    healing: null,
    deaths: death
      ? [{ victim: death.victim, className: death.class, atMs: death.at_ms, ability: death.ability || null, amount: death.amount || null, source: death.source || null }]
      : [],
  };
}
