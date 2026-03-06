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
import { usePanelTimingContext } from "./PanelTimingContext";
import type { PanelFilter } from "./processors/filters";

export interface UsePanelAggregationOptions<TResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  panel: PanelDefinition<TResult, any>;
  context: PanelContext;
  panelOption?: string | null;
  panelContext?: Record<string, unknown> | null;
  panelContextKey?: string | number | null;
  /** Optional panel slot index for diagnostics (0-based). */
  panelIndex?: number;
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
function toSerializableContext(
  ctx: PanelContext,
  panelOption: string | null,
  panelContext: Record<string, unknown> | null,
): SerializableProcessorContext {
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
    panelOption,
    panelContext,
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

interface AggregationState<TResult> {
  panelId: string;
  result: TResult;
}

export function resolveAggregationResultForPanel<TResult>(
  aggregationState: AggregationState<TResult>,
  panelId: string,
  createState: () => TResult,
): TResult {
  return aggregationState.panelId === panelId ? aggregationState.result : createState();
}

export function usePanelAggregation<TResult>(
  options: UsePanelAggregationOptions<TResult>
): UsePanelAggregationResult<TResult> {
  const {
    panel,
    context: panelContext,
    panelOption = null,
    panelContext: panelContextData = null,
    panelContextKey: panelContextKeyData = null,
    panelIndex,
    enabled = true,
  } = options;
  const eventsContext = useInstanceEventsContext();
  const syncMode = useSyncModeContextOptional();
  const timingContext = usePanelTimingContext();
  // Extract stable function ref to avoid re-triggering effects
  // Use the function directly since useState setters are stable
  const reportPanelMetrics = timingContext?.reportPanelMetrics;
  const reportPanelMetricsRef = useRef(reportPanelMetrics);
  const updateMetrics = syncMode?.updateMetrics;
  const updateMetricsRef = useRef(updateMetrics);
  useEffect(() => {
    reportPanelMetricsRef.current = reportPanelMetrics;
  }, [reportPanelMetrics]);
  useEffect(() => {
    updateMetricsRef.current = updateMetrics;
  }, [updateMetrics]);
  
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [aggregationState, setAggregationState] = useState<AggregationState<TResult>>(() => ({
    panelId: panel.id,
    result: panel.createState(),
  }));
  const [totalEvents, setTotalEvents] = useState(0);
  const [processingTimeMs, setProcessingTimeMs] = useState<number | null>(null);
  
  const requestIdRef = useRef(0);
  const abortRef = useRef(false);
  
  // Track incremental state for sync mode (allows resume)
  const incrementalStateRef = useRef<IncrementalProcessorState<TResult> | null>(null);
  // Track previous timestamp to detect backward seeks
  const prevTimestampRef = useRef<Date | null>(null);
  
  // Track panel id in state to detect changes during render.
  // Keep panel id + result in one state object so a panel switch never renders
  // with a stale result shape from the previous panel.
  if (aggregationState.panelId !== panel.id) {
    setAggregationState({ panelId: panel.id, result: panel.createState() });
  }

  const result = resolveAggregationResultForPanel(aggregationState, panel.id, panel.createState);
  
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
    return `${panelContext.instance.id}|${encounterIds}|${playerIds}|${enemyIds}|${panelOption ?? ""}|${panelContextKeyData ?? ""}`;
  }, [
    panelContext.instance.id,
    panelContext.selectedEncounterIds,
    panelContext.entitySelection.playerIds,
    panelContext.entitySelection.enemyIds,
    panelOption,
    panelContextKeyData,
  ]);
  
  // Stable merged filter array — reference equality lets mainThreadProcessor skip recompilation
  // during sync mode ticks where only the timestamp changes.
  const mergedFilters = useMemo(
    () => [
      ...(panel.fixedFilters ?? []),
      ...((panelContextData?.filters as PanelFilter[] | undefined) ?? []),
    ],
    [panel.fixedFilters, panelContextData?.filters],
  );

  // Stable serializable context — avoids rebuilding players/units objects and
  // Array.from(Sets) on every sync tick. Only changes when panelContextKey changes.
  const memoizedContext = useMemo<SerializableProcessorContext>(
    () => ({
      ...toSerializableContext(panelContext, panelOption, panelContextData),
      filters: mergedFilters,
    }),
    // panelContextKey is a stable string derived from all context inputs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelContextKey, mergedFilters],
  );

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
      const fetchStartMs = performance.now();
      // Fetch all required streams (these are cached at the eventsContext level)
      const fetchedStreams = await Promise.all(
        panel.streams.map(async (type) => {
          const stream = await eventsContext.fetchStream(type);
          return { type, data: stream.data };
        })
      );
      const fetchTimeMs = performance.now() - fetchStartMs;

      const streamBytes = Object.fromEntries(
        fetchedStreams.map(({ type, data }) => [type, data.byteLength]),
      );
      const totalStreamBytes = fetchedStreams.reduce((sum, stream) => sum + stream.data.byteLength, 0);

      // Check if request was superseded while fetching
      if (requestId !== requestIdRef.current || abortRef.current) return;

      setLoading(false);
      setProcessing(true);

      // Send work to pooled worker
      const workerRequest: WorkerRequest = {
        requestId,
        panelId: panel.id,
        context: {
          ...toSerializableContext(panelContext, panelOption, panelContextData),
          filters: mergedFilters,
        },
        streams: fetchedStreams,
      };

      const workerStartMs = performance.now();
      const response = await executeRequest(workerRequest);
      const workerRoundTripMs = performance.now() - workerStartMs;

      // Ignore stale responses
      if (requestId !== requestIdRef.current || abortRef.current) {
        return;
      }

      if (response.error) {
        setError(new Error(response.error));
        setProcessing(false);
        return;
      }

      const deserializeStartMs = performance.now();
      const deserializedResult = deserializeResult<TResult>(response.result);
      const deserializationTimeMs = performance.now() - deserializeStartMs;

      const wallTimeMs = fetchTimeMs + workerRoundTripMs + deserializationTimeMs;
      const queueWaitMs = response.queueWaitMs;

      if (panelIndex !== undefined && panelIndex >= 0) {
        reportPanelMetricsRef.current?.({
          panelKey: `panel-${panelIndex}`,
          panelId: panel.id,
          panelLabel: panel.label,
          panelIndex,
          streams: panel.streams,
          streamBytes,
          totalStreamBytes,
          totalEvents: response.totalEvents,
          processingTimeMs: response.processingTimeMs,
          streamProcessingTimeMs: response.streamProcessingTimeMs,
          serializationTimeMs: response.serializationTimeMs,
          deserializationTimeMs,
          wallTimeMs,
          queueWaitMs,
          fetchTimeMs,
          updatedAtMs: performance.now(),
        });
      }

      setAggregationState((prev) =>
        prev.panelId === panel.id ? { ...prev, result: deserializedResult } : prev,
      );
      setTotalEvents(response.totalEvents);
      setProcessingTimeMs(response.processingTimeMs);
      setProcessing(false);

    } catch (err) {
      if (requestId !== requestIdRef.current || abortRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
      setProcessing(false);
    }
  }, [eventsContext.fetchStream, panel, panelContext, panelOption, panelContextData, mergedFilters, panelIndex]);
  
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
        context: memoizedContext,
        contextKey: panelContextKey,
        stopAtTimestamp: stopAt,
        previousState: incrementalStateRef.current,
        onProgress: (_state, count) => {
          // Update metrics during processing (use ref to avoid dep issues)
          updateMetricsRef.current?.(count, 0);
        },
        yieldEveryN: 10000,
      });
      
      // Check if this response is stale (newer request started)
      const isStale = requestId !== requestIdRef.current || abortRef.current;
      
      // Always update metrics so the UI doesn't freeze, even for stale responses
      updateMetricsRef.current?.(response.processedCount, response.processingTimeMs);
      
      // Always update lastTimestamp even for stale responses to prevent getting stuck
      // when there are gaps in events. The lastTimestamp advances to stopAt when no
      // events were processed, ensuring we don't re-skip the same range forever.
      if (incrementalStateRef.current && response.lastTimestamp) {
        const currentLastTs = incrementalStateRef.current.lastTimestamp?.getTime() ?? 0;
        const responseLastTs = response.lastTimestamp.getTime();
        if (responseLastTs > currentLastTs) {
          incrementalStateRef.current.lastTimestamp = response.lastTimestamp;
          incrementalStateRef.current.eventsAtLastTimestamp = response.eventsAtLastTimestamp;
        }
      }
      
      // But don't update result state for stale responses
      if (isStale) {
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
        eventsAtLastTimestamp: response.eventsAtLastTimestamp,
        isDone: response.isDone,
      };
      prevTimestampRef.current = stopAt;
      // Track that we processed this timestamp to avoid redundant work
      lastProcessedTimestampRef.current = stopAt?.getTime() ?? null;
      
      setAggregationState((prev) =>
        prev.panelId === panel.id ? { ...prev, result: response.result } : prev,
      );
      setTotalEvents(response.processedCount);
      setProcessingTimeMs(response.processingTimeMs);
      setProcessing(false);
      
    } catch (err) {
      if (requestId !== requestIdRef.current || abortRef.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
      setProcessing(false);
    }
  }, [eventsContext.fetchStream, panel, panelContext, panelOption, panelContextData, mergedFilters, panelContextKey]);
  
  // Track previous sync mode to detect transitions
  const prevSyncModeRef = useRef(isSyncMode);
  // Track current requestId owned by worker - sync cleanup should not abort this
  const workerRequestIdRef = useRef<number | null>(null);
  
  // Effect for worker mode (normal processing)
  // This effect ONLY runs when not in sync mode
  useEffect(() => {
    // Skip if in sync mode or disabled
    if (!enabled || isSyncMode) {
      workerRequestIdRef.current = null;
      return;
    }
    
    const requestId = ++requestIdRef.current;
    workerRequestIdRef.current = requestId;  // Mark this request as worker-owned
    abortRef.current = false;
    
    // Reset incremental state when entering worker mode (leaving sync mode)
    if (prevSyncModeRef.current) {
      incrementalStateRef.current = null;
      prevTimestampRef.current = null;
      lastProcessedTimestampRef.current = null;
    }
    prevSyncModeRef.current = false;
    
    processWithWorker(requestId);
    
    return () => {
      // Abort any in-flight worker request
      workerRequestIdRef.current = null;
      requestIdRef.current++;
      abortRef.current = true;
    };
  }, [eventsContext.fetchStream, panel, streamsKey, enabled, panelContextKey, isSyncMode, processWithWorker]);
  
  // Effect for sync mode (incremental processing)
  // This effect ONLY runs when in sync mode with a valid timestamp
  useEffect(() => {
    // Skip if not in sync mode or no timestamp
    if (!enabled || !isSyncMode || !throttledSyncTimestamp) {
      return;
    }
    
    prevSyncModeRef.current = true;
    
    const requestId = ++requestIdRef.current;
    abortRef.current = false;
    
    processMainThread(requestId, throttledSyncTimestamp);
    
    return () => {
      // Only abort if there's no active worker request
      // When sync mode is disabled, the worker effect starts a new request,
      // and we shouldn't abort that request when this cleanup runs later
      // (due to throttledSyncTimestamp changing)
      if (workerRequestIdRef.current === null) {
        requestIdRef.current++;
        abortRef.current = true;
      }
    };
  }, [enabled, isSyncMode, throttledSyncTimestamp, processMainThread]);
  
  return {
    loading,
    processing,
    error,
    result,
    totalEvents,
    processingTimeMs,
  };
}
