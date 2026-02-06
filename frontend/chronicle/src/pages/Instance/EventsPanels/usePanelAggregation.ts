/**
 * Hook for aggregating events based on a PanelDefinition.
 * 
 * Supports two processing modes:
 * 1. Worker mode (default): Uses a Web Worker for full batch processing
 * 2. Sync mode: Uses main thread incremental processing with pause/resume
 * 
 * Sync mode is enabled when SyncModeContext.enabled is true, allowing
 * panels to synchronize with video playback or manual timestamp control.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useInstanceEventsContext, type StreamType, type CachedStream } from "@/hooks/instanceEvents";
import type { PanelDefinition, PanelContext } from "./types";
import type { WorkerRequest, SerializableProcessorContext } from "./processorTypes";
import { executeRequest } from "./workerPool";
import { useSyncModeContextOptional } from "../SyncModeContext";
import { processIncrementally, timestampMovedBackward, type IncrementalProcessorState } from "./mainThreadProcessor";

export interface UsePanelAggregationOptions<TResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  panel: PanelDefinition<TResult, any>;
  context: PanelContext;
  enabled?: boolean;
}

export interface UsePanelAggregationResult<TResult> {
  loading: boolean;
  processing: boolean;
  error: Error | null;
  result: TResult;
  totalEvents: number;
  processingTimeMs: number | null;
}

/**
 * Convert PanelContext to serializable ProcessorContext for the worker.
 * Arrays are used for Sets since they can't be serialized through postMessage.
 */
function toSerializableContext(ctx: PanelContext): SerializableProcessorContext {
  // Extract only the fields needed by processors
  const players: SerializableProcessorContext["players"] = {};
  if (ctx.instance.players) {
    for (const [guid, player] of Object.entries(ctx.instance.players)) {
      players[guid] = {
        name: player.name,
        class: player.class,
      };
    }
  }
  
  // Extract units (convert GUID to string if needed)
  const units: SerializableProcessorContext["units"] = {};
  if (ctx.instance.units) {
    for (const [guid, unit] of Object.entries(ctx.instance.units)) {
      units[guid] = {
        name: unit.name,
        owner: unit.owner?.toString() ?? null,
        entry: unit.entry,
      };
    }
  }
  
  return {
    players,
    units,
    selectedEncounterIds: ctx.selectedEncounterIds,
    entitySelection: {
      enemyIds: Array.from(ctx.entitySelection.enemyIds),
      playerIds: Array.from(ctx.entitySelection.playerIds),
    },
    pagination: ctx.pagination,
  };
}

// Marker used by worker to identify serialized Maps
const MAP_MARKER = "__serializedMap__";

interface SerializedMap {
  [MAP_MARKER]: true;
  entries: [unknown, unknown][];
}

function isSerializedMap(value: unknown): value is SerializedMap {
  return (
    value !== null &&
    typeof value === "object" &&
    MAP_MARKER in value &&
    (value as SerializedMap)[MAP_MARKER] === true
  );
}

/**
 * Recursively deserialize a value from worker.
 * Objects with MAP_MARKER are converted back to Maps.
 */
function deepDeserialize(value: unknown): unknown {
  // Check for serialized Map marker
  if (isSerializedMap(value)) {
    return new Map(
      value.entries.map(([k, v]) => [k, deepDeserialize(v)])
    );
  }
  
  // Recursively deserialize arrays
  if (Array.isArray(value)) {
    return value.map(deepDeserialize);
  }
  
  // Recursively deserialize object properties
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = deepDeserialize(val);
    }
    return result;
  }
  
  return value;
}

/**
 * Deserialize worker result back to the expected type.
 * Worker serializes Maps with a marker for identification.
 */
function deserializeResult<TResult>(result: unknown): TResult {
  return deepDeserialize(result) as TResult;
}

