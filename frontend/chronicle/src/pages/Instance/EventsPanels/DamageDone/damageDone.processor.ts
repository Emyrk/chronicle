/**
 * Damage Done processor - aggregates damage by caster (pure TS, worker-safe)
 */

import type { AuraProcessorEvent, DamageProcessorEvent, PanelProcessor, ProcessorContext, SlainProcessorEvent } from "../processorTypes";
import { hasHitType, HitTypePeriodic } from "@/lib/hittype/hittype";
import { accumulateAbilityBreakout, accumulateAbilityBreakoutBySpellId, type DamageAbilityBreakout, type SpellIdAbilityBreakout } from "../processors/abilityBreakout";
import { createGuidCache, getCachedGuid, isPlayerGuidFast, type GuidCache } from "../processors/guidCache";
import { applyAuraEvent, createAuraProcessorState, hasAura, type AuraProcessorState } from "../processors/auraProcessor";
import { resolveSelectedVulnerability } from "../VulnerabilityEffect/vulnerabilityConfig";

// Re-export the shared type for backwards compatibility
export type { DamageAbilityBreakout, HitTypeStats } from "../processors/abilityBreakout";

/**
 * Entity source types for damage aggregation
 */
export type DamageSourceType = "players" | "enemies" | "pets" | "friendly_fire";
export type EnemyDamageGrouping = "guid" | "name";

/**
 * Player metric data for damage done aggregation.
 * Serializable - no functions or circular refs.
 */
export interface DamageDoneData {
  playerID: string;
  playerName: string;
  className: string;
  specialization: string;
  target: Map<string, number>; // target guid -> damage done
}

// UnitDamage is unit guid -> DamageDoneData
export type UnitDamage = Map<string, DamageDoneData>;

export type EncounterUnitTargetValue = Map<string, Map<string, number>>;

export type DamageDoneResult = {
  EncounterDamage: Map<string, UnitDamage>;
  // Value is unitID -> abilityID -> DamageAbilityBreakout
  ByAbility: Map<string, Map<string, DamageAbilityBreakout>>;
  // Value is unitID -> spellId -> SpellIdAbilityBreakout (for "Show ranks" mode)
  ByAbilityBySpellId: Map<string, Map<number, SpellIdAbilityBreakout>>;
  ByTarget: Map<string, Map<string, number>>;

  // Vulnerability effect tracking
  EncounterVulnerabilityBonus: Map<string, EncounterUnitTargetValue>;
  EncounterVulnerabilityBase: Map<string, EncounterUnitTargetValue>;
  VulnerabilityByAbilityBonus: Map<string, Map<string, DamageAbilityBreakout>>;
  VulnerabilityByAbilityBase: Map<string, Map<string, DamageAbilityBreakout>>;
  VulnerabilityByAbilityBySpellIdBonus: Map<string, Map<number, SpellIdAbilityBreakout>>;
  VulnerabilityByAbilityBySpellIdBase: Map<string, Map<number, SpellIdAbilityBreakout>>;
  VulnerabilityByTargetBonus: Map<string, Map<string, number>>;
  VulnerabilityByTargetBase: Map<string, Map<string, number>>;

  // GUID cache for performance (avoids repeated parsing)
  GuidCache: GuidCache;
  // Aura state used for inline aura-aware decisions
  AuraState: AuraProcessorState;
  // Internal metric for tests/debugging - does not affect displayed aggregation
  _damageEventsWithSunderArmor: number;
}

interface DamageDoneProcessorOptions {
  id?: string;
  vulnerabilityMode?: boolean;
}

function accumulateEncounterTargetValue(
  store: Map<string, EncounterUnitTargetValue>,
  encounterID: string,
  ownerID: string,
  targetID: string,
  amount: number,
): void {
  const encounterMap = store.get(encounterID) ?? new Map<string, Map<string, number>>();
  const ownerMap = encounterMap.get(ownerID) ?? new Map<string, number>();
  ownerMap.set(targetID, (ownerMap.get(targetID) || 0) + amount);
  encounterMap.set(ownerID, ownerMap);
  store.set(encounterID, encounterMap);
}

function accumulateOwnerTargetValue(
  store: Map<string, Map<string, number>>,
  ownerID: string,
  targetID: string,
  amount: number,
): void {
  const ownerMap = store.get(ownerID) ?? new Map<string, number>();
  ownerMap.set(targetID, (ownerMap.get(targetID) || 0) + amount);
  store.set(ownerID, ownerMap);
}

