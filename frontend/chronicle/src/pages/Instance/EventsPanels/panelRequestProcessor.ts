/**
 * Panel event-processing pipeline, shared by the web worker (panelWorker.ts)
 * and the main-thread fallback in workerPool.ts (used where module workers
 * cannot be constructed, e.g. the compiled design-system bundle).
 */

import { FastDamageCursor, FastHealCursor, FastResourceChangeCursor, FastExtraAttackCursor, FastSlainCursor, FastResurrectionCursor, FastCastCursor, FastAuraCursor, FastSpellGoCursor, FastAuraCastCursor, FastSpellStartCursor, FastSpellFailCursor, FastUnitClassificationCursor, FastDispelCursor, FastInterruptCursor, FastCombatantInfoCursor, FastAbsorbedCursor, FastConsumeCursor, type ReusableDamage, type ReusableHeal, type ReusableResourceChange, type ReusableExtraAttack, type ReusableSlain, type ReusableResurrection, type ReusableCast, type ReusableAura, type ReusableSpellGo, type ReusableAuraCast, type ReusableSpellStart, type ReusableSpellFail, type ReusableUnitClassification, type ReusableDispel, type ReusableInterrupt, type ReusableCombatantInfo, type ReusableAbsorbed, type ReusableConsume } from "@/api/protodecode/decode";
import { processorRegistry } from "./processors";
import type { WorkerRequest, WorkerResponse, PanelProcessor, ProcessorContext, SerializableProcessorContext, SelectedPhaseRange } from "./processorTypes";
import { compileFilters } from "./processors/filters";
import { UnitState } from "./processors/unitState";
import type { UnitClassificationProcessorEvent } from "./processorTypes";
import type { StreamType } from "@/hooks/instanceEvents";

/**
 * Convert serializable context to ProcessorContext with Sets for fast lookups.
 */
function deserializeContext(ctx: SerializableProcessorContext): ProcessorContext {
  return {
    players: ctx.players,
    units: ctx.units,
    vehicleControlIntervals: ctx.vehicleControlIntervals,
    selectedEncounterIds: new Set(ctx.selectedEncounterIds),
    selectedPhaseRanges: ctx.selectedPhaseRanges,
    entitySelection: {
      enemyIds: new Set(ctx.entitySelection.enemyIds),
      playerIds: new Set(ctx.entitySelection.playerIds),
    },
    pagination: ctx.pagination,
    panelOption: ctx.panelOption,
    panelContext: ctx.panelContext,
    capabilities: ctx.capabilities,
    filters: ctx.filters,
  };
}

/**
 * Check whether an event at the given offset within a specific encounter
 * passes phase range filtering.  Returns true when no phase filtering is
 * active or the event falls within a selected phase [start, end).
 */
function passesPhaseFilter(
  encounterID: string,
  offsetMs: number,
  phaseRanges: readonly SelectedPhaseRange[] | undefined,
): boolean {
  if (!phaseRanges || phaseRanges.length === 0) return true;

  let hasRangeForEncounter = false;
  for (const r of phaseRanges) {
    if (r.encounterID !== encounterID) continue;
    hasRangeForEncounter = true;
    if (offsetMs >= r.startOffsetMs && offsetMs < r.endOffsetMs) return true;
  }

  // No phase ranges for this encounter → whole encounter passes
  return !hasRangeForEncounter;
}

/**
 * Union of all reusable event types
 */
type AnyReusableEvent = ReusableDamage | ReusableHeal | ReusableResourceChange | ReusableExtraAttack | ReusableSlain | ReusableResurrection | ReusableCast | ReusableAura | ReusableSpellGo | ReusableAuraCast | ReusableSpellStart | ReusableSpellFail | ReusableUnitClassification | ReusableDispel | ReusableInterrupt | ReusableCombatantInfo | ReusableAbsorbed | ReusableConsume;

/**
 * A cursor wrapper that supports peeking at the next event without consuming it.
 */
interface PeekableCursor {
  streamType: StreamType;
  cursor: FastDamageCursor | FastHealCursor | FastResourceChangeCursor | FastExtraAttackCursor | FastSlainCursor | FastResurrectionCursor | FastCastCursor | FastAuraCursor | FastSpellGoCursor | FastAuraCastCursor | FastSpellStartCursor | FastSpellFailCursor | FastUnitClassificationCursor | FastDispelCursor | FastInterruptCursor | FastCombatantInfoCursor | FastAbsorbedCursor | FastConsumeCursor;
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
    : stream.type === "ressurection"
    ? new FastResurrectionCursor(stream.data)
    : stream.type === "cast"
    ? new FastCastCursor(stream.data)
    : stream.type === "aura"
    ? new FastAuraCursor(stream.data)
    : stream.type === "spell_go"
    ? new FastSpellGoCursor(stream.data)
    : stream.type === "aura_cast"
    ? new FastAuraCastCursor(stream.data)
    : stream.type === "spell_start"
    ? new FastSpellStartCursor(stream.data)
    : stream.type === "spell_fail"
    ? new FastSpellFailCursor(stream.data)
    : stream.type === "unit_classification"
    ? new FastUnitClassificationCursor(stream.data)
    : stream.type === "dispel"
    ? new FastDispelCursor(stream.data)
    : stream.type === "interrupt"
    ? new FastInterruptCursor(stream.data)
    : stream.type === "absorbed"
    ? new FastAbsorbedCursor(stream.data)
    : stream.type === "combatant_info"
    ? new FastCombatantInfoCursor(stream.data)
    : stream.type === "consume"
    ? new FastConsumeCursor(stream.data)
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

