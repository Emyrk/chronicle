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

import type { AbsorbedProcessorEvent, DamageProcessorEvent, HealProcessorEvent, PanelProcessor, ProcessorContext, ResourceChangeProcessorEvent } from "../processorTypes";
import { hasHitType, HitTypePeriodic } from "@/lib/hittype/hittype";
import { accumulateAbilityBreakout, accumulateAbilityBreakoutBySpellId, PERIODIC_SPELL_ID_OFFSET, type DamageAbilityBreakout, type SpellIdAbilityBreakout } from "./abilityBreakout";
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
  // Breakouts by spell ID (for "Show ranks" mode): targetID -> spellId -> data
  TargetByAbilityBySpellId: Map<string, Map<number, SpellIdAbilityBreakout>>;
  TargetByAbilityOverhealBySpellId: Map<string, Map<number, SpellIdAbilityBreakout>>;
  TargetByAbilityTotalBySpellId: Map<string, Map<number, SpellIdAbilityBreakout>>;
  // Breakouts: targetID -> sourceID -> amount
  TargetBySource: Map<string, Map<string, number>>;
  TargetBySourceOverheal: Map<string, Map<string, number>>;
  TargetBySourceTotal: Map<string, Map<string, number>>;
  
  // === Absorbed amounts (from heal events only) ===
  // Healer: healerID -> abilityName -> total absorbed
  HealerByAbilityAbsorbed: Map<string, Map<string, number>>;
  // Target: targetID -> abilityName -> total absorbed
  TargetByAbilityAbsorbed: Map<string, Map<string, number>>;
  // Absorbed by spell ID (for "Show ranks" mode)
  HealerByAbilityAbsorbedBySpellId: Map<string, Map<number, number>>;
  TargetByAbilityAbsorbedBySpellId: Map<string, Map<number, number>>;
  
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
export function createUnifiedHealingProcessor(): PanelProcessor<UnifiedHealingResult, DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent | AbsorbedProcessorEvent> {
  return {
    id: "healing",
    streams: ["damage", "heal", "resource_change", "absorbed"],
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
      TargetByAbilityBySpellId: new Map(),
      TargetByAbilityOverhealBySpellId: new Map(),
      TargetByAbilityTotalBySpellId: new Map(),
      // Absorbed
      HealerByAbilityAbsorbed: new Map(),
      TargetByAbilityAbsorbed: new Map(),
      HealerByAbilityAbsorbedBySpellId: new Map(),
      TargetByAbilityAbsorbedBySpellId: new Map(),
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
      event: DamageProcessorEvent | HealProcessorEvent | ResourceChangeProcessorEvent | AbsorbedProcessorEvent,
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
        const us = context.unitState;
        if (us) {
          return us.isPlayer(targetGuid) || us.isPlayerPet(targetGuid);
        }
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
          const healEvent = event as HealProcessorEvent | ResourceChangeProcessorEvent;
          if (isPlayerOrFriendlyPet(healEvent.target)) {
            const deficit = deficits.get(healEvent.target) || 0;
            const effective = Math.min(healEvent.amount, deficit);
            const over = healEvent.amount - effective;
            deficits.set(healEvent.target, Math.max(0, deficit - effective));
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
      // PHASE 2: Aggregation — event.overheal is always set by now.
      // Also handles "absorbed" events (damage prevented by absorb shields).
      // For 3.3.5a these are server-reported; for vanilla 1.12 they are
      // synthetically attributed via aura tracking heuristics (estimated=true).
      // Absorbed events pass through Phase 1 untouched because they are
      // neither damage nor heal nor resource_change.
      // ──────────────────────────────────────────────
      
      const isAbsorbed = streamType === "absorbed";

      // From here on, we're handling heal, resource_change health gains, or absorbed events
      if (!(streamType === "heal" || streamType === "resource_change" || isAbsorbed)) return;

      // Map fields: absorbed events use the same caster/target field names now.
      const healOrRcEvent = event as HealProcessorEvent | ResourceChangeProcessorEvent;
      const casterGuid = isAbsorbed ? (event as AbsorbedProcessorEvent).caster : healOrRcEvent.caster;
      const targetGuid = isAbsorbed ? (event as AbsorbedProcessorEvent).target : healOrRcEvent.target;
      if (!casterGuid) return;

      // Resolve caster via resolveEntity (handles players, pets, objects)
      const grouping = extractGroupingFromPanelOption(context.panelOption, "merged");
      const petMode = extractPetModeFromPanelOption(context.panelOption);
      const entity = resolveEntity(casterGuid, context, grouping, petMode);

      const healerID = entity.id;
      const healAmount = event.amount;
      // Absorbs are 100% effective (no overheal possible)
      const overheal = isAbsorbed ? 0
        : streamType === "heal"
          ? (event as HealProcessorEvent).overheal ?? 0
          : (event as ResourceChangeProcessorEvent).overResource ?? 0;
      const effectiveHeal = healAmount - overheal;

      // Filter check: deficit tracking above always runs, but only aggregate events that pass the filter.
      if (context.compiledFilter && !context.compiledFilter(event)) return;

      // Get healer info from resolved entity
      const healerName = entity.name;
      const healerClass = entity.class;
      
      // Determine if this is an "other" target (non-player, non-pet)
      const isOtherTarget = !isAbsorbed && effectiveHeal === 0 && overheal === healAmount && !isPlayerOrFriendlyPet(targetGuid);
      
      // Get target info via resolveEntity (respects grouping/petMode settings)
      let aggregateTargetID: string;
      let targetName: string;
      let targetClass: string;
      if (isOtherTarget) {
        aggregateTargetID = "__other__";
        targetName = "Other";
        targetClass = "NPC";
      } else {
        const targetEntity = resolveEntity(targetGuid, context, grouping, petMode);
        aggregateTargetID = targetEntity.id;
        targetName = targetEntity.name;
        targetClass = targetEntity.class;
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
      let abilityName = isAbsorbed
        ? ((event as AbsorbedProcessorEvent).absorbSpellName || "Absorb")
        : (healOrRcEvent.sourceName || "???");
      const hitType = isAbsorbed ? 0 : isResourceChangeEvent(event, streamType) ? HitTypePeriodic : (event as HealProcessorEvent).hitType;
      if (hasHitType(hitType, HitTypePeriodic)) {
        abilityName = abilityName + " (HoT)";
      }

      // When pet healing is merged into the owner row, label abilities as "<Ability> (by pet <PetName>)"
      const casterHasOwner = !!(context.unitState?.getOwner(casterGuid) ?? context.units?.[casterGuid]?.owner);
      if (casterHasOwner && grouping === "merged") {
        const petName = context.units?.[casterGuid]?.name || casterGuid.toString();
        abilityName = `${abilityName} (by pet ${petName})`;
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
      // Available for heal events and absorbed events, not resource_change
      const spellId = isAbsorbed
        ? (event as AbsorbedProcessorEvent).absorbSpellId
        : !isResourceChangeEvent(event, streamType) ? (event as HealProcessorEvent).spellId : null;
      // Use a composite key so periodic (HoT) events with the same spell ID as
      // direct heals (e.g. Regrowth) get their own breakout row.
      const isPeriodic = hasHitType(hitType, HitTypePeriodic);
      const breakoutSpellId = spellId != null && isPeriodic
        ? spellId + PERIODIC_SPELL_ID_OFFSET : spellId;
      // Skip pet abilities in merged mode — different pets share spell IDs which
      // would incorrectly merge them. Pet abilities are shown from ByAbility instead.
      const isPetMerged = casterHasOwner && grouping === "merged";
      if (breakoutSpellId != null && !isPetMerged) {
        if (effectiveHeal > 0) {
          accumulateAbilityBreakoutBySpellId(state.HealerByAbilityBySpellId, healerID, breakoutSpellId, abilityName, effectiveHeal, hitType);
        }
        if (overheal > 0) {
          accumulateAbilityBreakoutBySpellId(state.HealerByAbilityOverhealBySpellId, healerID, breakoutSpellId, abilityName, overheal, hitType);
        }
        accumulateAbilityBreakoutBySpellId(state.HealerByAbilityTotalBySpellId, healerID, breakoutSpellId, abilityName, healAmount, hitType);
      }
      // Store spellId on the ByAbility entries for pet abilities so the breakout
      // can still show spell icons when pulling pet rows from ByAbility.
      if (isPetMerged && spellId != null) {
        for (const byAbilityMap of [state.HealerByAbility, state.HealerByAbilityOverheal, state.HealerByAbilityTotal]) {
          const entry = byAbilityMap.get(healerID)?.get(abilityName);
          if (entry) entry.spellId = spellId;
        }
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

      // Target spell ID keyed breakdown (for "Show ranks" mode)
      if (breakoutSpellId != null) {
        if (effectiveHeal > 0) {
          accumulateAbilityBreakoutBySpellId(state.TargetByAbilityBySpellId, aggregateTargetID, breakoutSpellId, abilityName, effectiveHeal, hitType);
        }
        if (overheal > 0) {
          accumulateAbilityBreakoutBySpellId(state.TargetByAbilityOverhealBySpellId, aggregateTargetID, breakoutSpellId, abilityName, overheal, hitType);
        }
        accumulateAbilityBreakoutBySpellId(state.TargetByAbilityTotalBySpellId, aggregateTargetID, breakoutSpellId, abilityName, healAmount, hitType);
      }

      // Absorbed tracking: heal events' absorbed field (healing eaten by a shield on
      // the target) AND absorbed stream events (damage prevented by absorb shields).
      const absorbed = isAbsorbed ? event.amount
        : streamType === "heal" ? (event as HealProcessorEvent).absorbed ?? 0
        : 0;
      if (absorbed > 0) {
        const healerAbsorbs = state.HealerByAbilityAbsorbed.get(healerID) || new Map();
        healerAbsorbs.set(abilityName, (healerAbsorbs.get(abilityName) || 0) + absorbed);
        state.HealerByAbilityAbsorbed.set(healerID, healerAbsorbs);

        const targetAbsorbs = state.TargetByAbilityAbsorbed.get(aggregateTargetID) || new Map();
        targetAbsorbs.set(abilityName, (targetAbsorbs.get(abilityName) || 0) + absorbed);
        state.TargetByAbilityAbsorbed.set(aggregateTargetID, targetAbsorbs);

        // Spell-ID-keyed absorbed (for "Show ranks" mode)
        if (breakoutSpellId != null) {
          const healerAbsorbsBySpellId = state.HealerByAbilityAbsorbedBySpellId.get(healerID) || new Map();
          healerAbsorbsBySpellId.set(breakoutSpellId, (healerAbsorbsBySpellId.get(breakoutSpellId) || 0) + absorbed);
          state.HealerByAbilityAbsorbedBySpellId.set(healerID, healerAbsorbsBySpellId);

          const targetAbsorbsBySpellId = state.TargetByAbilityAbsorbedBySpellId.get(aggregateTargetID) || new Map();
          targetAbsorbsBySpellId.set(breakoutSpellId, (targetAbsorbsBySpellId.get(breakoutSpellId) || 0) + absorbed);
          state.TargetByAbilityAbsorbedBySpellId.set(aggregateTargetID, targetAbsorbsBySpellId);
        }
      }

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
