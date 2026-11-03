export interface MasteryInputs {
  peak: number;
  form: number;
  floor: number;
  kills: number;
}

export interface MasteryResult extends MasteryInputs {
  /** The repeatable performance suggested by the observed parses. */
  estimate: number;
  confidence: number;
  rankingMultiplier: number;
  /** Highest Ranked Mastery possible at this evidence level. */
  rankedCeiling: number;
  /** Conservative leaderboard value after evidence adjustment. */
  rankedMastery: number;
}

// The backend's fixed tenant rating policy (internal/ratingmath): 35% best + 50% Form +
// 15% Floor, and a ranking weight of 50% at one kill reaching 100% at five.
const CONFIDENCE_KILLS = 4;
const FULL_RANKING_KILLS = 5;
const ONE_KILL_RANKING_WEIGHT = 0.5;
const BEST_WEIGHT = 0.35;
const FORM_WEIGHT = 0.5;
const FLOOR_WEIGHT = 0.15;

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, finiteOrZero(value)));
}

/**
 * Confidence grows quickly through the first few kills, then tapers off.
 * One kill proves that a result happened, not that it is repeatable.
 */
export function masteryConfidence(kills: number): number {
  return 1 - Math.exp(-Math.max(0, finiteOrZero(kills)) / CONFIDENCE_KILLS);
}

/** Provisional ranking adjustment: 50% at one kill, rising evenly to 100% at five. */
function rankingEvidenceMultiplier(kills: number): number {
  const count = Math.max(1, finiteOrZero(kills));
  return ONE_KILL_RANKING_WEIGHT
    + (1 - ONE_KILL_RANKING_WEIGHT) * Math.min((count - 1) / (FULL_RANKING_KILLS - 1), 1);
}

/** The highest Ranked Mastery a perfect estimate can earn at this sample size. */
export function masteryCeiling(kills: number): number {
  return 100 * rankingEvidenceMultiplier(kills);
}

/**
 * The backend formula, per boss:
 * - Peak (the best locked parse) preserves the player's ceiling.
 * - Form carries most of the score.
 * - Floor rewards nights that remain strong even when they are not exceptional.
 * - The provisional ranking adjustment does not alter the estimate and ends at five kills.
 * - Confidence remains descriptive and can keep growing after the ranking adjustment ends.
 */
export function calculateMastery(inputs: MasteryInputs): MasteryResult {
  const peak = clampScore(inputs.peak);
  const form = clampScore(inputs.form);
  const floor = clampScore(inputs.floor);
  const kills = Math.max(0, finiteOrZero(inputs.kills));
  const estimate = BEST_WEIGHT * peak + FORM_WEIGHT * form + FLOOR_WEIGHT * floor;
  const confidence = masteryConfidence(kills);
  const rankingMultiplier = rankingEvidenceMultiplier(kills);

  return {
    peak,
    form,
    floor,
    kills,
    estimate,
    confidence,
    rankingMultiplier,
    rankedCeiling: 100 * rankingMultiplier,
    rankedMastery: estimate * rankingMultiplier,
  };
}

export interface RenownInputs {
  kills: number;
  bosses: number;
  completedRaids: number;
}

/**
 * Renown rewards witnessed breadth and repetition, with diminishing returns per
 * boss. It deliberately contains no performance term: Renown is history, not skill.
 * The fixture-level calculation approximates per-boss repetition using average kills.
 */
export function calculateRenown({ kills, bosses, completedRaids }: RenownInputs): number {
  const safeBosses = Math.max(0, finiteOrZero(bosses));
  const safeKills = Math.max(0, finiteOrZero(kills));
  const averageKills = safeBosses > 0 ? safeKills / safeBosses : 0;
  const repetition = averageKills > 0 ? 1 - Math.exp(-Math.max(0, averageKills - 1) / 6) : 0;
  const bossRenown = safeBosses * (averageKills > 0 ? 50 + 50 * repetition : 0);

  return Math.round(bossRenown + Math.max(0, finiteOrZero(completedRaids)) * 250);
}

export function renownTitle(renown: number): string {
  if (renown >= 5_000) return "Legendary";
  if (renown >= 3_000) return "Exalted";
  if (renown >= 1_500) return "Celebrated";
  if (renown >= 500) return "Respected";
  return "Known";
}
