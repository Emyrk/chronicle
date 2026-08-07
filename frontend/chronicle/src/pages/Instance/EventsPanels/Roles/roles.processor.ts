/**
 * Roles inference utilities - infers player roles (Tank, Healer, DPS).
 * 
 * This module provides role inference from tank attempt-count evidence,
 * healing done, and damage done data.
 * It does NOT have its own processor - instead, the RolesContent component
 * reuses data from the tank_attempts, healing_done, and damage_done processors.
 * 
 * Tank detection: Uses source-aware Auto Attack attempt counting via tankInference.
 *   Players whose TankScore >= TankThreshold are classified as tanks.
 * Healer detection: Players who do meaningful healing AND have low DPS
 *   - The low DPS requirement handles raids with many healers (e.g., 10 healers in 40-man)
 *   - Healers spend GCDs healing, not DPSing, so they naturally have low damage output
 * DPS: Everyone else
 * 
 * Uses standard deviation outliers for healing signals and a percentile for low damage.
 */

import type { TankInferenceResult } from "./tankInference";

/**
 * Inferred role for a player
 */
export type InferredRole = "tank" | "healer" | "dps";

/**
 * Player role data
 */
export interface PlayerRoleData {
  playerID: string;
  playerName: string;
  className: string;
  
  /** The inferred role */
  role: InferredRole;
}

/**
 * Role summary
 */
export interface RoleSummary {
  tanks: PlayerRoleData[];
  healers: PlayerRoleData[];
  dps: PlayerRoleData[];
}



/**
 * Calculate mean of an array of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation
 */
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map(v => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * Calculate z-score (how many standard deviations from the mean)
 */
function zScore(value: number, avg: number, sd: number): number {
  if (sd === 0) return value > avg ? Infinity : 0;
  return (value - avg) / sd;
}

/**
 * Calculate a percentile using linear interpolation between sorted values.
 */
function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const weight = position - lowerIndex;

  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * weight;
}

/**
 * Debug info about thresholds used for role detection
 */
export interface RoleDetectionDebug {
  /** Z-score threshold for tank detection — kept for backward compatibility but unused by new algorithm */
  tankZThreshold: number;
  /** Z-score threshold for healer detection (healing done) */
  healerZThreshold: number;
  /** Bottom fraction of damage dealers considered low DPS */
  lowDpsPercentile: number;
  /** Z-score threshold for high healing (bypasses low DPS requirement) */
  healerHighZThreshold: number;
  meanDamageTaken: number;
  stdDevDamageTaken: number;
  meanHealingDone: number;
  stdDevHealingDone: number;
  meanDamageDone: number;
  stdDevDamageDone: number;
  /** Actual damage taken cutoff — unused by new tank algorithm */
  tankCutoff: number;
  /** Actual healing done cutoff (mean + z * stddev) */
  healerCutoff: number;
  /** Actual damage done cutoff - healers must be BELOW this */
  lowDpsCutoff: number;
  /** Actual high healing cutoff - above this, DPS is ignored */
  healerHighCutoff: number;
}

/**
 * Result of role inference including debug info
 */
export interface InferRolesResult {
  roles: Map<string, PlayerRoleData>;
  debug: RoleDetectionDebug;
}

// Z-score thresholds for role detection
// Lower = more sensitive (catches more tanks/healers)
// 1.0 = 1 standard deviation above mean (catches ~16% of highest values)
// 1.5 = 1.5 standard deviations (catches ~7% of highest values)
const TANK_Z_THRESHOLD = 1.7;

// Healer detection uses TWO criteria:
// 1. Healing done above a lower threshold (since many healers in a raid skew the average)
// 2. Damage done in the bottom percentile (healers spend GCDs healing, not DPSing)
//    OR healing is very high (above HEALER_HIGH_Z_THRESHOLD), which bypasses DPS check
const HEALER_Z_THRESHOLD = 0.3; // Above ~62nd percentile in healing
const LOW_DPS_PERCENTILE = 0.185;
const HEALER_HIGH_Z_THRESHOLD = 1.5; // 93rd percentile in healing

/**
 * Infer roles from tank evidence, healing done, and damage done data.
 * 
 * - Tanks: classified by source-aware Auto Attack attempt counting (TankInferenceResult)
 * - Healers: meaningful healing AND low damage (not just anyone who healed)
 * - DPS: everyone else
 */
