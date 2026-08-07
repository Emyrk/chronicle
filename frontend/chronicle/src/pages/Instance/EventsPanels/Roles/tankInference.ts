/**
 * Tank inference package — pure worker-safe TypeScript.
 *
 * Per encounter and hostile source, sourceScore is:
 *
 *   playerAttempts / (maxAttempts + EvidenceAttempts)
 *
 * Each player keeps their best source score per encounter. Across selected
 * encounters, persistenceScore compares the sum of those encounter-best scores
 * with the largest player sum. tankScore is the lesser of strongestSourceScore
 * and persistenceScore, so one isolated pull cannot define a player's role for
 * an entire raid while single-encounter behavior remains unchanged.
 *
 * No class/spec/stance priors.
 */

/** Bump when the algorithm contract changes. */
export const AlgorithmVersion = 2;

/** The one global tank classification threshold. */
export const TankThreshold = 0.4;

/**
 * Smoothing constant added to maxAttempts in the denominator.
 * Prevents brief pulls (few swings) from producing false positives.
 */
export const EvidenceAttempts = 5;

/** Per-player evidence for a single hostile source within one encounter. */
export interface SourceEvidence {
  sourceGuid: string;
  sourceName: string;
  attempts: number;
  maxAttempts: number;
  score: number;
}

/** Per-player tank evidence aggregated across all selected encounters. */
export interface PlayerTankEvidence {
  /** Lesser of strongestSourceScore and persistenceScore. */
  tankScore: number;
  /** Best source score in any selected encounter. */
  strongestSourceScore: number;
  /** Sum of the player's best source score per selected encounter. */
  cumulativeScore: number;
  /** Cumulative score relative to the largest player cumulative score. */
  persistenceScore: number;
  /** The source that produced strongestSourceScore. */
  strongestSource: SourceEvidence | null;
  /** Whether this player is classified as a tank. */
  isTank: boolean;
}

/**
 * Accumulator state built by the processor: encounter → source → player → attempts.
 * All Maps use string keys (GUIDs / encounter IDs).
 */
export interface TankAttemptCounts {
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

/** Result of tank inference across selected encounters. */
export interface TankInferenceResult {
  /** player GUID → evidence */
  evidence: Map<string, PlayerTankEvidence>;
}

/** Compute per-player tank evidence across the selected encounter IDs. */
export function inferTanks(
  state: TankAttemptCounts,
  selectedEncounterIds: Iterable<string>,
): TankInferenceResult {
  const evidence = new Map<string, PlayerTankEvidence>();

  for (const encounterId of selectedEncounterIds) {
    const sources = state.counts.get(encounterId);
    if (!sources) continue;

    // Only one source score per player contributes in each encounter so a pull
    // with many adds does not receive more weight than a single-boss encounter.
    const encounterBest = new Map<string, number>();

    for (const [sourceGuid, playerMap] of sources) {
      let maxAttempts = 0;
      for (const attempts of playerMap.values()) {
        if (attempts > maxAttempts) maxAttempts = attempts;
      }

      const sourceName = state.sourceNames.get(sourceGuid) ?? sourceGuid;
      for (const [playerGuid, attempts] of playerMap) {
        const score = attempts / (maxAttempts + EvidenceAttempts);
        if (score > (encounterBest.get(playerGuid) ?? 0)) {
          encounterBest.set(playerGuid, score);
        }

        const existing = evidence.get(playerGuid);
        if (!existing) {
          evidence.set(playerGuid, {
            tankScore: 0,
            strongestSourceScore: score,
            cumulativeScore: 0,
            persistenceScore: 0,
            strongestSource: {
              sourceGuid,
              sourceName,
              attempts,
              maxAttempts,
              score,
            },
            isTank: false,
          });
        } else if (score > existing.strongestSourceScore) {
          existing.strongestSourceScore = score;
          existing.strongestSource = {
            sourceGuid,
            sourceName,
            attempts,
            maxAttempts,
            score,
          };
        }
      }
    }

    for (const [playerGuid, score] of encounterBest) {
      evidence.get(playerGuid)!.cumulativeScore += score;
    }
  }

  let maxCumulativeScore = 0;
  for (const playerEvidence of evidence.values()) {
    maxCumulativeScore = Math.max(maxCumulativeScore, playerEvidence.cumulativeScore);
  }

  for (const playerEvidence of evidence.values()) {
    playerEvidence.persistenceScore = maxCumulativeScore > 0
      ? playerEvidence.cumulativeScore / maxCumulativeScore
      : 0;
    playerEvidence.tankScore = Math.min(
      playerEvidence.strongestSourceScore,
      playerEvidence.persistenceScore,
    );
    playerEvidence.isTank = playerEvidence.tankScore >= TankThreshold;
  }

  return { evidence };
}