  // Create UnitState from static unit data and attach to context.
  // It will be fed unit_classification events during the loop so that
  // resolveEntity / filters see temporal ownership at each point in time.
  const unitState = new UnitState(
    context.units ?? {},
    context.vehicleControlIntervals ?? [],
  );
  context.unitState = unitState;

  // Compile filters once before the event loop (hot-path optimization).
  // Note: filter predicates capture `context` by reference, so they will
  // see unitState updates as classification events are processed.
  const filterPredicate = compileFilters(context.filters ?? [], context);
  
  // Attach compiled filter to context for processors that manage their own filtering
  context.compiledFilter = filterPredicate;
  
  // Track which streams the processor actually declared (unit_classification
  // is always fetched but should only be forwarded to processEvent when requested).
  const processorStreamSet = new Set(processor.streams);
  
  // Create peekable cursors for all streams
  const cursors = streams.map(createCursor);
  
  // Track the base timestamp for computing globalOffsetMilli across encounters.
  // This is the firstTimestamp of the earliest encounter seen.
  let baseTimestamp: number | null = null;
  
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
    if (!currentEncounterID || !currentEncounterTimestamp) break;

    // Set base timestamp from the very first encounter
    const encounterStartMs = currentEncounterTimestamp.getTime();
    // Only use SELECTED encounters for the base timestamp so that
    // globalOffsetMilli aligns with the slider's [0, totalDurationMs] range.
    if (baseTimestamp === null && context.selectedEncounterIds.has(currentEncounterID)) {
      baseTimestamp = encounterStartMs;
    }
    const encounterBaseOffset = baseTimestamp !== null ? encounterStartMs - baseTimestamp : 0;
    
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
      
      // Stamp globalOffsetMilli before filtering so time_range filter works across encounters
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (minPeeked.event as any).globalOffsetMilli = encounterBaseOffset + minPeeked.event.offsetMilli;

      // Phase range filtering: skip events outside selected phase ranges.
      // This runs before panel filters and processEvent so all downstream
      // code only sees events within the selected time windows.
      if (!passesPhaseFilter(currentEncounterID, minPeeked.event.offsetMilli, context.selectedPhaseRanges)) {
        consumePeeked(minCursor);
        continue;
      }

      unitState.setCurrentTimestamp(
        minPeeked.firstTimestamp.getTime() + minPeeked.event.offsetMilli,
      );

      // Feed unit_classification events into UnitState so temporal ownership
      // is up-to-date before any processor or filter sees subsequent events.
      if (minCursor.streamType === "unit_classification") {
        unitState.processClassification(minPeeked.event as unknown as UnitClassificationProcessorEvent);
        // Skip forwarding to processEvent if the processor didn't request this stream
        if (!processorStreamSet.has("unit_classification")) {
          consumePeeked(minCursor);
          continue;
        }
      }

      // Process the event with the lowest index
      totalEvents++;
      if (!processor.processAllEvents && !filterPredicate(minPeeked.event)) {
        consumePeeked(minCursor);
        continue;
      }
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
      // Skip _-prefixed keys — these are transient worker-only fields (e.g.
      // compiled filter caches) that contain non-cloneable values like functions.
      if (key.startsWith("_")) continue;
      serialized[key] = serializeResult(value);
    }
    return serialized;
  }
  return result;
}

/**
 * Process one WorkerRequest to a WorkerResponse. Pure computation — no
 * postMessage; callers decide the transport (worker message or direct call).
 */
export function processWorkerRequest(request: WorkerRequest): WorkerResponse {
  const { requestId, panelId, context, streams } = request;

  const processor = processorRegistry[panelId];
  if (!processor) {
    return {
      requestId,
      result: null,
      totalEvents: 0,
      processingTimeMs: 0,
      streamProcessingTimeMs: 0,
      serializationTimeMs: 0,
      queueWaitMs: 0,
      error: `Unknown panel: ${panelId}`,
    };
  }

  try {
    const streamProcessingStart = performance.now();
    const { result, totalEvents } = processStreams(processor, streams, context);
    const streamProcessingTimeMs = performance.now() - streamProcessingStart;

    const serializationStart = performance.now();
    const serializedResult = serializeResult(result);
    const serializationTimeMs = performance.now() - serializationStart;

    const processingTimeMs = streamProcessingTimeMs + serializationTimeMs;

    return {
      requestId,
      result: serializedResult,
      totalEvents,
      processingTimeMs,
      streamProcessingTimeMs,
      serializationTimeMs,
      queueWaitMs: 0,
    };
  } catch (err) {
    return {
      requestId,
      result: null,
      totalEvents: 0,
      processingTimeMs: 0,
      streamProcessingTimeMs: 0,
      serializationTimeMs: 0,
      queueWaitMs: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
