/**
 * Physical Avoidance processor - tracks physical attacks avoided via dodge, parry, or block.
 * 
 * Calculates avoidance percentage: (dodge + parry + block) / total_physical_attacks * 100
 * 
 * Total physical attacks = hits + absorbs + dodges + parries + blocks
 */

import type { DamageProcessorEvent, PanelProcessor, ProcessorContext } from "../processorTypes";
import { 
  HitTypeDodge,
  HitTypeParry,
  HitTypeFullBlock,
  HitTypeHit,
  HitTypeFullAbsorb,
  HitTypeCrit,
  hasHitType,
} from "@/lib/hittype/hittype";
import { createGuidCache, getCachedGuid, isPlayerGuidFast, isPetGuidFast, type GuidCache } from "./guidCache";

// Physical school constant
const PHYSICAL_SCHOOL = 0x01;

/**
 * Avoidance breakdown by type for a single player.
 */
export interface AvoidanceData {
  playerID: string;
  playerName: string;
  className: string;
  dodge: number;
  parry: number;
  block: number;
  /** Total avoided (dodge + parry + block) */
  avoided: number;
  /** Total physical attacks against this player */
  totalAttacks: number;
  /** Avoidance percentage (avoided / totalAttacks * 100) */
  avoidancePercent: number;
}

// Map of playerID -> AvoidanceData per encounter
export type EncounterAvoidance = Map<string, AvoidanceData>;

export type AvoidanceResult = {
  // Per-encounter aggregation
  EncounterAvoidance: Map<string, EncounterAvoidance>;
  // Breakouts for selected encounters
  // playerID -> abilityName -> counts
  ByAbility: Map<string, Map<string, AvoidanceCounts>>;
  // playerID -> sourceID -> counts
  BySource: Map<string, Map<string, AvoidanceCounts>>;
  // GUID cache for performance
  GuidCache: GuidCache;
};

interface AvoidanceCounts {
  dodge: number;
  parry: number;
  block: number;
  hits: number;
}

function createEmptyCounts(): AvoidanceCounts {
  return {
    dodge: 0,
    parry: 0,
    block: 0,
    hits: 0,
  };
}

/**
 * Create the avoidance processor.
 */
export function createAvoidanceProcessor(): PanelProcessor<AvoidanceResult, DamageProcessorEvent> {
  return {
    id: "avoidance",
    streams: ["damage"],

    createState: () => ({
      EncounterAvoidance: new Map(),
      ByAbility: new Map(),
      BySource: new Map(),
      GuidCache: createGuidCache(),
    }),

    processEvent: (
      state: AvoidanceResult,
      event: DamageProcessorEvent,
      encounterID: string,
      _: Date,
      _streamType: string,
      context: ProcessorContext
    ) => {
      if (!event.target) return;

      // Only track physical damage (school = 1)
      const isPhysical = event.schools.includes(PHYSICAL_SCHOOL) || event.schools.includes(0);
      if (!isPhysical) return;

      // Check for physical avoidance hit types
      const hitType = event.hitType;
      const isDodge = hasHitType(hitType, HitTypeDodge);
      const isParry = hasHitType(hitType, HitTypeParry);
      const isFullBlock = hasHitType(hitType, HitTypeFullBlock);
      
      // Check for hits that landed (hit, crit, or full absorb)
      const isHit = hasHitType(hitType, HitTypeHit) || hasHitType(hitType, HitTypeCrit);
      const isAbsorb = hasHitType(hitType, HitTypeFullAbsorb);
      const isLandedHit = isHit || isAbsorb;

      // Skip if not a relevant physical attack
      if (!isDodge && !isParry && !isFullBlock && !isLandedHit) {
        return;
      }

      const guidCache = state.GuidCache;
      
      // Only track avoidance for players and player-owned pets
      const isPlayer = isPlayerGuidFast(event.target) || getCachedGuid(guidCache, event.target).isPlayer();
      const targetInfo = context.units?.[event.target];
      const isPet = !isPlayer && isPetGuidFast(event.target) && targetInfo?.owner && 
        (isPlayerGuidFast(targetInfo.owner) || getCachedGuid(guidCache, targetInfo.owner).isPlayer());
      
      if (!isPlayer && !isPet) return;

      // Get target info
      const targetID = event.target;
      let targetName: string;
      let targetClass: string;
      
      if (isPlayer) {
        targetName = context.players[targetID]?.name || targetID;
        targetClass = context.players[targetID]?.class || "UNKNOWN";
      } else {
        // Pet - use owner's info
        const ownerID = targetInfo!.owner!;
        const ownerName = context.players[ownerID]?.name || "Unknown";
        targetName = `${ownerName}'s Pet ${targetInfo!.name}`;
        targetClass = context.players[ownerID]?.class || "UNKNOWN";
      }

      // === Update per-encounter aggregation ===
      if (!state.EncounterAvoidance.has(encounterID)) {
        state.EncounterAvoidance.set(encounterID, new Map());
      }
      const encounterAvoidance = state.EncounterAvoidance.get(encounterID)!;

      let playerData = encounterAvoidance.get(targetID);
      if (!playerData) {
        playerData = {
          playerID: targetID,
          playerName: targetName,
          className: targetClass,
          dodge: 0,
          parry: 0,
          block: 0,
          avoided: 0,
          totalAttacks: 0,
          avoidancePercent: 0,
        };
        encounterAvoidance.set(targetID, playerData);
      }

      if (isDodge) {
        playerData.dodge++;
        playerData.avoided++;
      }
      if (isParry) {
        playerData.parry++;
        playerData.avoided++;
      }
      if (isFullBlock) {
        playerData.block++;
        playerData.avoided++;
      }
      playerData.totalAttacks++;
      playerData.avoidancePercent = playerData.totalAttacks > 0 
        ? (playerData.avoided / playerData.totalAttacks) * 100 
        : 0;

      // === Breakouts (only for selected encounters) ===
      if (!context.selectedEncounterIds.has(encounterID)) return;
      
      // Filter by entity selection
      const includeInBreakout = context.entitySelection.playerIds.size === 0 || 
        context.entitySelection.playerIds.has(targetID);
      if (!includeInBreakout) return;

      const abilityName = event.sourceName || "Auto Attack";
      const sourceID = event.caster || "__unknown__";

      // By ability
      if (!state.ByAbility.has(targetID)) {
        state.ByAbility.set(targetID, new Map());
      }
      const abilityMap = state.ByAbility.get(targetID)!;
      const abilityData = abilityMap.get(abilityName) || createEmptyCounts();
      if (isDodge) abilityData.dodge++;
      if (isParry) abilityData.parry++;
      if (isFullBlock) abilityData.block++;
      if (isLandedHit) abilityData.hits++;
      abilityMap.set(abilityName, abilityData);

      // By source
      if (!state.BySource.has(targetID)) {
        state.BySource.set(targetID, new Map());
      }
      const sourceMap = state.BySource.get(targetID)!;
      const sourceData = sourceMap.get(sourceID) || createEmptyCounts();
      if (isDodge) sourceData.dodge++;
      if (isParry) sourceData.parry++;
      if (isFullBlock) sourceData.block++;
      if (isLandedHit) sourceData.hits++;
      sourceMap.set(sourceID, sourceData);
    },
  };
}

// Pre-created processor for registry
export const avoidanceProcessor = createAvoidanceProcessor();
