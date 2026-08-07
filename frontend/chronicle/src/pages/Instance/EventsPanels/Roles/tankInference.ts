/**
 * Tank inference package — pure worker-safe TypeScript.
 *
 * Algorithm: per encounter, for each hostile source, count incoming Auto Attack
 * attempts (including amount=0 and avoided outcomes like dodge/parry/miss) to
 * players. For each source, maxAttempts = max received by any player.
 * sourceScore = playerAttempts / (maxAttempts + 5).
 * Player TankScore = max sourceScore across sources and selected encounters.
 * Classified as tank when TankScore >= TankThreshold.
 *
 * No class/spec/stance priors.
 */

/** Bump when the algorithm contract changes. */
export const AlgorithmVersion = 1;

/** Global threshold: players with TankScore >= this are tanks. */
export const TankThreshold = 0.5;

/**
 * Smoothing constant added to maxAttempts in the denominator.
 * Prevents brief pulls (few swings) from producing false positives.
 */
export const EvidenceAttempts = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Per-player evidence for a single hostile source within one encounter.
 */
export interface SourceEvidence {
  sourceGuid: string;
  sourceName: string;
  attempts: number;
  maxAttempts: number;
  score: number;
}

/**
 * Per-player tank evidence aggregated across all sources and encounters.
 */
export interface PlayerTankEvidence {
  /** Best score across all sources/encounters. */
  tankScore: number;
  /** The source that produced the best score. */
  strongestSource: SourceEvidence | null;
  /** Whether this player is classified as a tank. */
  isTank: boolean;
}

/**
 * Accumulator state built by the processor: encounter → source → player → attempts.
 * All Maps use string keys (GUIDs / encounter IDs).
 */
export interface TankAttemptCounts {
  /**
   * encounter → source → player → attempt count
   */
  counts: Map<string, Map<string, Map<string, number>>>;
  /** source GUID → most-recently-seen name */
  sourceNames: Map<string, string>;
}

export function createTankAttemptCounts(): TankAttemptCounts {
  return {
    counts: new Map(),
    sourceNames: new Map(),
  };
}

/**
 * Result of tank inference across selected encounters.
 */
export interface TankInferenceResult {
  /** player GUID → evidence */
  evidence: Map<string, PlayerTankEvidence>;
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

/**
 * Given accumulated attempt counts and the set of selected encounter IDs,
 * compute per-player TankScore and classification.
 */
export function inferTanks(
  state: TankAttemptCounts,
  selectedEncounterIds: Iterable<string>,
): TankInferenceResult {
  // Per-player best evidence across encounters.
  const best = new Map<string, PlayerTankEvidence>();

  for (const encId of selectedEncounterIds) {
    const sources = state.counts.get(encId);
    if (!sources) continue;

    for (const [sourceGuid, playerMap] of sources) {
      // Determine maxAttempts for this source in this encounter.
      let maxAttempts = 0;
      for (const attempts of playerMap.values()) {
        if (attempts > maxAttempts) maxAttempts = attempts;
      }

      const sourceName = state.sourceNames.get(sourceGuid) ?? sourceGuid;

      for (const [playerGuid, attempts] of playerMap) {
        const score = attempts / (maxAttempts + EvidenceAttempts);

        const existing = best.get(playerGuid);
        if (!existing || score > existing.tankScore) {
          best.set(playerGuid, {
            tankScore: score,
            strongestSource: {
              sourceGuid,
              sourceName,
              attempts,
              maxAttempts,
              score,
            },
            isTank: score >= TankThreshold,
          });
        }
      }
    }
  }

  return { evidence: best };
}
