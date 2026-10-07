import type { PanelProcessor, UnitPositionProcessorEvent } from "../processorTypes";

export interface MapPositionSample {
  timestampMs: number;
  x: number;
  y: number;
  mapId: number;
  facing: number;
}

export interface MapEncounterPositions {
  encounterId: string;
  startMs: number;
  endMs: number;
  positionsByUnit: Map<string, MapPositionSample[]>;
}

export interface MapResult {
  encounters: Map<string, MapEncounterPositions>;
}

export const mapProcessor: PanelProcessor<MapResult, UnitPositionProcessorEvent> = {
  id: "map",
  streams: ["unit_position"],
  createState: () => ({ encounters: new Map() }),
  processEvent: (state, event, encounterId, firstTimestamp, _streamType, context) => {
    if (!context.selectedEncounterIds.has(encounterId)) return;

    const timestampMs = firstTimestamp.getTime() + event.offsetMilli;
    let encounter = state.encounters.get(encounterId);
    if (!encounter) {
      encounter = {
        encounterId,
        startMs: firstTimestamp.getTime(),
        endMs: timestampMs,
        positionsByUnit: new Map(),
      };
      state.encounters.set(encounterId, encounter);
    }
    encounter.endMs = Math.max(encounter.endMs, timestampMs);

    let positions = encounter.positionsByUnit.get(event.unit);
    if (!positions) {
      positions = [];
      encounter.positionsByUnit.set(event.unit, positions);
    }
    positions.push({
      timestampMs,
      x: event.x,
      y: event.y,
      mapId: event.mapId,
      facing: event.facing,
    });
  },
};
