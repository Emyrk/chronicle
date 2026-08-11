/**
 * Damage Done processor - aggregates damage by caster (pure TS, worker-safe)
 */

import type { AuraProcessorEvent, DamageProcessorEvent, PanelProcessor, ProcessorContext, SlainProcessorEvent } from "../processorTypes";
import { hasHitType, HitTypePeriodic } from "@/lib/hittype/hittype";
import { accumulateAbilityBreakout, accumulateAbilityBreakoutBySpellId, PERIODIC_SPELL_ID_OFFSET, type DamageAbilityBreakout, type SpellIdAbilityBreakout } from "../processors/abilityBreakout";
import { createGuidCache, type GuidCache } from "../processors/guidCache";
import { extractGroupingFromPanelOption, extractPetModeFromPanelOption, resolveEntity } from "../processors/resolveEntity";
import { applyAuraEvent, createAuraProcessorState, hasAura, type AuraProcessorState } from "../processors/auraProcessor";
import { absorbedDamageFromTailers } from "../processors/damageTailers";
import type { SelectedVulnerability } from "../VulnerabilityEffect/vulnerabilityConfig";

// Re-export the shared type for backwards compatibility
export type { DamageAbilityBreakout, HitTypeStats } from "../processors/abilityBreakout";

/**
 * Entity source types for damage aggregation
 */
export type DamageSourceType = "players" | "enemies" | "pets" | "friendly_fire";

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
  // Convert to the WoW school bitmask used by vulnerability metadata.
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
      // The resolved vulnerability config is derived React-side (from the
      // dataset-aware spell lookup) and injected via panelContext, because the
      // worker cannot fetch spell data.
      const selectedVulnerability = vulnerabilityMode
        ? ((context.panelContext as { selectedVulnerability?: SelectedVulnerability } | null)?.selectedVulnerability ?? null)
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

      // Source type and friendly-fire filtering is handled by fixedFilters
      // (see DamageDone.tsx). Entity resolution is handled by resolveEntity.

      const groupingDefault = sourceType === "pets" ? "default" : "merged";
      const grouping = extractGroupingFromPanelOption(context.panelOption, groupingDefault);
      const petMode = extractPetModeFromPanelOption(context.panelOption);

      const entity = resolveEntity(event.caster, context, grouping, petMode);
      const damageOwner = entity.id;
      const ownerName = entity.name;
      const ownerClass = entity.class;

      // Damage absorbed by the target still depleted a shield, so include it in
      // effective damage while retaining the absorbed portion for breakouts.
      const rawEffectiveAmount = Math.max(0, event.amount - (event.overkill || 0));
      const absorbedAmount = absorbedDamageFromTailers(event);
      const effectiveAmount = rawEffectiveAmount + absorbedAmount;
      const fullyAbsorbed = rawEffectiveAmount === 0 && absorbedAmount > 0;

      // Vulnerability decomposition (bonus + base). Defaults to no bonus.
      let baseAmount = effectiveAmount;
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
            let adjustedAmount = effectiveAmount;

            // Flat modifiers are represented as a per-hit amount in logs.
            // DoT ticks are not "hits" and should not receive flat bonuses (e.g. Gift of Arthas).
            if (activeFlatAffect != null && !hasHitType(event.hitType, HitTypePeriodic)) {
              adjustedAmount = Math.max(0, adjustedAmount - activeFlatAffect);
            }

            if (activeMultiplier != null) {
              adjustedAmount = adjustedAmount / activeMultiplier;
            }

            baseAmount = adjustedAmount;
            bonusAmount = effectiveAmount - baseAmount;
          }
        }
      }

      const schoolMaskOnly = vulnerabilityMode &&
        (context.panelContext as { schoolMask?: boolean } | null)?.schoolMask === true;
      // When schoolMaskOnly is active, only include events that can actually be affected
      // by the selected vulnerability. Periodic (DoT) ticks are excluded for flat-only
      // vulnerabilities (e.g. Gift of Arthas) since flat bonuses don't apply to DoTs.
      const isPeriodic = hasHitType(event.hitType, HitTypePeriodic);
      const flatOnlyVulnerability = selectedVulnerability != null &&
        selectedVulnerability.percentAffect == null && selectedVulnerability.flatAffect != null;
      const includeInVulnerabilityTotals =
        !schoolMaskOnly || selectedVulnerability == null ||
        (schoolMatchesSelectedVulnerability && !(flatOnlyVulnerability && isPeriodic));

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
      existing.target.set(event.target, (existing.target.get(event.target) || 0) + effectiveAmount);
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
        // When pet damage is merged into the owner row, label abilities as "<Ability> (by pet <PetName>)"
        const casterHasOwner = !!(context.unitState?.getOwner(event.caster) ?? context.units?.[event.caster]?.owner);
        if (casterHasOwner && (grouping === "merged")) {
          const petName = context.units?.[event.caster]?.name || event.caster.toString();
          abilityName = `${abilityName} (by pet ${petName})`;
        }
        if (hasHitType(event.hitType, HitTypePeriodic)) {
          abilityName = abilityName + " (DoT)";
        }

        accumulateAbilityBreakout(
          state.ByAbility,
          damageOwner,
          abilityName,
          effectiveAmount,
          event.hitType,
          effectiveAmount,
          absorbedAmount,
          fullyAbsorbed,
        );
        // Use a composite key so periodic (DoT) events with the same spell ID as
        // direct damage (e.g. Immolate) get their own breakout row.
        const isPeriodicDmg = hasHitType(event.hitType, HitTypePeriodic);
        const breakoutSpellId = event.spellId != null && isPeriodicDmg
          ? event.spellId + PERIODIC_SPELL_ID_OFFSET : event.spellId;
        // Only track by spell ID if we have one (not for melee/environmental damage).
        // Skip pet abilities in merged mode — different pets share the same spell ID
        // (e.g. Auto Attack = 6603) which would incorrectly merge them. Pet abilities
        // are instead shown from ByAbility which keys by name (unique per pet).
        const isPetMerged = casterHasOwner && grouping === "merged";
        if (breakoutSpellId != null && !isPetMerged) {
          accumulateAbilityBreakoutBySpellId(
            state.ByAbilityBySpellId,
            damageOwner,
            breakoutSpellId,
            abilityName,
            effectiveAmount,
            event.hitType,
            effectiveAmount,
            absorbedAmount,
            fullyAbsorbed,
          );
        }
        // Store spellId on the ByAbility entry for pet abilities so the breakout
        // can still show spell icons when pulling pet rows from ByAbility.
        if (isPetMerged && event.spellId != null) {
          const unitAbilities = state.ByAbility.get(damageOwner);
          const entry = unitAbilities?.get(abilityName);
          if (entry) entry.spellId = event.spellId;
        }

        accumulateOwnerTargetValue(state.ByTarget, damageOwner, event.target, effectiveAmount);

        // Vulnerability breakouts
        if (includeInVulnerabilityTotals) {
          accumulateAbilityBreakout(state.VulnerabilityByAbilityBonus, damageOwner, abilityName, bonusAmount, event.hitType);
          accumulateAbilityBreakout(state.VulnerabilityByAbilityBase, damageOwner, abilityName, baseAmount, event.hitType);

          if (breakoutSpellId != null) {
            accumulateAbilityBreakoutBySpellId(
              state.VulnerabilityByAbilityBySpellIdBonus,
              damageOwner,
              breakoutSpellId,
              abilityName,
              bonusAmount,
              event.hitType,
            );
            accumulateAbilityBreakoutBySpellId(
              state.VulnerabilityByAbilityBySpellIdBase,
              damageOwner,
              breakoutSpellId,
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
