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
  confidenceMultiplier: number;
  /** Highest Ranked Mastery possible at this evidence level. */
  rankedCeiling: number;
  /** Conservative leaderboard value after evidence adjustment. */
  rankedMastery: number;
}

const CONFIDENCE_KILLS = 4;
const PROVISIONAL_FLOOR = 0.55;

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

/** The highest Ranked Mastery a perfect estimate can earn at this sample size. */
export function masteryCeiling(kills: number): number {
  const confidence = masteryConfidence(kills);
  return 100 * (PROVISIONAL_FLOOR + (1 - PROVISIONAL_FLOOR) * confidence);
}

/**
 * Prototype formula:
 * - Peak preserves the player's ceiling.
 * - Form carries most of the score.
 * - Floor rewards nights that remain strong even when they are not exceptional.
 * - Evidence does not alter the estimate; it only discounts Ranked Mastery.
 */
export function calculateMastery(inputs: MasteryInputs): MasteryResult {
  const peak = clampScore(inputs.peak);
  const form = clampScore(inputs.form);
  const floor = clampScore(inputs.floor);
  const kills = Math.max(0, finiteOrZero(inputs.kills));
  const estimate = 0.3 * peak + 0.5 * form + 0.2 * floor;
  const confidence = masteryConfidence(kills);
  const confidenceMultiplier = PROVISIONAL_FLOOR + (1 - PROVISIONAL_FLOOR) * confidence;

  return {
    peak,
    form,
    floor,
    kills,
    estimate,
    confidence,
    confidenceMultiplier,
    rankedCeiling: 100 * confidenceMultiplier,
    rankedMastery: estimate * confidenceMultiplier,
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
