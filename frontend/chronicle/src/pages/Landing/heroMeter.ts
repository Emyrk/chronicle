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

/** What the meter shows for one pull. A null pane has no numbers for it (a clip carries damage only). */
export interface HeroMeterData {
  damage: HeroMeterTotals | null;
  healing: HeroMeterTotals | null;
  deaths: HeroMeterDeath[];
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