export function inferRoles(
  tankResult: TankInferenceResult,
  healingDone: Map<string, number>,
  damageDone: Map<string, number>,
  players: Record<string, { name: string; class: string }>
): InferRolesResult {
  const result = new Map<string, PlayerRoleData>();
  
  // Get all player IDs from all maps
  const playerIds = new Set([
    ...tankResult.evidence.keys(),
    ...healingDone.keys(),
    ...damageDone.keys(),
  ]);
  
  const emptyDebug: RoleDetectionDebug = {
    tankZThreshold: TANK_Z_THRESHOLD,
    healerZThreshold: HEALER_Z_THRESHOLD,
    lowDpsPercentile: LOW_DPS_PERCENTILE,
    healerHighZThreshold: HEALER_HIGH_Z_THRESHOLD,
    meanDamageTaken: 0,
    stdDevDamageTaken: 0,
    meanHealingDone: 0,
    stdDevHealingDone: 0,
    meanDamageDone: 0,
    stdDevDamageDone: 0,
    tankCutoff: 0,
    healerCutoff: 0,
    lowDpsCutoff: 0,
    healerHighCutoff: 0,
  };
  
  if (playerIds.size === 0) return { roles: result, debug: emptyDebug };
  
  // Get values - include zeros for all players to not skew statistics
  const hdValues = [...playerIds].map(id => healingDone.get(id) || 0);
  const ddValues = [...playerIds].map(id => damageDone.get(id) || 0);
  
  // Calculate statistics for healing done
  const meanHD = mean(hdValues);
  const stdHD = stdDev(hdValues);
  
  // Calculate statistics for damage done
  const meanDD = mean(ddValues);
  const stdDD = stdDev(ddValues);
  
  // Calculate actual cutoffs
  const healerCutoff = meanHD + HEALER_Z_THRESHOLD * stdHD;
  // Damage done is strongly right-skewed, so use the observed percentile directly.
  const lowDpsCutoff = percentile(ddValues, LOW_DPS_PERCENTILE);
  const healerHighCutoff = meanHD + HEALER_HIGH_Z_THRESHOLD * stdHD;
  
  const debug: RoleDetectionDebug = {
    tankZThreshold: TANK_Z_THRESHOLD,
    healerZThreshold: HEALER_Z_THRESHOLD,
    lowDpsPercentile: LOW_DPS_PERCENTILE,
    healerHighZThreshold: HEALER_HIGH_Z_THRESHOLD,
    meanDamageTaken: 0,
    stdDevDamageTaken: 0,
    meanHealingDone: meanHD,
    stdDevHealingDone: stdHD,
    meanDamageDone: meanDD,
    stdDevDamageDone: stdDD,
    tankCutoff: 0,
    healerCutoff,
    lowDpsCutoff,
    healerHighCutoff,
  };
  
  for (const playerID of playerIds) {
    const hd = healingDone.get(playerID) || 0;
    const dd = damageDone.get(playerID) || 0;
    const playerInfo = players[playerID];
    const playerClass = playerInfo?.class || "UNKNOWN";
    
    // Calculate z-scores
    const hdZScore = zScore(hd, meanHD, stdHD);
    
    // Determine role
    let role: InferredRole = "dps";
    
    // Tank detection: from source-aware Auto Attack attempt inference.
    const tankEvidence = tankResult.evidence.get(playerID);
    const isTank = tankEvidence?.isTank ?? false;
    
    // Healer detection: meaningful healing AND (low DPS OR very high healing)
    const hasHealingAboveThreshold = hdZScore >= HEALER_Z_THRESHOLD && hd > 0;
    const hasLowDps = dd <= lowDpsCutoff;
    const hasVeryHighHealing = hdZScore >= HEALER_HIGH_Z_THRESHOLD;
    const isHealer = hasHealingAboveThreshold && (hasLowDps || hasVeryHighHealing);
    
    // Prioritize tank detection over healer
    if (isTank) {
      role = "tank";
    } else if (isHealer) {
      role = "healer";
    }
    
    result.set(playerID, {
      playerID,
      playerName: playerInfo?.name || playerID,
      className: playerClass,
      role,
    });
  }
  
  return { roles: result, debug };
}

/**
 * Get role summary from player roles, sorted alphabetically by name
 */
export function getRoleSummary(roles: Map<string, PlayerRoleData>): RoleSummary {
  const tanks: PlayerRoleData[] = [];
  const healers: PlayerRoleData[] = [];
  const dps: PlayerRoleData[] = [];
  
  for (const data of roles.values()) {
    switch (data.role) {
      case "tank":
        tanks.push(data);
        break;
      case "healer":
        healers.push(data);
        break;
      case "dps":
        dps.push(data);
        break;
    }
  }
  
  // Sort alphabetically by name
  const sortByName = (a: PlayerRoleData, b: PlayerRoleData) => 
    a.playerName.localeCompare(b.playerName);
  
  tanks.sort(sortByName);
  healers.sort(sortByName);
  dps.sort(sortByName);
  
  return { tanks, healers, dps };
}
