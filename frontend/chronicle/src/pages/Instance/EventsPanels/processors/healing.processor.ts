/**
 * Unified Healing processor - aggregates healing by both caster AND target in a single pass.
 * 
 * This processor is more efficient than separate HealingDone/HealingTaken processors
 * because it only processes damage/heal/resource_change streams once, and the health
 * deficit tracking is shared.
 * 
 * Tracks effective healing vs overhealing by maintaining health deficits per unit.
 * 
 * Logic:
 * - Damage taken increases a unit's health deficit
 * - Resource change (health loss) increases deficit
 * - Heals reduce deficit (never below 0)
 * - Effective healing = min(heal amount, current deficit)
 * - Overhealing = heal amount - effective healing
 */

import type { DamageProcessorEvent, HealProcessorEvent, PanelProcessor, ProcessorContext, ResourceChangeProcessorEvent } from "../processorTypes";
import { hasHitType, HitTypePeriodic } from "@/lib/hittype/hittype";
import { accumulateAbilityBreakout, accumulateAbilityBreakoutBySpellId, type DamageAbilityBreakout, type SpellIdAbilityBreakout } from "./abilityBreakout";
import { isResourceChangeEvent, isDamageEvent } from "./events";
import { createGuidCache, getCachedGuid, isPlayerGuidFast, isPetGuidFast, type GuidCache } from "./guidCache";
import { resolveEntity, extractGroupingFromPanelOption, extractPetModeFromPanelOption } from "./resolveEntity";

// Re-export the shared type (works for healing too)
export type { DamageAbilityBreakout as HealingAbilityBreakout } from "./abilityBreakout";

/**
 * Healing breakdown per target for a single healer (HealingDone aggregation)
 */
export interface HealingTargetData {
  effective: number;
  overheal: number;
  total: number;
}

/**
 * Healer data for HealingDone aggregation.
 */
export interface HealerData {
  playerID: string;
  playerName: string;
  className: string;
  specialization: string;
  // target guid -> healing breakdown (effective, overheal, total)
  target: Map<string, HealingTargetData>;
  // Aggregate totals for this healer
  effectiveTotal: number;
  overhealTotal: number;
}

/**
 * Healing source breakdown for a single target (HealingTaken aggregation)
 */
export interface HealingSourceData {
  effective: number;
  overheal: number;
  total: number;
}

/**
 * Target data for HealingTaken aggregation.
 */
export interface HealingReceiverData {
  playerID: string;
  playerName: string;
  className: string;
  specialization: string;
  // source guid -> healing breakdown (effective, overheal, total)
  source: Map<string, HealingSourceData>;
  // Aggregate totals for this receiver
  effectiveTotal: number;
  overhealTotal: number;
}

// Maps for per-encounter aggregations
export type UnitHealingDone = Map<string, HealerData>;
export type UnitHealingTaken = Map<string, HealingReceiverData>;

