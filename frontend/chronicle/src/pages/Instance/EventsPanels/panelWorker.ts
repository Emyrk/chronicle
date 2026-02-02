/**
 * Web Worker for panel event processing.
 * 
 * This worker runs panel processors off the main thread to keep UI responsive.
 * It receives stream data and context, processes events, and returns results.
 */

import { FastDamageCursor, FastHealCursor, FastResourceChangeCursor, FastExtraAttackCursor, FastSlainCursor, FastCastCursor, FastAuraCursor, type ReusableDamage, type ReusableHeal, type ReusableResourceChange, type ReusableExtraAttack, type ReusableSlain, type ReusableCast, type ReusableAura } from "@/api/protodecode/decode";
import { processorRegistry } from "./processors";
import type { WorkerRequest, WorkerResponse, PanelProcessor, ProcessorContext, SerializableProcessorContext } from "./processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";

/**
 * Convert serializable context to ProcessorContext with Sets for fast lookups.
 */
function deserializeContext(ctx: SerializableProcessorContext): ProcessorContext {
  return {
    players: ctx.players,
    units: ctx.units,
    selectedEncounterIds: new Set(ctx.selectedEncounterIds),
    entitySelection: {
      enemyIds: new Set(ctx.entitySelection.enemyIds),
      playerIds: new Set(ctx.entitySelection.playerIds),
    },
    pagination: ctx.pagination,
  };
}

/**
 * Union of all reusable event types
 */
type AnyReusableEvent = ReusableDamage | ReusableHeal | ReusableResourceChange | ReusableExtraAttack | ReusableSlain | ReusableCast | ReusableAura;

/**
 * A cursor wrapper that supports peeking at the next event without consuming it.
 */
interface PeekableCursor {
  streamType: StreamType;
  cursor: FastDamageCursor | FastHealCursor | FastResourceChangeCursor | FastExtraAttackCursor | FastSlainCursor | FastCastCursor | FastAuraCursor;
  peeked: { event: AnyReusableEvent; encounterID: string; firstTimestamp: Date } | null;
}

/**
 * Peek at the next event from a cursor without consuming it.
 * Returns null if no more events.
 */
function peekCursor(pc: PeekableCursor): { event: AnyReusableEvent; encounterID: string; firstTimestamp: Date } | null {
  if (pc.peeked) return pc.peeked;
  
  // Advance to next encounter if needed
  while (pc.cursor.currentHeader && !pc.cursor.hasMoreInEncounter) {
    pc.cursor.nextEncounter();
  }
  
  if (!pc.cursor.currentHeader) return null;
  
  const event = pc.cursor.next();
  if (!event) return null;
  
  pc.peeked = { 
    event, 
    encounterID: pc.cursor.currentHeader.encounterID,
    firstTimestamp: pc.cursor.currentHeader.firstTimestamp,
  };
  return pc.peeked;
}

/**
 * Consume the peeked event (call after processing).
 */
function consumePeeked(pc: PeekableCursor): void {
  pc.peeked = null;
}

/**
 * Create a cursor for a stream.
 */
function createCursor(stream: WorkerRequest["streams"][0]): PeekableCursor {
  const cursor = stream.type === "heal" 
    ? new FastHealCursor(stream.data)
    : stream.type === "resource_change"
    ? new FastResourceChangeCursor(stream.data)
    : stream.type === "extra_attack"
    ? new FastExtraAttackCursor(stream.data)
    : stream.type === "slain"
    ? new FastSlainCursor(stream.data)
    : stream.type === "cast"
    ? new FastCastCursor(stream.data)
    : stream.type === "aura"
    ? new FastAuraCursor(stream.data)
    : new FastDamageCursor(stream.data);
  
  return {
    streamType: stream.type as StreamType,
    cursor,
    peeked: null,
  };
}

/**
 * Process all streams using the given processor.
 * 
 * IMPORTANT: Each encounter resets event indices to 0, so we must process
 * one encounter at a time. Within an encounter, events are interleaved
 * across streams by index order.
 */
