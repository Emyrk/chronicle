import {
  FastSpellGoCursor,
  FastSpellStartCursor,
  FastUnitPositionCursor,
  type PayloadHeader,
} from "@/api/protodecode/decode";
import type { ProcessorContext } from "../../Instance/EventsPanels/processorTypes";
import { mapProcessor, type MapProcessorEvent, type MapResult } from "../../Instance/EventsPanels/Map/map.processor";
import type { GuideEventStreamType } from "../package";
import type { GuidePackageLike } from "./types";

interface GuideStreamCursor {
  readonly currentHeader: PayloadHeader | null;
  readonly hasMoreInEncounter: boolean;
  next(): MapProcessorEvent | null;
  nextEncounter(): boolean;
}

function cursorFor(type: GuideEventStreamType, data: Uint8Array): GuideStreamCursor {
  if (type === "unit_position") return new FastUnitPositionCursor(data) as GuideStreamCursor;
  if (type === "spell_start") return new FastSpellStartCursor(data) as GuideStreamCursor;
  return new FastSpellGoCursor(data) as GuideStreamCursor;
}

function cloneEvent(event: MapProcessorEvent): MapProcessorEvent {
  if (event.type === "spell_start" || event.type === "spell_go") {
    return { ...event, spell: { ...event.spell } };
  }
  return { ...event };
}

interface QueuedEvent {
  encounterId: string;
  firstTimestamp: Date;
  event: MapProcessorEvent;
}

export interface GuideEventData {
  result: MapResult;
  encounterIds: readonly string[];
}

/** Decode package-local Chronicle protobuf streams through the production Map processor. */
export function loadGuideEventData(guide: GuidePackageLike): GuideEventData {
  const queued: QueuedEvent[] = [];
  const encounterIds: string[] = [];
  const seenEncounters = new Set<string>();

  for (const stream of guide.manifest.event_streams ?? []) {
    const cursor = cursorFor(stream.type, guide.read(stream.path));
    while (cursor.currentHeader) {
      const header = cursor.currentHeader;
      if (!seenEncounters.has(header.encounterID)) {
        seenEncounters.add(header.encounterID);
        encounterIds.push(header.encounterID);
      }
      while (cursor.hasMoreInEncounter) {
        const event = cursor.next();
        if (!event) throw new Error(`Guide event stream ${stream.path} ended before its declared event count.`);
        queued.push({ encounterId: header.encounterID, firstTimestamp: header.firstTimestamp, event: cloneEvent(event) });
      }
      cursor.nextEncounter();
    }
  }

  queued.sort((left, right) => {
    if (left.encounterId !== right.encounterId) return encounterIds.indexOf(left.encounterId) - encounterIds.indexOf(right.encounterId);
    return left.event.index - right.event.index;
  });

  const result = mapProcessor.createState();
  const context: ProcessorContext = {
    players: {},
    units: {},
    selectedEncounterIds: new Set(encounterIds),
    entitySelection: { enemyIds: new Set(), playerIds: new Set() },
  };
  for (const item of queued) {
    mapProcessor.processEvent(result, item.event, item.encounterId, item.firstTimestamp, item.event.type, context);
  }
  return { result, encounterIds: Object.freeze(encounterIds) };
}