export type UnifiedHealingResult = {
  // === HealingDone data (by healer) ===
  EncounterHealingByHealer: Map<string, UnitHealingDone>;
  // Breakouts: healerID -> abilityName -> data
  HealerByAbility: Map<string, Map<string, DamageAbilityBreakout>>;
  HealerByAbilityOverheal: Map<string, Map<string, DamageAbilityBreakout>>;
  HealerByAbilityTotal: Map<string, Map<string, DamageAbilityBreakout>>;
  // Breakouts: healerID -> targetID -> amount
  HealerByTarget: Map<string, Map<string, number>>;
  HealerByTargetOverheal: Map<string, Map<string, number>>;
  HealerByTargetTotal: Map<string, Map<string, number>>;
  // Breakouts by spell ID (for "Show ranks" mode): healerID -> spellId -> data
  HealerByAbilityBySpellId: Map<string, Map<number, SpellIdAbilityBreakout>>;
  HealerByAbilityOverhealBySpellId: Map<string, Map<number, SpellIdAbilityBreakout>>;
  HealerByAbilityTotalBySpellId: Map<string, Map<number, SpellIdAbilityBreakout>>;
  
  // === HealingTaken data (by target) ===
  EncounterHealingByTarget: Map<string, UnitHealingTaken>;
  // Breakouts: targetID -> abilityName -> data  
  TargetByAbility: Map<string, Map<string, DamageAbilityBreakout>>;
  TargetByAbilityOverheal: Map<string, Map<string, DamageAbilityBreakout>>;
  TargetByAbilityTotal: Map<string, Map<string, DamageAbilityBreakout>>;
  // Breakouts: targetID -> sourceID -> amount
  TargetBySource: Map<string, Map<string, number>>;
  TargetBySourceOverheal: Map<string, Map<string, number>>;
  TargetBySourceTotal: Map<string, Map<string, number>>;
  
  // === Shared state ===
  // Health deficit tracking: targetGUID -> deficit (positive = damage taken)
  // Reset to empty when encounterID changes. Only used when ServerOverheal is false.
  HealthDeficits: Map<string, number>;
  // Track last encounter ID to detect transitions
  LastEncounterID: string | null;
  // GUID cache for performance (avoids repeated parsing)
  GuidCache: GuidCache;
  // Cached capability check — null means not yet resolved.
  // When true, server provides event.overheal; when false, client computes via deficit tracking.
  ServerOverheal: boolean | null;
}

/**
 * Get health deficit map, resetting if encounter changed.
 * This ensures each encounter starts with fresh deficit tracking.
 */
function getDeficits(state: UnifiedHealingResult, encounterID: string): Map<string, number> {
  if (state.LastEncounterID !== encounterID) {
    // New encounter - reset all deficits to 0
    state.HealthDeficits.clear();
    state.LastEncounterID = encounterID;
  }
  return state.HealthDeficits;
}

/**
 * Create the unified healing processor.
 */
