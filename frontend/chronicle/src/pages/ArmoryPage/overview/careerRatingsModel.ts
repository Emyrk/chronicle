import type {
  CareerContribution,
  CareerPlayerCohort,
  LeaderboardV2PlayerHistory,
  LeaderboardV2PlayerHistoryGroup,
} from "@/api/typesGenerated";
import { ratePlayerBoss } from "@/pages/Ratings/ratingMath";

export function cohortKey(c: Pick<CareerPlayerCohort, "player_class" | "player_spec" | "player_sub_spec">): string {
  return [c.player_class, c.player_spec, c.player_sub_spec].join("|");
}

/** "Fury", "Fury · Fury Prot", or the class when the spec is unknown. */
export function cohortLabel(c: CareerPlayerCohort): string {
  return [c.player_spec || c.player_class, c.player_sub_spec].filter(Boolean).join(" · ");
}

/** The spec the player is strongest in, falling back to the one with the most Renown. */
export function defaultCohort(cohorts: readonly CareerPlayerCohort[]): CareerPlayerCohort | undefined {
  return [...cohorts].sort(
    (a, b) => (b.summary.mastery ?? -1) - (a.summary.mastery ?? -1) || b.summary.renown - a.summary.renown,
  )[0];
}

/** Text explaining why ratings are missing or stale; undefined when there is nothing to say. */
export function careerStatusText(status: string): string | undefined {
  switch (status) {
    case "ready":
      return undefined;
    case "preparing":
      return "Ratings are being calculated.";
    case "no_evidence":
      return "No rated kills yet.";
    case "weights_pending":
    case "configuration_pending":
    case "no_active_raids":
      return "Ratings are not available on this site yet.";
    default:
      return "Ratings are not available yet.";
  }
}

export interface BossRating {
  encounterName: string;
  kills: number;
  benchmark: number;
  peak: number;
  form: number;
  floor: number;
  mastery: number;
  rawPeak: number;
  /** Award × this spec's kills of the boss, for either metric. */
  renown: number;
}

export interface RaidRating {
  key: string;
  instanceName: string;
  difficultyName: string;
  maxPlayers: number;
  weight: number | null;
  /** False for raids that only count toward Renown. */
  rated: boolean;
  mastery: number | null;
  peak: number | null;
  renown: number;
  kills: number;
  bosses: BossRating[];
  /** Progression bosses this spec has never killed. */
  missingBosses: string[];
}

const variantKey = (v: { instance_name: string; difficulty_name: string; max_players: number }) =>
  [v.instance_name, v.difficulty_name, v.max_players].join("|");

export function rateBoss(
  name: string,
  metricGroup: LeaderboardV2PlayerHistoryGroup | undefined,
  allGroups: LeaderboardV2PlayerHistoryGroup[],
): BossRating {
  const any = metricGroup ?? allGroups[0];
  const renownKills = allGroups.reduce((n, g) => n + g.kills.length, 0);
  const rating = metricGroup
    ? ratePlayerBoss(metricGroup.kills.map((k) => k.value), metricGroup.benchmark)
    : undefined;
  return {
    encounterName: name,
    kills: metricGroup?.kills.length ?? 0,
    benchmark: metricGroup?.benchmark ?? 0,
    peak: rating?.peak ?? 0,
    form: rating?.form ?? 0,
    floor: rating?.floor ?? 0,
    mastery: rating?.mastery ?? 0,
    rawPeak: rating?.rawPeak ?? 0,
    renown: (any?.renown_award ?? 0) * renownKills,
  };
}

/**
 * Joins a cohort's server-computed raid contributions with its boss-level kill
 * history. Raid values come from the server; boss values are recomputed in the
 * browser for illustration and may differ slightly.
 */
