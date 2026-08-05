import type {
  CharacterEncounterStats,
  CharacterParse,
  PlayerOutfit,
} from "@/api/typesGenerated";

/**
 * Client-side aggregation over the character parse history endpoint
 * (/api/v1/rankings/characters/{guid}/parses), which returns every
 * deduplicated parse in the lookback window. Encounter scores use the same
 * policy as the server's overall CharacterScore: the average of the best 3
 * parses per encounter.
 */

export const BEST_N_PER_ENCOUNTER = 3;

export interface EncounterSummary {
  encounterName: string;
  /** Average of the best 3 parses, rounded like the server (half-up, 0-100). */
  score: number;
  /** Precise scores averaged into score, best first. */
  scoreInputs: number[];
  /** Single best parse. */
  best: number;
  /** Deduplicated kills with a parse in the window. */
  kills: number;
  /** metric_value (DPS/HPS) of the best-scoring parse. */
  bestMetricValue: number;
  /** The best-scoring parse itself, for linking to its log. */
  bestParse: CharacterParse;
}

export interface RaidSummary {
  instanceName: string;
  difficultyName: string;
  maxPlayers: number;
  /** Average of the per-encounter scores, rounded. */
  score: number;
  /** Best single parse across the raid. */
  best: number;
  /** Total parsed kills across the raid's encounters. */
  kills: number;
  encounters: EncounterSummary[];
}

function roundDisplay(v: number): number {
  return Math.max(0, Math.min(100, Math.floor(v + 0.5)));
}

function summarizeEncounter(name: string, parses: CharacterParse[]): EncounterSummary {
  const sorted = [...parses].sort((a, b) => b.precise_score - a.precise_score);
  const bestN = sorted.slice(0, BEST_N_PER_ENCOUNTER);
  const avg = bestN.reduce((sum, p) => sum + p.precise_score, 0) / bestN.length;
  const best = sorted[0];
  return {
    encounterName: name,
    score: roundDisplay(avg),
    scoreInputs: bestN.map((p) => p.precise_score),
    best: best.display_score,
    kills: parses.length,
    bestMetricValue: best.metric_value,
    bestParse: best,
  };
}

/**
 * Groups parses into raids (instance name + difficulty + size), each with
 * per-encounter summaries. Raids are ordered by parsed-kill count descending;
 * encounters keep the endpoint's order (encounter name ascending).
 */
export function summarizeRaids(parses: readonly CharacterParse[]): RaidSummary[] {
  const raidKey = (p: CharacterParse) =>
    `${p.instance_name}|${p.difficulty_name}|${p.max_players}`;

  const byRaid = new Map<string, CharacterParse[]>();
  for (const p of parses) {
    const key = raidKey(p);
    const arr = byRaid.get(key);
    if (arr) {
      arr.push(p);
    } else {
      byRaid.set(key, [p]);
    }
  }

  const raids: RaidSummary[] = [];
  for (const raidParses of byRaid.values()) {
    const byEncounter = new Map<string, CharacterParse[]>();
    for (const p of raidParses) {
      const arr = byEncounter.get(p.encounter_name);
      if (arr) {
        arr.push(p);
      } else {
        byEncounter.set(p.encounter_name, [p]);
      }
    }

    const encounters = [...byEncounter.entries()].map(([name, ps]) =>
      summarizeEncounter(name, ps),
    );
    const first = raidParses[0];
    raids.push({
      instanceName: first.instance_name,
      difficultyName: first.difficulty_name,
      maxPlayers: first.max_players,
      score: roundDisplay(
        encounters.reduce((sum, e) => sum + e.score, 0) / encounters.length,
      ),
      best: Math.max(...encounters.map((e) => e.best)),
      kills: encounters.reduce((sum, e) => sum + e.kills, 0),
      encounters,
    });
  }

  raids.sort((a, b) => b.kills - a.kills);
  return raids;
}

/** The N highest per-encounter scores across all raids, for the score card. */
export function topEncounters(raids: RaidSummary[], n: number): EncounterSummary[] {
  return raids
    .flatMap((r) => r.encounters)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/**
 * Best display score per instance (raid night), for coloring calendar cells.
 * Keyed by instance_id.
 */
export function bestScoreByInstance(parses: readonly CharacterParse[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of parses) {
    const prev = map.get(p.instance_id);
    if (prev === undefined || p.display_score > prev) {
      map.set(p.instance_id, p.display_score);
    }
  }
  return map;
}

/**
 * Average parse score per instance (raid night), rounded like the server.
 * Keyed by instance_id.
 */
export function averageScoreByInstance(parses: readonly CharacterParse[]): Map<string, number> {
  const sums = new Map<string, { sum: number; count: number }>();
  for (const p of parses) {
    const acc = sums.get(p.instance_id);
    if (acc) {
      acc.sum += p.precise_score;
      acc.count++;
    } else {
      sums.set(p.instance_id, { sum: p.precise_score, count: 1 });
    }
  }
  const map = new Map<string, number>();
  for (const [id, { sum, count }] of sums) {
    map.set(id, roundDisplay(sum / count));
  }
  return map;
}

export interface RaidProgress {
  instanceName: string;
  difficultyName: string;
  maxPlayers: number;
  /** Distinct bosses this character has killed in the raid. */
  encountersDown: number;
  /** Total kills across the raid's encounters. */
  kills: number;
}

/**
 * Groups all-time encounter kill aggregates into per-raid progression,
 * ordered by total kills descending.
 */
export function summarizeProgress(stats: readonly CharacterEncounterStats[]): RaidProgress[] {
  const byRaid = new Map<string, RaidProgress>();
  for (const s of stats) {
    const key = `${s.instance_name}|${s.difficulty_name}|${s.max_players}`;
    const raid = byRaid.get(key);
    if (raid) {
      raid.encountersDown++;
      raid.kills += s.kills;
    } else {
      byRaid.set(key, {
        instanceName: s.instance_name,
        difficultyName: s.difficulty_name,
        maxPlayers: s.max_players,
        encountersDown: 1,
        kills: s.kills,
      });
    }
  }
  return [...byRaid.values()].sort((a, b) => b.kills - a.kills);
}

/** PlayerOutfit slots that never count toward average item level. */
const SLOT_SHIRT = 3;
const SLOT_TABARD = 18;

/**
 * Average item level across equipped slots (shirt/tabard excluded), matching
 * the server's gear-history avg_ilvl. Null when no item level is known —
 * e.g. gear stored before item levels were recorded.
 */
export function averageItemLevel(gear: PlayerOutfit): number | null {
  let sum = 0;
  let count = 0;
  gear.forEach((item, i) => {
    if (i === SLOT_SHIRT || i === SLOT_TABARD) return;
    if (!item.item_id || item.item_level == null) return;
    sum += item.item_level;
    count++;
  });
  return count === 0 ? null : sum / count;
}