function normalizeDamageSchoolToBitmask(school: number): number {
  // Damage stream currently uses chronicleproto.School enum values:
  // Unknown=0, None=1, Physical=2, Holy=3, Fire=4, Nature=5, Frost=6, Shadow=7, Arcane=8.
  // Convert to WoW school bitmask values used by VulnerabilitySpells.
  switch (school) {
    case 0: // Unknown
    case 1: // None
      return 0;
    case 2: // Physical
      return 0x01;
    case 3: // Holy
      return 0x02;
    case 4: // Fire
      return 0x04;
    case 5: // Nature
      return 0x08;
    case 6: // Frost
      return 0x10;
    case 7: // Shadow
      return 0x20;
    case 8: // Arcane
      return 0x40;
    default:
      // Fallback for unexpected values (or future bitmask-style data)
      return school;
  }
}

function getActiveVulnerabilityMultiplier(
  auraState: AuraProcessorState,
  encounterID: string,
  targetID: string,
  auraSpellIds: number[],
  multiplierBySpellId: Record<number, number>,
): number | null {
  let bestMultiplier: number | null = null;

  for (const auraSpellId of auraSpellIds) {
    if (!hasAura(auraState, encounterID, targetID, { spellId: auraSpellId })) {
      continue;
    }

    const multiplier = multiplierBySpellId[auraSpellId];
    if (multiplier == null || multiplier <= 0) continue;

    if (bestMultiplier == null || multiplier > bestMultiplier) {
      bestMultiplier = multiplier;
    }
  }

  return bestMultiplier;
}

function getActiveVulnerabilityFlatAffect(
  auraState: AuraProcessorState,
  encounterID: string,
  targetID: string,
  auraSpellIds: number[],
  flatAffectBySpellId: Record<number, number>,
): number | null {
  let bestFlatAffect: number | null = null;

  for (const auraSpellId of auraSpellIds) {
    if (!hasAura(auraState, encounterID, targetID, { spellId: auraSpellId })) {
      continue;
    }

    const flatAffect = flatAffectBySpellId[auraSpellId];
    if (flatAffect == null) continue;

    if (bestFlatAffect == null || Math.abs(flatAffect) > Math.abs(bestFlatAffect)) {
      bestFlatAffect = flatAffect;
    }
  }

  return bestFlatAffect;
}

/**
 * Create a damage done processor for a specific entity source type.
 */