export function buildRaidRatings(
  cohort: CareerPlayerCohort,
  history: LeaderboardV2PlayerHistory | undefined,
  progressionBosses?: Map<string, Set<string>>,
): RaidRating[] {
  const metric = cohort.summary.chosen_metric ?? "dps";
  const cohortGroups = (history?.groups ?? []).filter((g) => cohortKey(g) === cohortKey(cohort));

  // Raid scores are meaningless while the career average is blocked.
  const averaged = cohort.summary.mastery !== null;
  const rows = cohort.summary.contributions.map((c: CareerContribution): RaidRating => {
    const raidGroups = cohortGroups.filter((g) => variantKey(g) === variantKey(c));
    const byBoss = new Map<string, LeaderboardV2PlayerHistoryGroup[]>();
    for (const g of raidGroups) {
      byBoss.set(g.encounter_name, [...(byBoss.get(g.encounter_name) ?? []), g]);
    }
    const order = [...(progressionBosses?.get(c.instance_name) ?? [])];
    const rank = (name: string) => {
      const i = order.indexOf(name);
      return i === -1 ? order.length : i;
    };
    const bosses = [...byBoss.entries()]
      .map(([name, groups]) => rateBoss(name, groups.find((g) => g.metric === metric), groups))
      .sort((a, b) => rank(a.encounterName) - rank(b.encounterName) || a.encounterName.localeCompare(b.encounterName));
    return {
      key: variantKey(c),
      instanceName: c.instance_name,
      difficultyName: c.difficulty_name,
      maxPlayers: c.max_players,
      weight: c.weight,
      rated: c.include_average,
      mastery: c.include_average && averaged ? c.mastery : null,
      peak: c.include_average && averaged ? c.peak : null,
      renown: c.renown,
      kills: c.include_average ? c.eligible_metric_kills : c.eligible_renown_kills,
      bosses,
      missingBosses: c.include_average ? order.filter((name) => !byBoss.has(name)) : [],
    };
  });

  // Raids with kills first, heaviest first; untouched raids last.
  return rows.sort(
    (a, b) =>
      Number(b.kills > 0) - Number(a.kills > 0) ||
      Number(b.rated) - Number(a.rated) ||
      (b.weight ?? 0) - (a.weight ?? 0) ||
      a.instanceName.localeCompare(b.instanceName),
  );
}

export interface RenownRaid {
  key: string;
  label: string;
  kills: number;
  renown: number;
  /** True when the raid never counts toward Mastery or Peak. */
  renownOnly: boolean;
}

/**
 * The character's Renown across every spec. Each kill belongs to exactly one
 * spec, so the per-spec totals add up without double counting.
 */
export function characterRenown(cohorts: readonly CareerPlayerCohort[]): {
  total: number;
  raids: RenownRaid[];
  specs: { label: string; renown: number }[];
} {
  const raids = new Map<string, RenownRaid>();
  for (const cohort of cohorts) {
    for (const c of cohort.summary.contributions) {
      if (!c.include_renown || c.renown <= 0) continue;
      const key = variantKey(c);
      const raid = raids.get(key) ?? {
        key,
        label: [c.instance_name, c.difficulty_name, c.max_players > 0 ? `${c.max_players}` : ""].filter(Boolean).join(" "),
        kills: 0,
        renown: 0,
        renownOnly: !c.include_average,
      };
      raid.kills += c.eligible_renown_kills;
      raid.renown += c.renown;
      raids.set(key, raid);
    }
  }
  return {
    total: cohorts.reduce((n, c) => n + c.summary.renown, 0),
    raids: [...raids.values()].sort((a, b) => b.renown - a.renown),
    specs: cohorts
      .filter((c) => c.summary.renown > 0)
      .map((c) => ({ label: cohortLabel(c), renown: c.summary.renown }))
      .sort((a, b) => b.renown - a.renown),
  };
}

/** How many weighted raids have at least one rated kill. */
export function raidCoverage(cohort: CareerPlayerCohort): { rated: number; total: number } {
  const weighted = cohort.summary.contributions.filter((c) => c.include_average);
  return { rated: weighted.filter((c) => c.eligible_metric_kills > 0).length, total: weighted.length };
}