function processStreams<TResult>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  processor: PanelProcessor<TResult, any>,
  streams: WorkerRequest["streams"],
  serializableContext: SerializableProcessorContext
): { result: TResult; totalEvents: number } {
  const state = processor.createState();
  let totalEvents = 0;
  
  // Convert to ProcessorContext with Sets for fast lookups
  const context = deserializeContext(serializableContext);
  
  // Create peekable cursors for all streams
  const cursors = streams.map(createCursor);
  
  // Process one encounter at a time to avoid interleaving events from different encounters
  // (since each encounter resets indices to 0)
  while (true) {
    // Find the current encounter: pick the one with earliest timestamp among all cursors
    let currentEncounterID: string | null = null;
    let currentEncounterTimestamp: Date | null = null;
    
    for (const pc of cursors) {
      const peeked = peekCursor(pc);
      if (peeked && (!currentEncounterTimestamp || peeked.firstTimestamp < currentEncounterTimestamp)) {
        currentEncounterID = peeked.encounterID;
        currentEncounterTimestamp = peeked.firstTimestamp;
      }
    }
    
    // No more events in any stream
    if (!currentEncounterID) break;
    
    // Process all events from this encounter across all streams, interleaved by index
    while (true) {
      let minCursor: PeekableCursor | null = null;
      let minPeeked: { event: AnyReusableEvent; encounterID: string; firstTimestamp: Date } | null = null;
      
      for (const pc of cursors) {
        const peeked = peekCursor(pc);
        // Only consider events from the current encounter
        if (peeked && peeked.encounterID === currentEncounterID) {
          if (!minPeeked || peeked.event.index < minPeeked.event.index) {
            minCursor = pc;
            minPeeked = peeked;
          }
        }
      }
      
      // No more events from this encounter - move to next encounter
      if (!minCursor || !minPeeked) break;
      
      // Process the event with the lowest index
      totalEvents++;
      processor.processEvent(
        state, 
        minPeeked.event, 
        minPeeked.encounterID, 
        minPeeked.firstTimestamp, 
        minCursor.streamType, 
        context
      );
      
      // Consume the peeked event
      consumePeeked(minCursor);
    }
  }
  
  return { result: state, totalEvents };
}

// Marker to identify serialized Maps during deserialization
const MAP_MARKER = "__serializedMap__";

interface SerializedMap {
  [MAP_MARKER]: true;
  entries: [unknown, unknown][];
}

/**
 * Deep serialize a value for postMessage (Maps don't serialize through postMessage).
 * Recursively converts Maps to marked objects with serialized entries.
 */
function serializeResult(result: unknown): unknown {
  if (result instanceof Map) {
    const serialized: SerializedMap = {
      [MAP_MARKER]: true,
      entries: Array.from(result.entries()).map(([k, v]) => [k, serializeResult(v)]),
    };
    return serialized;
  }
  if (Array.isArray(result)) {
    return result.map(serializeResult);
  }
  if (result !== null && typeof result === "object") {
    const serialized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(result)) {
      serialized[key] = serializeResult(value);
    }
    return serialized;
  }
  return result;
}

// Handle messages from main thread
self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { requestId, panelId, context, streams } = e.data;
  
  const processor = processorRegistry[panelId];
  if (!processor) {
    const response: WorkerResponse = {
      requestId,
      result: null,
      totalEvents: 0,
      processingTimeMs: 0,
      error: `Unknown panel: ${panelId}`,
    };
    self.postMessage(response);
    return;
  }
  
  try {
    const startTime = performance.now();
    
    const { result, totalEvents } = processStreams(processor, streams, context);
    
    const processingTimeMs = performance.now() - startTime;
    
    const response: WorkerResponse = {
      requestId,
      result: serializeResult(result),
      totalEvents,
      processingTimeMs,
    };
    
    self.postMessage(response);
    
  } catch (err) {
    const response: WorkerResponse = {
      requestId,
      result: null,
      totalEvents: 0,
      processingTimeMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
