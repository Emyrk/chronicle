import type { PayloadHeader } from "@/api/protodecode/decode";

/**
 * Supported event stream types.
 * Each corresponds to a different protobuf message type.
 */
export type StreamType = "damage" | "extra_attack" | "heal" | "resource_change" | "slain" | "cast" | "aura";

/**
 * Progress for the current encounter being processed
 */
export interface EncounterProgress {
  encounterID: string;
  currentIdx: number;   // 0-based index of current message
  totalEvents: number;  // sum of all stream headers' count for this encounter
}

/**
 * Callback invoked for each event during processing
 */
export type EventCallback<T = unknown> = (
  event: T,
  streamType: StreamType,
  encounterID: string
) => void;

/**
 * Callback invoked when an encounter is fully processed
 */
export type EncounterCompleteCallback = (encounterID: string) => void;

/**
 * Options for useInstanceEvents hook
 */
export interface UseInstanceEventsOptions<T = unknown> {
  /** Which streams to fetch and process */
  streams: StreamType[];
  /** Callback for each event, in index order across streams */
  onEvent: EventCallback<T>;
  /** Optional callback when an encounter is fully processed */
  onEncounterComplete?: EncounterCompleteCallback;
  /** Dependencies that trigger reprocessing when changed */
  deps?: unknown[];
  /** Benchmark mode - skip callbacks and progress updates for raw speed test */
  benchmark?: boolean;
}

/**
 * Result from useInstanceEvents hook
 */
export interface UseInstanceEventsResult {
  /** True while fetching stream data */
  loading: boolean;
  /** True while iterating through events */
  processing: boolean;
  /** Error if fetch or processing failed */
  error: Error | null;
  /** Progress within current encounter */
  encounterProgress: EncounterProgress | null;
  /** Total bytes read while decoding */
  bytesProcessed: number;
  /** Total bytes across all requested streams (decompressed) */
  bytesTotal: number;
}

/**
 * Cached stream data stored in context
 */
export interface CachedStream {
  data: Uint8Array;
  headers: PayloadHeader[];  // all encounter headers in this stream
}

/**
 * Context value provided by InstanceEventsProvider
 */
export interface InstanceEventsContextValue {
  instanceId: string;
  /** Get cached stream data, or null if not yet fetched */
  getStream: (type: StreamType) => CachedStream | null;
  /** Fetch a stream (returns cached if available) */
  fetchStream: (type: StreamType) => Promise<CachedStream>;
  /** Check if a stream is currently being fetched */
  isFetching: (type: StreamType) => boolean;
}