export function createDamageDoneProcessor(
  sourceType: DamageSourceType,
  options: DamageDoneProcessorOptions = {},
): PanelProcessor<DamageDoneResult, DamageProcessorEvent | AuraProcessorEvent | SlainProcessorEvent> {
  const id = options.id ?? (sourceType === "players" ? "damage_done" : `damage_done_${sourceType}`);
  const vulnerabilityMode = options.vulnerabilityMode ?? false;

  return {
    id,
    streams: vulnerabilityMode ? ["damage", "aura", "slain"] : ["damage"],

    createState: () => ({
      EncounterDamage: new Map<string, UnitDamage>(),
      ByAbility: new Map<string, Map<string, DamageAbilityBreakout>>(),
      ByAbilityBySpellId: new Map<string, Map<number, SpellIdAbilityBreakout>>(),
      ByTarget: new Map<string, Map<string, number>>(),
      EncounterVulnerabilityBonus: new Map<string, EncounterUnitTargetValue>(),
      EncounterVulnerabilityBase: new Map<string, EncounterUnitTargetValue>(),
      VulnerabilityByAbilityBonus: new Map<string, Map<string, DamageAbilityBreakout>>(),
      VulnerabilityByAbilityBase: new Map<string, Map<string, DamageAbilityBreakout>>(),
      VulnerabilityByAbilityBySpellIdBonus: new Map<string, Map<number, SpellIdAbilityBreakout>>(),
      VulnerabilityByAbilityBySpellIdBase: new Map<string, Map<number, SpellIdAbilityBreakout>>(),
      VulnerabilityByTargetBonus: new Map<string, Map<string, number>>(),
      VulnerabilityByTargetBase: new Map<string, Map<string, number>>(),
      GuidCache: createGuidCache(),
      AuraState: createAuraProcessorState(),
      _damageEventsWithSunderArmor: 0,
    }),

    processEvent: (
      state: DamageDoneResult,
      event: DamageProcessorEvent | AuraProcessorEvent | SlainProcessorEvent,
      encounterID: string,
      _: Date,
      _streamType: string,
      context: ProcessorContext,
    ) => {
      const selectedVulnerability = vulnerabilityMode
        ? resolveSelectedVulnerability(context.panelOption)
        : null;

      // Keep aura bookkeeping disabled unless vulnerability tracking is explicitly selected.
      if (selectedVulnerability) {
        applyAuraEvent(state.AuraState, encounterID, event);
      }

      // Only damage events reach here
      if (event.type !== "damage") return;
      if (!event.caster) return;

      // Example of inline aura-aware logic hook (behavior unchanged for displayed metrics)
      // if (hasAura(state.AuraState, encounterID, event.target, { spellName: "Sunder Armor" })) {
      //   state._damageEventsWithSunderArmor++;
      // }

      const guidCache = state.GuidCache;

      // Use fast player check first, fall back to cached GUID parsing
      const isPlayer = isPlayerGuidFast(event.caster) || getCachedGuid(guidCache, event.caster).isPlayer();
      const casterInfo = context.units?.[event.caster];
      // For pet check: owner must exist and be a player
      const isPet = !isPlayer && casterInfo?.owner &&
        (isPlayerGuidFast(casterInfo.owner) || getCachedGuid(guidCache, casterInfo.owner).isPlayer());
      // Source type and friendly-fire filtering is handled by fixedFilters
      // (see DamageDone.tsx). isPlayer/isPet/casterInfo are still used for
      // damage attribution / grouping logic below.

      const petGrouping = sourceType === "pets"
        ? (context.panelOption === "pet" || context.panelOption === "pet_name"
            ? context.panelOption
            : "owner")
        : "owner";
      const groupPetsSeparately = petGrouping === "pet";
      const groupPetsByName = petGrouping === "pet_name";

      const enemyPanelContext = sourceType === "enemies"
        ? (context.panelContext as { enemyGrouping?: EnemyDamageGrouping } | null)
        : null;
      const enemyGrouping = enemyPanelContext?.enemyGrouping ?? "guid";

      // Determine the entity to attribute damage to
      let damageOwner = event.caster;
      if ((sourceType === "players" || sourceType === "friendly_fire") && isPet) {
        damageOwner = casterInfo!.owner!;
      } else if (sourceType === "pets" && isPet && !groupPetsSeparately && !groupPetsByName) {
        damageOwner = casterInfo!.owner!;
      } else if (sourceType === "pets" && isPet && groupPetsByName) {
        const petName = (casterInfo?.name || event.caster).toLowerCase();
        const ownerKey = casterInfo?.owner || "unknown_owner";
        damageOwner = `pet_name:${petName}:${ownerKey}`;
      } else if (sourceType === "enemies" && enemyGrouping === "name") {
        const enemyName = casterInfo?.name?.trim();
        if (enemyName) {
          damageOwner = `enemy_name:${enemyName.toLowerCase()}`;
        }
      }

      // By default, use the raw GUID as name
      let ownerName = damageOwner;
      let ownerClass = "UNKNOWN";

      if (sourceType === "players" || sourceType === "friendly_fire") {
        ownerName = context.players[damageOwner]?.name || ownerName;
        ownerClass = context.players[damageOwner]?.class || "UNKNOWN";
      } else if (sourceType === "pets") {
        if (groupPetsSeparately) {
          const petName = casterInfo?.name || ownerName;
          const ownerDisplayName =
            (casterInfo?.owner && context.players[casterInfo.owner]?.name) ||
            casterInfo?.owner ||
            "Unknown Owner";
          ownerName = `${petName} (${ownerDisplayName})`;
          ownerClass = (casterInfo?.owner && context.players[casterInfo.owner]?.class) || "UNKNOWN";
        } else if (groupPetsByName) {
          const petName = casterInfo?.name || ownerName;
          const ownerDisplayName =
            (casterInfo?.owner && context.players[casterInfo.owner]?.name) ||
            casterInfo?.owner ||
            "Unknown Owner";
          ownerName = `${petName} (${ownerDisplayName})`;
          ownerClass = (casterInfo?.owner && context.players[casterInfo.owner]?.class) || "UNKNOWN";
        } else {
          // Default pet mode groups damage by owner
          ownerName = (casterInfo?.owner && context.players[casterInfo.owner]?.name) || ownerName;
          ownerName += "'s Companions";
          ownerClass = context.players[casterInfo!.owner!]?.class || "UNKNOWN";
        }
      } else {
        // For enemies, use the unit's name
        ownerName = casterInfo?.name || ownerName;
        ownerClass = "ENEMY";
      }

      // Vulnerability decomposition (bonus + base). Defaults to no bonus.
      let baseAmount = event.amount;
      let bonusAmount = 0;
      let schoolMatchesSelectedVulnerability = true;

      if (selectedVulnerability) {
        const schoolBitmask = normalizeDamageSchoolToBitmask(event.school);
        schoolMatchesSelectedVulnerability = (schoolBitmask & selectedVulnerability.schoolBitmask) !== 0;

        if (schoolMatchesSelectedVulnerability) {
          const activeMultiplier = getActiveVulnerabilityMultiplier(
            state.AuraState,
            encounterID,
            event.target,
            selectedVulnerability.auraSpellIds,
            selectedVulnerability.multiplierBySpellId,
          );
          const activeFlatAffect = getActiveVulnerabilityFlatAffect(
            state.AuraState,
            encounterID,
            event.target,
            selectedVulnerability.auraSpellIds,
            selectedVulnerability.flatAffectBySpellId,
          );

          if (activeMultiplier != null || activeFlatAffect != null) {
            let adjustedAmount = event.amount;

            // Flat modifiers are represented as a per-hit amount in logs.
            if (activeFlatAffect != null) {
              adjustedAmount = Math.max(0, adjustedAmount - activeFlatAffect);
            }

            if (activeMultiplier != null) {
              adjustedAmount = adjustedAmount / activeMultiplier;
            }

            baseAmount = adjustedAmount;
            bonusAmount = event.amount - baseAmount;
          }
        }
      }

      const schoolMaskOnly = vulnerabilityMode &&
        (context.panelContext as { schoolMask?: boolean } | null)?.schoolMask === true;
      const includeInVulnerabilityTotals =
        !schoolMaskOnly || selectedVulnerability == null || schoolMatchesSelectedVulnerability;

      if (!state.EncounterDamage.has(encounterID)) {
        state.EncounterDamage.set(encounterID, new Map<string, DamageDoneData>());
      }
      const encounterDamage = state.EncounterDamage.get(encounterID)!;
      const existing = encounterDamage.get(damageOwner) || {
        playerID: damageOwner,
        value: 0,
        playerName: ownerName,
        className: ownerClass,
        specialization: "",
        target: new Map<string, number>(),
      } as DamageDoneData;

      // Cached static info
      existing.target.set(event.target, (existing.target.get(event.target) || 0) + event.amount);
      encounterDamage.set(damageOwner, existing);
      state.EncounterDamage.set(encounterID, encounterDamage);

      // Vulnerability encounter totals (used by Vulnerability Effect panel)
      if (includeInVulnerabilityTotals) {
        accumulateEncounterTargetValue(state.EncounterVulnerabilityBonus, encounterID, damageOwner, event.target, bonusAmount);
        accumulateEncounterTargetValue(state.EncounterVulnerabilityBase, encounterID, damageOwner, event.target, baseAmount);
      }

      // Breakouts (target entity filtering now handled by defaultFilters)
      if (context.selectedEncounterIds.has(encounterID)) {
        let abilityName = event.sourceName || "Auto Attack";
        if ((sourceType === "players" || sourceType === "friendly_fire") && isPet) {
          const petName = context.units?.[event.caster]?.name || event.caster.toString();
          abilityName = `${petName} (Pet)`;
        }
        if (hasHitType(event.hitType, HitTypePeriodic)) {
          abilityName = abilityName + " (DoT)";
        }

        accumulateAbilityBreakout(state.ByAbility, damageOwner, abilityName, event.amount, event.hitType);
        // Only track by spell ID if we have one (not for melee/environmental damage)
        if (event.spellId != null) {
          accumulateAbilityBreakoutBySpellId(state.ByAbilityBySpellId, damageOwner, event.spellId, abilityName, event.amount, event.hitType);
        }

        accumulateOwnerTargetValue(state.ByTarget, damageOwner, event.target, event.amount);

        // Vulnerability breakouts
        if (includeInVulnerabilityTotals) {
          accumulateAbilityBreakout(state.VulnerabilityByAbilityBonus, damageOwner, abilityName, bonusAmount, event.hitType);
          accumulateAbilityBreakout(state.VulnerabilityByAbilityBase, damageOwner, abilityName, baseAmount, event.hitType);

          if (event.spellId != null) {
            accumulateAbilityBreakoutBySpellId(
              state.VulnerabilityByAbilityBySpellIdBonus,
              damageOwner,
              event.spellId,
              abilityName,
              bonusAmount,
              event.hitType,
            );
            accumulateAbilityBreakoutBySpellId(
              state.VulnerabilityByAbilityBySpellIdBase,
              damageOwner,
              event.spellId,
              abilityName,
              baseAmount,
              event.hitType,
            );
          }

          accumulateOwnerTargetValue(state.VulnerabilityByTargetBonus, damageOwner, event.target, bonusAmount);
          accumulateOwnerTargetValue(state.VulnerabilityByTargetBase, damageOwner, event.target, baseAmount);
        }
      }
    },
  };
}

// Pre-created processors for registry
export const damageDoneProcessor = createDamageDoneProcessor("players");
export const vulnerabilityEffectProcessor = createDamageDoneProcessor("players", {
  id: "vulnerability_effect",
  vulnerabilityMode: true,
});
export const enemyDamageDoneProcessor = createDamageDoneProcessor("enemies");
export const petDamageDoneProcessor = createDamageDoneProcessor("pets");
export const friendlyFireProcessor = createDamageDoneProcessor("friendly_fire");
