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

const CONFIDENCE_KILLS = 4;
const FULL_RANKING_KILLS = 5;
const NO_KILL_RANKING_WEIGHT = 0.55;
const ONE_KILL_RANKING_WEIGHT = 0.65;

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

/** Provisional ranking adjustment ends after five eligible kills per boss. */
function rankingEvidenceMultiplier(kills: number): number {
  const count = Math.max(0, finiteOrZero(kills));
  return NO_KILL_RANKING_WEIGHT
    + (ONE_KILL_RANKING_WEIGHT - NO_KILL_RANKING_WEIGHT) * Math.min(count, 1)
    + (1 - ONE_KILL_RANKING_WEIGHT) * Math.min(Math.max(count - 1, 0) / (FULL_RANKING_KILLS - 1), 1);
}

/** The highest Ranked Mastery a perfect estimate can earn at this sample size. */
export function masteryCeiling(kills: number): number {
  return 100 * rankingEvidenceMultiplier(kills);
}

/**
 * Prototype formula:
 * - Peak preserves the player's ceiling.
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
  const estimate = 0.3 * peak + 0.5 * form + 0.2 * floor;
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
