/**
 * Unit Lookup processor – collects unit_classification events to track
 * temporal controller/affiliation state alongside static unit data.
 */

import type { PanelProcessor, UnitClassificationProcessorEvent, ProcessorContext } from "../processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";

export interface UnitEntry {
  guid: string;
  name: string;
  entry: number;
  owner: string | null;
  controller: string | null;
  controllerSpellId: number;
  unitType: number;
  affiliation: number;
}

export interface UnitLookupResult {
  /** GUID -> latest classification info from unit_classification events */
  classifications: Map<string, UnitEntry>;
  /** Monotonic counter incremented on every processEvent call.
   *  Ensures React detects changes even though the Map ref is stable
   *  (shallowClone copies the ref, not the contents). */
  version: number;
}

export const unitLookupProcessor: PanelProcessor<UnitLookupResult, UnitClassificationProcessorEvent> = {
  id: "unit_lookup",
  streams: ["unit_classification"],

  createState: (): UnitLookupResult => ({ classifications: new Map(), version: 0 }),

  processEvent: (
    state: UnitLookupResult,
    event: UnitClassificationProcessorEvent,
    _encounterID: string,
    _firstTimestamp: Date,
    _streamType: StreamType,
    context: ProcessorContext,
  ): void => {
    const staticUnit = context.units?.[event.target];
    state.version++;
    state.classifications.set(event.target, {
      guid: event.target,
      name: staticUnit?.name ?? event.target,
      entry: staticUnit?.entry ?? 0,
      owner: context.unitState?.getOwner(event.target) ?? event.owner ?? staticUnit?.owner ?? null,
      controller: event.controller,
      controllerSpellId: event.spellId,
      unitType: event.unitType,
      affiliation: event.affiliation,
    });
  },
};