export function createUnifiedHealingProcessor(): PanelProcessor<UnifiedHealingResult, DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent> {
  return {
    id: "healing",
    streams: ["damage", "heal", "resource_change"],
    processAllEvents: true, // Deficit tracking needs ALL events; filter applied inside for aggregation only

    createState: () => ({
      // HealingDone
      EncounterHealingByHealer: new Map(),
      HealerByAbility: new Map(),
      HealerByAbilityOverheal: new Map(),
      HealerByAbilityTotal: new Map(),
      HealerByTarget: new Map(),
      HealerByTargetOverheal: new Map(),
      HealerByTargetTotal: new Map(),
      // HealingDone by spell ID (for "Show ranks" mode)
      HealerByAbilityBySpellId: new Map(),
      HealerByAbilityOverhealBySpellId: new Map(),
      HealerByAbilityTotalBySpellId: new Map(),
      // HealingTaken
      EncounterHealingByTarget: new Map(),
      TargetByAbility: new Map(),
      TargetByAbilityOverheal: new Map(),
      TargetByAbilityTotal: new Map(),
      TargetBySource: new Map(),
      TargetBySourceOverheal: new Map(),
      TargetBySourceTotal: new Map(),
      // Shared
      HealthDeficits: new Map(),
      LastEncounterID: null,
      GuidCache: createGuidCache(),
      ServerOverheal: null,
    }),

    processEvent: (
      state: UnifiedHealingResult,
      event: DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent,
      encounterID: string,
      _: Date,
      streamType: string,
      context: ProcessorContext
    ) => {
      const guidCache = state.GuidCache;
      
      // Helper to check if a target is a player or a player-owned pet.
      // Fast path: if already in deficits map, we've validated them before.
      const isPlayerOrFriendlyPet = (targetGuid: string): boolean => {
        if (state.HealthDeficits.has(targetGuid)) return true;
        if (isPlayerGuidFast(targetGuid)) return true;
        if (isPetGuidFast(targetGuid)) {
          // Pet must have a player owner
          const petInfo = context.units?.[targetGuid];
          if (petInfo?.owner) {
            return isPlayerGuidFast(petInfo.owner) || getCachedGuid(guidCache, petInfo.owner).isPlayer();
          }
        }
        return false;
      };

      // ──────────────────────────────────────────────
      // PHASE 1: Ensure event.overheal is populated.
      // When the server provides overheal (capability "overheal"), it's already set.
      // Otherwise, run client-side deficit tracking to compute and write it onto the event.
      // ──────────────────────────────────────────────
      
      // Resolve capability once on first event
      if (state.ServerOverheal === null) {
        state.ServerOverheal = context.capabilities?.includes("overheal") ?? false;
      }

      if (!state.ServerOverheal) {
        // Legacy: client-side deficit tracking to polyfill event.overheal
        const deficits = getDeficits(state, encounterID);

        // Damage → increase deficit, done
        if (isDamageEvent(event, streamType)) {
          if (!isPlayerOrFriendlyPet(event.target)) return;
          deficits.set(event.target, (deficits.get(event.target) || 0) + event.amount);
          return;
        }

        // Resource change health loss → increase deficit, done
        if (isResourceChangeEvent(event, streamType)) {
          if (event.resourceType !== "Health") return;
          if (!isPlayerOrFriendlyPet(event.target)) return;
          if (event.direction === "Loss") {
            deficits.set(event.target, (deficits.get(event.target) || 0) + event.amount);
            return;
          }
          // Health gain - treat as healing (fall through to healing logic below)
          if (event.direction !== "Gain") return;
        }

        // Heal/resource_change health gain → compute overheal from deficit, write onto event
        if (streamType === "heal" || streamType === "resource_change") {
          if (isPlayerOrFriendlyPet(event.target)) {
            const deficit = deficits.get(event.target) || 0;
            const effective = Math.min(event.amount, deficit);
            const over = event.amount - effective;
            deficits.set(event.target, Math.max(0, deficit - effective));
            if (streamType === "heal") {
              (event as HealProcessorEvent).overheal = over;
            } else {
              (event as ResourceChangeProcessorEvent).overResource = over;
            }
          } else {
            // Non-player, non-pet targets: count all healing as overheal
            if (streamType === "heal") {
              (event as HealProcessorEvent).overheal = event.amount;
            } else {
              (event as ResourceChangeProcessorEvent).overResource = event.amount;
            }
          }
        }
      } else {
        // Server provided overheal — skip damage/resource_change entirely
        if (isDamageEvent(event, streamType)) return;
        if (isResourceChangeEvent(event, streamType)) {
          if (event.resourceType !== "Health" || event.direction !== "Gain") return;
        }
      }

      // ──────────────────────────────────────────────
      // PHASE 2: Aggregation — event.overheal is always set by now
      // ──────────────────────────────────────────────
      
      // From here on, we're handling heal events or resource_change health gains
      if (!(streamType === "heal" || streamType === "resource_change")) return;
      if (!event.caster) return;

      // Resolve caster via resolveEntity (handles players, pets, objects)
      const grouping = extractGroupingFromPanelOption(context.panelOption, "merged");
      const petMode = extractPetModeFromPanelOption(context.panelOption);
      const entity = resolveEntity(event.caster, context, grouping, petMode);

      const healerID = entity.id;
      const targetID = event.target;
      const healAmount = event.amount;
      const overheal = streamType === "heal"
        ? (event as HealProcessorEvent).overheal ?? 0
        : (event as ResourceChangeProcessorEvent).overResource ?? 0;
      const effectiveHeal = healAmount - overheal;

      // Filter check: deficit tracking above always runs, but only aggregate events that pass the filter
      if (context.compiledFilter && !context.compiledFilter(event)) return;

      // Get healer info from resolved entity
      let healerName = entity.name;
      const healerClass = entity.class;

      // When merged grouping merges pet healing into a player-owner row,
      // use the owner's actual name instead of "Owner's Companions"
      if (grouping === "merged" && healerID !== event.caster && context.players[healerID]) {
        healerName = context.players[healerID].name || healerName;
      }
      
      // Determine if this is an "other" target (non-player, non-pet)
      const isOtherTarget = effectiveHeal === 0 && overheal === healAmount && !isPlayerOrFriendlyPet(targetID);
      
      // For "other" targets, use a fixed ID so they all aggregate together
      const aggregateTargetID = isOtherTarget ? "__other__" : targetID;
      
      // Get target info - format based on target type
      let targetName: string;
      let targetClass: string;
      if (isOtherTarget) {
        targetName = "Other";
        targetClass = "NPC";
      } else {
        const targetPlayerInfo = context.players[targetID];
        if (targetPlayerInfo) {
          // Player target
          targetName = targetPlayerInfo.name;
          targetClass = targetPlayerInfo.class || "UNKNOWN";
        } else {
          // Pet with owner - format as "{Owner}'s Pet {PetName}"
          const unitInfo = context.units?.[targetID];
          const ownerName = unitInfo?.owner ? (context.players[unitInfo.owner]?.name || "Unknown") : "Unknown";
          targetName = `${ownerName}'s Pet ${unitInfo?.name || "Unknown"}`;
          targetClass = unitInfo?.owner ? (context.players[unitInfo.owner]?.class || "UNKNOWN") : "UNKNOWN";
        }
      }

      // === Update HealingDone aggregation (by healer) ===
      if (!state.EncounterHealingByHealer.has(encounterID)) {
        state.EncounterHealingByHealer.set(encounterID, new Map());
      }
      const encounterByHealer = state.EncounterHealingByHealer.get(encounterID)!;
      
      let healerData = encounterByHealer.get(healerID);
      if (!healerData) {
        healerData = {
          playerID: healerID,
          playerName: healerName,
          className: healerClass,
          specialization: "",
          target: new Map(),
          effectiveTotal: 0,
          overhealTotal: 0,
        };
        encounterByHealer.set(healerID, healerData);
      }
      
      // Track healing by target
      let targetData = healerData.target.get(aggregateTargetID);
      if (!targetData) {
        targetData = { effective: 0, overheal: 0, total: 0 };
        healerData.target.set(aggregateTargetID, targetData);
      }
      targetData.effective += effectiveHeal;
      targetData.overheal += overheal;
      targetData.total += healAmount;
      
      healerData.effectiveTotal += effectiveHeal;
      healerData.overhealTotal += overheal;

      // === Update HealingTaken aggregation (by target) ===
      if (!state.EncounterHealingByTarget.has(encounterID)) {
        state.EncounterHealingByTarget.set(encounterID, new Map());
      }
      const encounterByTarget = state.EncounterHealingByTarget.get(encounterID)!;
      
      let receiverData = encounterByTarget.get(aggregateTargetID);
      if (!receiverData) {
        receiverData = {
          playerID: aggregateTargetID,
          playerName: targetName,
          className: targetClass,
          specialization: "",
          source: new Map(),
          effectiveTotal: 0,
          overhealTotal: 0,
        };
        encounterByTarget.set(aggregateTargetID, receiverData);
      }
      
      // Track healing by source
      let sourceData = receiverData.source.get(healerID);
      if (!sourceData) {
        sourceData = { effective: 0, overheal: 0, total: 0 };
        receiverData.source.set(healerID, sourceData);
      }
      sourceData.effective += effectiveHeal;
      sourceData.overheal += overheal;
      sourceData.total += healAmount;
      
      receiverData.effectiveTotal += effectiveHeal;
      receiverData.overhealTotal += overheal;

      // === Breakouts (only for selected encounters) ===
      if (!context.selectedEncounterIds.has(encounterID)) return;
      
      // Determine ability name
      let abilityName = event.sourceName || "???";
      const hitType = isResourceChangeEvent(event, streamType) ? HitTypePeriodic : (event as HealProcessorEvent).hitType;
      if (hasHitType(hitType, HitTypePeriodic)) {
        abilityName = abilityName + " (HoT)";
      }

      // When pet healing is merged into the owner row, label abilities as "<PetName> (Pet)"
      const casterHasOwner = !!context.units?.[event.caster]?.owner;
      if (casterHasOwner && grouping === "merged") {
        const petName = context.units?.[event.caster]?.name || event.caster.toString();
        abilityName = `${petName} (Pet)`;
      }

      // --- Healer breakouts (ability + target breakdown) ---
      // Healer ability breakdown
      if (effectiveHeal > 0) {
        accumulateAbilityBreakout(state.HealerByAbility, healerID, abilityName, effectiveHeal, hitType);
      }
      if (overheal > 0) {
        accumulateAbilityBreakout(state.HealerByAbilityOverheal, healerID, abilityName, overheal, hitType);
      }
      // Always track total (effective + overheal) - counts each event exactly once
      accumulateAbilityBreakout(state.HealerByAbilityTotal, healerID, abilityName, healAmount, hitType);

      // Spell ID keyed breakdown (for "Show ranks" mode)
      // Only available for actual heal events, not resource_change events
      const spellId = !isResourceChangeEvent(event, streamType) ? (event as HealProcessorEvent).spellId : null;
      if (spellId != null) {
        if (effectiveHeal > 0) {
          accumulateAbilityBreakoutBySpellId(state.HealerByAbilityBySpellId, healerID, spellId, abilityName, effectiveHeal, hitType);
        }
        if (overheal > 0) {
          accumulateAbilityBreakoutBySpellId(state.HealerByAbilityOverhealBySpellId, healerID, spellId, abilityName, overheal, hitType);
        }
        accumulateAbilityBreakoutBySpellId(state.HealerByAbilityTotalBySpellId, healerID, spellId, abilityName, healAmount, hitType);
      }

      // Healer target breakdown
      const healerTargets = state.HealerByTarget.get(healerID) || new Map();
      healerTargets.set(aggregateTargetID, (healerTargets.get(aggregateTargetID) || 0) + effectiveHeal);
      state.HealerByTarget.set(healerID, healerTargets);
      
      const healerTargetsOverheal = state.HealerByTargetOverheal.get(healerID) || new Map();
      healerTargetsOverheal.set(aggregateTargetID, (healerTargetsOverheal.get(aggregateTargetID) || 0) + overheal);
      state.HealerByTargetOverheal.set(healerID, healerTargetsOverheal);
      
      // Total target breakdown
      const healerTargetsTotal = state.HealerByTargetTotal.get(healerID) || new Map();
      healerTargetsTotal.set(aggregateTargetID, (healerTargetsTotal.get(aggregateTargetID) || 0) + healAmount);
      state.HealerByTargetTotal.set(healerID, healerTargetsTotal);

      // --- Target breakouts (ability + source breakdown) ---
      // Target ability breakdown
      if (effectiveHeal > 0) {
        accumulateAbilityBreakout(state.TargetByAbility, aggregateTargetID, abilityName, effectiveHeal, hitType);
      }
      if (overheal > 0) {
        accumulateAbilityBreakout(state.TargetByAbilityOverheal, aggregateTargetID, abilityName, overheal, hitType);
      }
      // Always track total (effective + overheal) - counts each event exactly once
      accumulateAbilityBreakout(state.TargetByAbilityTotal, aggregateTargetID, abilityName, healAmount, hitType);

      // Target source breakdown
      const targetSources = state.TargetBySource.get(aggregateTargetID) || new Map();
      targetSources.set(healerID, (targetSources.get(healerID) || 0) + effectiveHeal);
      state.TargetBySource.set(aggregateTargetID, targetSources);
      
      const targetSourcesOverheal = state.TargetBySourceOverheal.get(aggregateTargetID) || new Map();
      targetSourcesOverheal.set(healerID, (targetSourcesOverheal.get(healerID) || 0) + overheal);
      state.TargetBySourceOverheal.set(aggregateTargetID, targetSourcesOverheal);
      
      // Total source breakdown
      const targetSourcesTotal = state.TargetBySourceTotal.get(aggregateTargetID) || new Map();
      targetSourcesTotal.set(healerID, (targetSourcesTotal.get(healerID) || 0) + healAmount);
      state.TargetBySourceTotal.set(aggregateTargetID, targetSourcesTotal);
    },
  };
}

// Pre-created processor for registry
export const unifiedHealingProcessor = createUnifiedHealingProcessor();
