/**
 * Absorbed Damage processor - tracks damage absorbed per player (pure TS, worker-safe)
 *
 * Uses tailers on damage events: each tailer with HitTypePartialAbsorb or
 * HitTypeFullAbsorb flags contains the absorbed amount.
 */

import type { AbsorbedProcessorEvent, DamageProcessorEvent, PanelProcessor, ProcessorContext } from "../processorTypes";
import { isPlayerGuidFast } from "../processors/guidCache";
import { resolveEntity, extractGroupingFromPanelOption, extractPetModeFromPanelOption } from "../processors/resolveEntity";
import { absorbedDamageFromTailers } from "../processors/damageTailers";

/**
 * Per-player absorbed damage data.
 */
export interface AbsorbedDamageData {
  playerID: string;
  playerName: string;
  className: string;
  totalAbsorbed: number;
}

// encounterID -> playerID -> AbsorbedDamageData
export type UnitAbsorbed = Map<string, AbsorbedDamageData>;

export interface AbsorbAbilityAttribution {
  amount: number;
  count: number;
  spellId: number | null;
}

export interface AbsorbAttributionData {
  byAbility: Map<string, AbsorbAbilityAttribution>;
  bySource: Map<string, number>;
}

// encounterID -> playerID -> attribution data
export type UnitAbsorbAttribution = Map<string, AbsorbAttributionData>;

export type AbsorbedDamageResult = {
  EncounterAbsorbed: Map<string, UnitAbsorbed>;
  EncounterAttribution: Map<string, UnitAbsorbAttribution>;
};

/**
 * Create the absorbed damage processor.
 */
export function createAbsorbedDamageProcessor(): PanelProcessor<AbsorbedDamageResult, DamageProcessorEvent | AbsorbedProcessorEvent> {
  return {
    id: "absorbed_damage",
    streams: ["damage", "absorbed"],

    createState: () => ({
      EncounterAbsorbed: new Map<string, UnitAbsorbed>(),
      EncounterAttribution: new Map<string, UnitAbsorbAttribution>(),
    }),

    processEvent: (
      state: AbsorbedDamageResult,
      event: DamageProcessorEvent | AbsorbedProcessorEvent,
      encounterID: string,
      _: Date,
      streamType: string,
      context: ProcessorContext,
    ) => {
      const targetID = event.target;
      if (!targetID || !isPlayerGuidFast(targetID)) return;

      const grouping = extractGroupingFromPanelOption(context.panelOption);
      const pets = extractPetModeFromPanelOption(context.panelOption);
      const entity = resolveEntity(targetID, context, grouping, pets);

      if (streamType === "absorbed") {
        const absorbedEvent = event as AbsorbedProcessorEvent;
        if (absorbedEvent.amount <= 0) return;

        let encounterAttribution = state.EncounterAttribution.get(encounterID);
        if (!encounterAttribution) {
          encounterAttribution = new Map<string, AbsorbAttributionData>();
          state.EncounterAttribution.set(encounterID, encounterAttribution);
        }

        let attribution = encounterAttribution.get(entity.id);
        if (!attribution) {
          attribution = { byAbility: new Map(), bySource: new Map() };
          encounterAttribution.set(entity.id, attribution);
        }

        const abilityName = absorbedEvent.absorbSpellName || "Unknown";
        const ability = attribution.byAbility.get(abilityName) || {
          amount: 0,
          count: 0,
          spellId: absorbedEvent.absorbSpellId,
        };
        ability.amount += absorbedEvent.amount;
        ability.count += 1;
        if (ability.spellId == null) ability.spellId = absorbedEvent.absorbSpellId;
        attribution.byAbility.set(abilityName, ability);

        const sourceID = absorbedEvent.caster || "__unknown__";
        attribution.bySource.set(sourceID, (attribution.bySource.get(sourceID) || 0) + absorbedEvent.amount);
        return;
      }

      const absorbed = absorbedDamageFromTailers(event as DamageProcessorEvent);
      if (absorbed === 0) return;

      // Initialize encounter map if needed
      if (!state.EncounterAbsorbed.has(encounterID)) {
        state.EncounterAbsorbed.set(encounterID, new Map<string, AbsorbedDamageData>());
      }

      const encounterData = state.EncounterAbsorbed.get(encounterID)!;
      const existing = encounterData.get(entity.id) || {
        playerID: entity.id,
        playerName: entity.name,
        className: entity.class,
        totalAbsorbed: 0,
      };

      existing.totalAbsorbed += absorbed;
      encounterData.set(entity.id, existing);
    },
  };
}

// Pre-created processor for registry
export const absorbedDamageProcessor = createAbsorbedDamageProcessor();
