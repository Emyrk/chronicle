import { useEffect, useState, useRef } from "react";
import { useInstanceEventsContext } from "./InstanceEventsContext";
import { createStreamCursor, FastDamageCursor, type StreamCursor } from "@/api/protodecode/decode";
import { DamageSchema, ExtraAttackSchema, HealSchema, ResourceChangeSchema, SlainSchema, ResurrectionSchema, CastSchema, AuraSchema, SpellGoSchema, SpellStartSchema, SpellFailSchema, AuraCastSchema, DispelSchema, InterruptSchema, UnitClassificationSchema, AbsorbedSchema, CompanionStatsSchema, ConsumeSchema } from "@/api/proto/chronicle_pb";
import type { DescMessage } from "@bufbuild/protobuf";
import type {
  StreamType,
  UseInstanceEventsOptions,
  UseInstanceEventsResult,
  EncounterProgress,
  CachedStream,
} from "./types";

/**
 * Get the protobuf schema for a stream type
 */
function getSchemaForType(type: StreamType): DescMessage {
  switch (type) {
    case "damage":
      return DamageSchema;
    case "extra_attack":
      return ExtraAttackSchema;
    case "heal":
      return HealSchema;
    case "resource_change":
      return ResourceChangeSchema;
    case "slain":
      return SlainSchema;
    case "ressurection":
      return ResurrectionSchema;
    case "cast":
      return CastSchema;
    case "aura":
      return AuraSchema;
    case "spell_go":
      return SpellGoSchema;
    case "spell_start":
      return SpellStartSchema;
    case "spell_fail":
      return SpellFailSchema;
    case "aura_cast":
      return AuraCastSchema;
    case "dispel":
      return DispelSchema;
    case "unit_classification":
      return UnitClassificationSchema;
    case "interrupt":
      return InterruptSchema;
    case "absorbed":
      return AbsorbedSchema;
    case "companion_stats":
      return CompanionStatsSchema;
    case "consume":
      return ConsumeSchema;
    case "combatant_info":
      // combatant_info uses FastCombatantInfoCursor, not generic StreamCursor.
      // Return UnitClassificationSchema as placeholder to satisfy exhaustive check.
      return UnitClassificationSchema;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unknown stream type: ${_exhaustive}`);
    }
  }
}

/**
 * Wrapper around StreamCursor that tracks the stream type
 */
interface TypedCursor {
  type: StreamType;
  cursor: StreamCursor<DescMessage>;
}

/**
 * Find cursors that have the current encounter
 */
function getCursorsForEncounter(
  cursors: TypedCursor[],
  encounterID: string
): TypedCursor[] {
  return cursors.filter(
    (c) => c.cursor.currentHeader?.encounterID === encounterID
  );
}

/**
 * Get total event count for an encounter across all streams
 */
function getTotalEventsForEncounter(
  streams: CachedStream[],
  encounterID: string
): number {
  let total = 0;
  for (const stream of streams) {
    const header = stream.headers.find((h) => h.encounterID === encounterID);
    if (header) {
      total += header.count;
    }
  }
  return total;
}

/**
 * Get all unique encounter IDs in order from the streams
 */
function getAllEncounterIDs(streams: CachedStream[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  
  // Use the first stream's encounter order as the canonical order
  // (all streams should have the same encounters in the same order)
  for (const stream of streams) {
    for (const header of stream.headers) {
      if (!seen.has(header.encounterID)) {
        seen.add(header.encounterID);
        result.push(header.encounterID);
      }
    }
  }
  
  return result;
}

/**
 * Hook to fetch and process instance event streams.
 * 
 * Events are processed in index order within each encounter,
 * interleaving across multiple streams as needed.
 */
export function useInstanceEvents<T = unknown>(
  options: UseInstanceEventsOptions<T>
): UseInstanceEventsResult {
  const { streams, onEvent, onEncounterComplete, deps = [], benchmark = false } = options;
  const context = useInstanceEventsContext();

  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [encounterProgress, setEncounterProgress] = useState<EncounterProgress | null>(null);
  const [bytesProcessed, setBytesProcessed] = useState(0);
  const [bytesTotal, setBytesTotal] = useState(0);

  // Track processing version to cancel stale processing
  const processingVersionRef = useRef(0);
  
  // Stable callback refs to avoid reprocessing on callback changes
  const onEventRef = useRef(onEvent);
  const onEncounterCompleteRef = useRef(onEncounterComplete);
  
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);
  
  useEffect(() => {
    onEncounterCompleteRef.current = onEncounterComplete;
  }, [onEncounterComplete]);

  // Main effect to fetch and process streams
  useEffect(() => {
    if (streams.length === 0) return;

    const version = ++processingVersionRef.current;
    let cancelled = false;

    async function run() {
      setLoading(true);
      setProcessing(false);
      setError(null);
      setEncounterProgress(null);
      setBytesProcessed(0);
      setBytesTotal(0);

      try {
        // Fetch all requested streams (deduplicates via context)
        const cachedStreams = await Promise.all(
          streams.map((type) => context.fetchStream(type))
        );

        if (cancelled || version !== processingVersionRef.current) return;

        // Calculate total bytes
        const total = cachedStreams.reduce((sum, s) => sum + s.data.length, 0);
        setBytesTotal(total);
        setLoading(false);
        setProcessing(true);
        
        const startTime = performance.now();

        // Fast path: single damage stream uses zero-allocation decoder
        const useFastPath = streams.length === 1 && streams[0] === "damage";
        
        if (useFastPath) {
          performance.mark("fastpath-start");
          
          // Use FastDamageCursor for zero-allocation iteration
          const fastCursor = new FastDamageCursor(cachedStreams[0].data);
          
          performance.mark("cursor-created");
          
          let eventCount = 0;
          while (fastCursor.currentHeader) {
            if (cancelled || version !== processingVersionRef.current) return;
            
            const encounterID = fastCursor.currentHeader.encounterID;
            
            while (fastCursor.hasMoreInEncounter) {
              if (cancelled || version !== processingVersionRef.current) return;
              
              const msg = fastCursor.next();
              if (!msg) break;
              eventCount++;
              
              if (!benchmark) {
                onEventRef.current(msg as T, "damage", encounterID);
              }
            }
            
            if (!benchmark) {
              onEncounterCompleteRef.current?.(encounterID);
            }
            
            fastCursor.nextEncounter();
          }
          
          performance.mark("fastpath-end");
          
          setBytesProcessed(fastCursor.bytesProcessed);
          
          const elapsed = performance.now() - startTime;
          
          // Log detailed timing
          performance.measure("cursor-init", "fastpath-start", "cursor-created");
          performance.measure("event-iteration", "cursor-created", "fastpath-end");
          performance.measure("fastpath-total", "fastpath-start", "fastpath-end");
          
          const cursorInit = performance.getEntriesByName("cursor-init")[0]?.duration ?? 0;
          const iteration = performance.getEntriesByName("event-iteration")[0]?.duration ?? 0;
          
          console.log(`[useInstanceEvents] Fast path: ${eventCount} events in ${elapsed.toFixed(2)}ms (init=${cursorInit.toFixed(2)}ms, iterate=${iteration.toFixed(2)}ms)`);
          
          // Clear marks for next run
          performance.clearMarks();
          performance.clearMeasures();
          
          setProcessing(false);
          return;
        }

        // Standard path: Create cursors for each stream
        const cursors: TypedCursor[] = streams.map((type, i) => ({
          type,
          cursor: createStreamCursor(getSchemaForType(type), cachedStreams[i].data),
        }));

        // Get all encounter IDs in order
        const encounterIDs = getAllEncounterIDs(cachedStreams);

        // Process each encounter
        for (const encounterID of encounterIDs) {
          if (cancelled || version !== processingVersionRef.current) return;

          const totalEvents = getTotalEventsForEncounter(cachedStreams, encounterID);
          let currentIdx = 0;

          setEncounterProgress({
            encounterID,
            currentIdx,
            totalEvents,
          });

          // Advance all cursors to this encounter
          for (const { cursor } of cursors) {
            while (
              cursor.currentHeader &&
              cursor.currentHeader.encounterID !== encounterID
            ) {
              cursor.nextEncounter();
            }
          }

          // Get cursors that have this encounter
          const activeCursors = getCursorsForEncounter(cursors, encounterID);

          // Process messages in index order
          // Optimization: if single stream, skip the interleaving logic
          if (activeCursors.length === 1) {
            const tc = activeCursors[0];
            while (tc.cursor.hasMoreInEncounter) {
              if (cancelled || version !== processingVersionRef.current) return;

              const peeked = tc.cursor.peek();
              if (!peeked) break;

              if (!benchmark) {
                onEventRef.current(peeked.message as T, tc.type, encounterID);
              }

              tc.cursor.advance();
              currentIdx++;

              if (!benchmark && currentIdx % 100 === 0) {
                setEncounterProgress({ encounterID, currentIdx, totalEvents });
                const processed = cursors.reduce((sum, c) => sum + c.cursor.bytesProcessed, 0);
                setBytesProcessed(processed);
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
            }
          } else {
            // Multi-stream: interleave by index
            while (activeCursors.some((c) => c.cursor.hasMoreInEncounter)) {
              if (cancelled || version !== processingVersionRef.current) return;

              // Find cursor with lowest index
              let minCursor: TypedCursor | null = null;
              let minIndex = Infinity;

              for (const tc of activeCursors) {
                const peeked = tc.cursor.peek();
                if (peeked && peeked.index < minIndex) {
                  minIndex = peeked.index;
                  minCursor = tc;
                }
              }

              if (!minCursor) break;

              const peeked = minCursor.cursor.peek()!;
              
              if (!benchmark) {
                onEventRef.current(peeked.message as T, minCursor.type, encounterID);
              }

              minCursor.cursor.advance();
              currentIdx++;

              if (!benchmark && currentIdx % 100 === 0) {
                setEncounterProgress({ encounterID, currentIdx, totalEvents });
                const processed = cursors.reduce((sum, c) => sum + c.cursor.bytesProcessed, 0);
                setBytesProcessed(processed);
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
            }
          }

          // Final progress update for this encounter
          setEncounterProgress({
            encounterID,
            currentIdx,
            totalEvents,
          });

          // Notify encounter complete
          onEncounterCompleteRef.current?.(encounterID);

          // Move all cursors to next encounter
          for (const { cursor } of cursors) {
            cursor.nextEncounter();
          }
        }

        // Final bytes processed
        const processed = cursors.reduce(
          (sum, c) => sum + c.cursor.bytesProcessed,
          0
        );
        setBytesProcessed(processed);
        
        const elapsed = performance.now() - startTime;
        console.log(`[useInstanceEvents] Processing completed in ${elapsed.toFixed(2)}ms (benchmark=${benchmark})`);
        
        setProcessing(false);
      } catch (e) {
        if (cancelled || version !== processingVersionRef.current) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
        setProcessing(false);
      }
    }

    run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.fetchStream, streams.join(","), ...deps]);

  return {
    loading,
    processing,
    error,
    encounterProgress,
    bytesProcessed,
    bytesTotal,
  };
}
