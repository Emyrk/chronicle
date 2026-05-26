/**
 * Roles inference utilities - infers player roles (Tank, Healer, DPS) using outlier detection
 * 
 * This module provides role inference from damage taken, healing done, and damage done data.
 * It does NOT have its own processor - instead, the RolesContent component
 * reuses data from the damage_taken, healing_done, and damage_done processors.
 * 
 * Tank detection: Players who take significantly more damage than others (outliers)
 * Healer detection: Players who do meaningful healing AND have low DPS
 *   - The low DPS requirement handles raids with many healers (e.g., 10 healers in 40-man)
 *   - Healers spend GCDs healing, not DPSing, so they naturally have low damage output
 * DPS: Everyone else
 * 
 * Uses standard deviation method for outlier detection.
 */

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
 * Debug info about thresholds used for role detection
 */
export interface RoleDetectionDebug {
  /** Z-score threshold for tank detection (e.g., 1.5 = 1.5 std devs above mean) */
  tankZThreshold: number;
  /** Z-score threshold for healer detection (healing done) */
  healerZThreshold: number;
  /** Z-score threshold for low DPS detection (healers must be below this) */
  lowDpsZThreshold: number;
  /** Z-score threshold for high healing (bypasses low DPS requirement) */
  healerHighZThreshold: number;
  meanDamageTaken: number;
  stdDevDamageTaken: number;
  meanHealingDone: number;
  stdDevHealingDone: number;
  meanDamageDone: number;
  stdDevDamageDone: number;
  /** Actual damage taken cutoff (mean + z * stddev) */
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
// 2. DPS below a threshold (healers spend GCDs healing, not DPSing)
//    OR healing is very high (above HEALER_HIGH_Z_THRESHOLD), which bypasses DPS check
const HEALER_Z_THRESHOLD = 0.3; // Above ~62nd percentile in healing
const LOW_DPS_Z_THRESHOLD = -0.90; // Must be in bottom ~18.5% of DPS
const HEALER_HIGH_Z_THRESHOLD = 1.5; // 93rd percentile in healing

/**
 * Infer roles from damage taken, healing done, and damage done data.
 * 
 * Uses z-score (standard deviations from mean) to identify outliers.
 * - Tanks: high damage taken (outlier)
 * - Healers: meaningful healing AND low DPS (not just anyone who healed)
 * - DPS: everyone else
 */
export function inferRoles(
  damageTaken: Map<string, number>,
  healingDone: Map<string, number>,
  damageDone: Map<string, number>,
  players: Record<string, { name: string; class: string }>
): InferRolesResult {
  const result = new Map<string, PlayerRoleData>();
  
  // Get all player IDs from all maps
  const playerIds = new Set([
    ...damageTaken.keys(),
    ...healingDone.keys(),
    ...damageDone.keys(),
  ]);
  
  const emptyDebug: RoleDetectionDebug = {
    tankZThreshold: TANK_Z_THRESHOLD,
    healerZThreshold: HEALER_Z_THRESHOLD,
    lowDpsZThreshold: LOW_DPS_Z_THRESHOLD,
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
  // A player who exists but did 0 healing should count toward the average
  const dtValues = [...playerIds].map(id => damageTaken.get(id) || 0);
  const hdValues = [...playerIds].map(id => healingDone.get(id) || 0);
  const ddValues = [...playerIds].map(id => damageDone.get(id) || 0);
  
  // Calculate statistics for damage taken
  const meanDT = mean(dtValues);
  const stdDT = stdDev(dtValues);
  
  // Calculate statistics for healing done
  const meanHD = mean(hdValues);
  const stdHD = stdDev(hdValues);
  
  // Calculate statistics for damage done
  const meanDD = mean(ddValues);
  const stdDD = stdDev(ddValues);
  
  // Calculate actual cutoffs
  const tankCutoff = meanDT + TANK_Z_THRESHOLD * stdDT;
  const healerCutoff = meanHD + HEALER_Z_THRESHOLD * stdHD;
  // Low DPS cutoff: healers must be BELOW this (negative z-score means below mean)
  const lowDpsCutoff = meanDD + LOW_DPS_Z_THRESHOLD * stdDD;
  // High healing cutoff: above this, DPS is ignored for healer detection
  const healerHighCutoff = meanHD + HEALER_HIGH_Z_THRESHOLD * stdHD;
  
  const debug: RoleDetectionDebug = {
    tankZThreshold: TANK_Z_THRESHOLD,
    healerZThreshold: HEALER_Z_THRESHOLD,
    lowDpsZThreshold: LOW_DPS_Z_THRESHOLD,
    healerHighZThreshold: HEALER_HIGH_Z_THRESHOLD,
    meanDamageTaken: meanDT,
    stdDevDamageTaken: stdDT,
    meanHealingDone: meanHD,
    stdDevHealingDone: stdHD,
    meanDamageDone: meanDD,
    stdDevDamageDone: stdDD,
    tankCutoff,
    healerCutoff,
    lowDpsCutoff,
    healerHighCutoff,
  };
  
  for (const playerID of playerIds) {
    const dt = damageTaken.get(playerID) || 0;
    const hd = healingDone.get(playerID) || 0;
    const dd = damageDone.get(playerID) || 0;
    const playerInfo = players[playerID];
    const playerClass = playerInfo?.class || "UNKNOWN";
    
    // Calculate z-scores
    const dtZScore = zScore(dt, meanDT, stdDT);
    const hdZScore = zScore(hd, meanHD, stdHD);
    const ddZScore = zScore(dd, meanDD, stdDD);
    
    // Determine role
    let role: InferredRole = "dps";
    
    // Tank detection: high z-score for damage taken
    const isTankOutlier = dtZScore >= TANK_Z_THRESHOLD && dt > 0;
    
    // Healer detection: meaningful healing AND (low DPS OR very high healing)
    // This handles raids with many healers - they'll all have low DPS
    // High healing bypasses DPS check for healers who also do some DPS
    const hasHealingAboveThreshold = hdZScore >= HEALER_Z_THRESHOLD && hd > 0;
    const hasLowDps = ddZScore <= LOW_DPS_Z_THRESHOLD;
    const hasVeryHighHealing = hdZScore >= HEALER_HIGH_Z_THRESHOLD;
    const isHealer = hasHealingAboveThreshold && (hasLowDps || hasVeryHighHealing);
    
    // Prioritize tank detection over healer (someone taking tons of damage is probably tanking)
    if (isTankOutlier) {
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