export function usePanelAggregation<TResult>(
  options: UsePanelAggregationOptions<TResult>
): UsePanelAggregationResult<TResult> {
  const { panel, context: panelContext, enabled = true } = options;
  const eventsContext = useInstanceEventsContext();
  const syncMode = useSyncModeContextOptional();
  // Extract stable function refs to avoid re-triggering effects
  const updateMetricsRef = useRef(syncMode?.updateMetrics);
  useEffect(() => {
    updateMetricsRef.current = syncMode?.updateMetrics;
  }, [syncMode?.updateMetrics]);
  
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<TResult>(() => panel.createState());
  const [totalEvents, setTotalEvents] = useState(0);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  
  const requestIdRef = useRef(0);
  const abortRef = useRef(false);
  
  // Track incremental state for sync mode (allows resume)
  const incrementalStateRef = useRef<IncrementalProcessorState<TResult> | null>(null);
  // Track previous timestamp to detect backward seeks
  const prevTimestampRef = useRef<Date | null>(null);
  
  // Track panel id in state to detect changes during render
  // This is the React-approved pattern for "adjusting state when a prop changes"
  // See: https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevPanelId, setPrevPanelId] = useState(panel.id);
  if (prevPanelId !== panel.id) {
    setPrevPanelId(panel.id);
    setResult(panel.createState());
  }
  
  // Reset incremental state when panel changes (in effect to avoid ref access during render)
  useEffect(() => {
    incrementalStateRef.current = null;
    prevTimestampRef.current = null;
  }, [panel.id]);
  
  // Create stable key for streams (panels define which streams they need)
  const streamsKey = panel.streams.slice().sort().join(",");
  
  // Create stable key for panel context to avoid re-processing on object identity changes
  const panelContextKey = useMemo(() => {
    const encounterIds = panelContext.selectedEncounterIds.slice().sort().join(",");
    const playerIds = Array.from(panelContext.entitySelection.playerIds).sort().join(",");
    const enemyIds = Array.from(panelContext.entitySelection.enemyIds).sort().join(",");
    return `${panelContext.instance.id}|${encounterIds}|${playerIds}|${enemyIds}`;
  }, [panelContext.instance.id, panelContext.selectedEncounterIds, panelContext.entitySelection.playerIds, panelContext.entitySelection.enemyIds]);
  
  // Check if we're in sync mode
  const isSyncMode = syncMode?.enabled ?? false;
  const syncTimestamp = syncMode?.currentTimestamp ?? null;
  
  // Throttle sync timestamp changes to limit processing frequency while still updating during playback
  const [throttledSyncTimestamp, setThrottledSyncTimestamp] = useState<Date | null>(null);
  // Track the last timestamp we actually processed to avoid redundant work
  const lastProcessedTimestampRef = useRef<number | null>(null);
  // Track if we're currently throttled
  const throttleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingTimestampRef = useRef<Date | null>(null);
  
  useEffect(() => {
    if (!isSyncMode || !syncTimestamp) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- throttling requires setState
      setThrottledSyncTimestamp(null);
      lastProcessedTimestampRef.current = null;
      if (throttleTimeoutRef.current) {
        clearTimeout(throttleTimeoutRef.current);
        throttleTimeoutRef.current = null;
      }
      pendingTimestampRef.current = null;
      return;
    }
    
    const newTimestampMs = syncTimestamp.getTime();
    
    // Skip if we already processed this exact timestamp
    if (lastProcessedTimestampRef.current === newTimestampMs) {
      return;
    }
    
    // If not currently throttled, update immediately and start throttle window
    if (!throttleTimeoutRef.current) {
      setThrottledSyncTimestamp(syncTimestamp);
      
      // Start throttle window - ignore updates for 100ms
      throttleTimeoutRef.current = setTimeout(() => {
        throttleTimeoutRef.current = null;
        // If there's a pending timestamp, process it
        if (pendingTimestampRef.current) {
          setThrottledSyncTimestamp(pendingTimestampRef.current);
          pendingTimestampRef.current = null;
        }
      }, 100);
    } else {
      // Currently throttled - save the latest timestamp to process when throttle ends
      pendingTimestampRef.current = syncTimestamp;
    }
  }, [isSyncMode, syncTimestamp]);
  
  // Worker-based processing (default mode)
  // Note: We intentionally use eventsContext.fetchStream (not eventsContext) to avoid
  // re-running when other properties of eventsContext change.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const processWithWorker = useCallback(async (requestId: number) => {
    setLoading(true);
    setProcessing(false);
    setError(null);
    setProcessingTimeMs(null);
    
    try {
      // Fetch all required streams (these are cached at the eventsContext level)
      const fetchedStreams = await Promise.all(
        panel.streams.map(async (type) => {
          const stream = await eventsContext.fetchStream(type);
          return { type, data: stream.data };
        })
      );
      
      // Check if request was superseded while fetching
      if (requestId !== requestIdRef.current || abortRef.current) return;
      
      setLoading(false);
      setProcessing(true);
      
      // Send work to pooled worker
      const workerRequest: WorkerRequest = {
        requestId,
        panelId: panel.id,
        context: toSerializableContext(panelContext),
        streams: fetchedStreams,
      };
      
      const response = await executeRequest(workerRequest);
      
      // Ignore stale responses
      if (requestId !== requestIdRef.current || abortRef.current) {
        return;
      }
      
      if (response.error) {
        setError(new Error(response.error));
        setProcessing(false);
        return;
      }
      
      const deserializedResult = deserializeResult<TResult>(response.result);
      setResult(deserializedResult);
      setTotalEvents(response.totalEvents);
      setProcessingTimeMs(response.processingTimeMs);
      setProcessing(false);
      
    } catch (err) {
      if (requestId !== requestIdRef.current || abortRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
      setProcessing(false);
    }
  }, [eventsContext.fetchStream, panel, panelContext]);
  
  // Main thread incremental processing (sync mode)
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const processMainThread = useCallback(async (requestId: number, stopAt: Date | null) => {
    setLoading(true);
    setProcessing(false);
    setError(null);
    
    try {
      // Fetch all required streams
      const streams = new Map<StreamType, CachedStream>();
      for (const type of panel.streams) {
        const stream = await eventsContext.fetchStream(type);
        streams.set(type, stream);
      }
      
      // Check if request was superseded while fetching
      if (requestId !== requestIdRef.current || abortRef.current) return;
      
      setLoading(false);
      setProcessing(true);
      
      // Check if timestamp moved backward - need to reprocess from start
      const movedBackward = timestampMovedBackward(stopAt, incrementalStateRef.current);
      if (movedBackward) {
        incrementalStateRef.current = null;
      }
      
      const response = await processIncrementally<TResult>({
        panelId: panel.id,
        streams,
        context: toSerializableContext(panelContext),
        stopAtTimestamp: stopAt,
        previousState: incrementalStateRef.current,
        onProgress: (_state, count) => {
          // Update metrics during processing (use ref to avoid dep issues)
          updateMetricsRef.current?.(count, 0);
        },
        yieldEveryN: 1000,
      });
      
      // Ignore stale responses
      if (requestId !== requestIdRef.current || abortRef.current) {
        return;
      }
      
      if (response.error) {
        setError(new Error(response.error));
        setProcessing(false);
        return;
      }
      
      // Store state for potential resume
      incrementalStateRef.current = {
        result: response.result,
        processedCount: response.processedCount,
        lastTimestamp: response.lastTimestamp,
        isDone: response.isDone,
      };
      prevTimestampRef.current = stopAt;
      // Track that we processed this timestamp to avoid redundant work
      lastProcessedTimestampRef.current = stopAt?.getTime() ?? null;
      
      setResult(response.result);
      setTotalEvents(response.processedCount);
      setProcessingTimeMs(response.processingTimeMs);
      setProcessing(false);
      
      // Update sync mode metrics
      updateMetricsRef.current?.(response.processedCount, response.processingTimeMs);
      
    } catch (err) {
      if (requestId !== requestIdRef.current || abortRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
      setProcessing(false);
    }
  }, [eventsContext.fetchStream, panel, panelContext]);
  
  // Main effect - runs in either mode
  useEffect(() => {
    if (!enabled) return;
    
    const requestId = ++requestIdRef.current;
    abortRef.current = false;
    
    if (isSyncMode) {
      // Sync mode: use main thread incremental processing
      // Only process if we have a timestamp set (use throttled value)
      if (throttledSyncTimestamp) {
        processMainThread(requestId, throttledSyncTimestamp);
      }
    } else {
      // Normal mode: use worker
      // Reset incremental state when leaving sync mode
      incrementalStateRef.current = null;
      prevTimestampRef.current = null;
      processWithWorker(requestId);
    }
    
    // Cleanup: mark request as stale
    return () => {
      requestIdRef.current++;
      abortRef.current = true;
    };
  }, [eventsContext.fetchStream, panel, streamsKey, enabled, panelContextKey, isSyncMode, throttledSyncTimestamp, processWithWorker, processMainThread]);
  
  return {
    loading,
    processing,
    error,
    result,
    totalEvents,
    processingTimeMs,
  };
}
