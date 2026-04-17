/**
 * Absorbed Damage processor - tracks damage absorbed per player (pure TS, worker-safe)
 *
 * Uses tailers on damage events: each tailer with HitTypePartialAbsorb or
 * HitTypeFullAbsorb flags contains the absorbed amount.
 */

import type { DamageProcessorEvent, PanelProcessor, ProcessorContext } from "../processorTypes";
import { isPlayerGuidFast } from "../processors/guidCache";
import { resolveEntity, extractGroupingFromPanelOption, extractPetModeFromPanelOption } from "../processors/resolveEntity";
import { hasHitType, HitTypePartialAbsorb, HitTypeFullAbsorb } from "@/lib/hittype/hittype";

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

export type AbsorbedDamageResult = {
  EncounterAbsorbed: Map<string, UnitAbsorbed>;
};

/**
 * Create the absorbed damage processor.
 */
export function createAbsorbedDamageProcessor(): PanelProcessor<AbsorbedDamageResult, DamageProcessorEvent> {
  return {
    id: "absorbed_damage",
    streams: ["damage"],

    createState: () => ({
      EncounterAbsorbed: new Map<string, UnitAbsorbed>(),
    }),

    processEvent: (
      state: AbsorbedDamageResult,
      event: DamageProcessorEvent,
      encounterID: string,
      _: Date,
      _streamType: string,
      context: ProcessorContext,
    ) => {
      const targetID = event.target;
      if (!targetID) return;
      if (!isPlayerGuidFast(targetID)) return;

      // Sum absorbed amounts from tailers
      let absorbed = 0;
      for (let i = 0; i < event.tailerCount; i++) {
        const t = event.tailers[i];
        if (hasHitType(t.hitType, HitTypePartialAbsorb) || hasHitType(t.hitType, HitTypeFullAbsorb)) {
          absorbed += t.amount;
        }
      }
      if (absorbed === 0) return;

      const grouping = extractGroupingFromPanelOption(context.panelOption);
      const pets = extractPetModeFromPanelOption(context.panelOption);
      const entity = resolveEntity(targetID, context, grouping, pets);

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
