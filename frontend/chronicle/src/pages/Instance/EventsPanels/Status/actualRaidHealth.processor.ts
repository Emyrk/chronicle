import type { PanelProcessor, UnitResourcesProcessorEvent } from "../processorTypes";

export interface ActualRaidHealthSample {
  timestampMilli: number;
  currentHealth: number;
  maximumHealth: number;
}

export interface ActualRaidHealthEncounter {
  encounterId: string;
  startMilli: number;
  endMilli: number;
  resourcesByUnit: Map<string, ActualRaidHealthSample[]>;
}

export interface ActualRaidHealthResult {
  encounters: Map<string, ActualRaidHealthEncounter>;
}

function encounterFor(
  state: ActualRaidHealthResult,
  encounterId: string,
  firstTimestamp: Date,
): ActualRaidHealthEncounter {
  let encounter = state.encounters.get(encounterId);
  if (!encounter) {
    const startMilli = firstTimestamp.getTime();
    encounter = {
      encounterId,
      startMilli,
      endMilli: startMilli,
      resourcesByUnit: new Map(),
    };
    state.encounters.set(encounterId, encounter);
  }
  return encounter;
}

export const actualRaidHealthProcessor: PanelProcessor<ActualRaidHealthResult, UnitResourcesProcessorEvent> = {
  id: "actual_raid_health",
  streams: ["unit_resources"],
  createState: () => ({ encounters: new Map() }),
  processEvent(state, event, encounterId, firstTimestamp, _streamType, context) {
    if (!context.selectedEncounterIds.has(encounterId) || !context.players[event.unit]) return;

    const encounter = encounterFor(state, encounterId, firstTimestamp);
    const timestampMilli = firstTimestamp.getTime() + event.offsetMilli;
    const sample = {
      timestampMilli,
      currentHealth: Math.max(0, event.currentHealth),
      maximumHealth: Math.max(0, event.maximumHealth),
    };
    const samples = encounter.resourcesByUnit.get(event.unit) ?? [];
    const previous = samples.at(-1);
    if (
      previous?.currentHealth !== sample.currentHealth
      || previous.maximumHealth !== sample.maximumHealth
    ) {
      samples.push(sample);
      encounter.resourcesByUnit.set(event.unit, samples);
    }
    encounter.endMilli = Math.max(encounter.endMilli, timestampMilli);
  },
};
