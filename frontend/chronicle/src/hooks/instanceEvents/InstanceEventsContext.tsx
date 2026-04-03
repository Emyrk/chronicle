import { createContext, useContext, useCallback, useRef, useState, useMemo, type ReactNode } from "react";
import { decompressGzip, isGzipped, readVarint, readVarint64, type PayloadHeader } from "@/api/protodecode/decode";
import type { StreamType, CachedStream, InstanceEventsContextValue } from "./types";

export const InstanceEventsContext = createContext<InstanceEventsContextValue | null>(null);

/**
 * Get the API endpoint for a stream type
 */
function getStreamEndpoint(instanceId: string, type: StreamType): string {
  return `/api/v1/raidlogs/instances/${instanceId}/events/${type}`;
}

/**
 * Parse all encounter headers from stream data without fully decoding messages.
 * This gives us the header info for progress tracking.
 */
function parseAllHeaders(data: Uint8Array): PayloadHeader[] {
  const headers: PayloadHeader[] = [];
  let offset = 0;

  while (offset < data.length) {
    // Read encounterID (length-prefixed string)
    const { value: strLen, bytesRead: strLenBytes } = readVarint(data, offset);
    offset += strLenBytes;
    const encounterID = new TextDecoder().decode(data.subarray(offset, offset + strLen));
    offset += strLen;

    // Read firstTimestamp (varint, milliseconds since epoch)
    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(data, offset);
    offset += tsBytes;
    const firstTimestamp = new Date(Number(timestampMs));

    // Read count (varint)
    const { value: count, bytesRead: countBytes } = readVarint(data, offset);
    offset += countBytes;

    // Read dataLength (varint)
    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(data, offset);
    offset += dataLenBytes;

    headers.push({
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    });

    // Skip message data to get to next header
    offset += dataLength;
  }

  return headers;
}

interface InstanceEventsProviderProps {
  instanceId: string;
  children: ReactNode;
}

export function InstanceEventsProvider({ instanceId, children }: InstanceEventsProviderProps) {
  // Cache of fetched streams - persists for lifetime of provider
  const cacheRef = useRef<Map<StreamType, CachedStream>>(new Map());
  
  // Track in-flight fetches to deduplicate
  const fetchingRef = useRef<Map<StreamType, Promise<CachedStream>>>(new Map());
  
  // Track fetching state for UI
  const [fetchingTypes, setFetchingTypes] = useState<Set<StreamType>>(new Set());
  
  // Track previous instanceId to clear cache on change
  const prevInstanceIdRef = useRef<string>(instanceId);
  if (prevInstanceIdRef.current !== instanceId) {
    prevInstanceIdRef.current = instanceId;
    cacheRef.current.clear();
    fetchingRef.current.clear();
  }

  const getStream = useCallback((type: StreamType): CachedStream | null => {
    return cacheRef.current.get(type) ?? null;
  }, []);

  const isFetching = useCallback((type: StreamType): boolean => {
    return fetchingTypes.has(type);
  }, [fetchingTypes]);

  const fetchStream = useCallback(async (type: StreamType): Promise<CachedStream> => {
    // Return cached if available
    const cached = cacheRef.current.get(type);
    if (cached) return cached;

    // Return in-flight promise if already fetching
    const inFlight = fetchingRef.current.get(type);
    if (inFlight) return inFlight;

    // Start new fetch
    const fetchPromise = (async () => {
      setFetchingTypes(prev => new Set(prev).add(type));
      
      try {
        const response = await fetch(getStreamEndpoint(instanceId, type));
        
        if (response.status === 404) {
          // Stream type doesn't exist for this instance (e.g., older instances
          // parsed before unit_classification was added). Treat as empty.
          const emptyStream: CachedStream = { data: new Uint8Array(0), headers: [] };
          cacheRef.current.set(type, emptyStream);
          return emptyStream;
        }

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
        }

        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const json = await response.json();
          throw new Error(`Server error: ${JSON.stringify(json)}`);
        }

        const buffer = await response.arrayBuffer();
        let data = new Uint8Array(buffer);

        if (isGzipped(data)) {
          data = await decompressGzip(data);
        }

        // Parse headers for progress tracking
        const headers = parseAllHeaders(data);

        const cachedStream: CachedStream = { data, headers };
        cacheRef.current.set(type, cachedStream);
        
        return cachedStream;
      } finally {
        fetchingRef.current.delete(type);
        setFetchingTypes(prev => {
          const next = new Set(prev);
          next.delete(type);
          return next;
        });
      }
    })();

    fetchingRef.current.set(type, fetchPromise);
    return fetchPromise;
  }, [instanceId]);

  // Memoize context value to prevent re-renders from causing useEffect re-runs
  const value = useMemo<InstanceEventsContextValue>(() => ({
    instanceId,
    getStream,
    fetchStream,
    isFetching,
  }), [instanceId, getStream, fetchStream, isFetching]);

  return (
    <InstanceEventsContext.Provider value={value}>
      {children}
    </InstanceEventsContext.Provider>
  );
}

export function useInstanceEventsContext(): InstanceEventsContextValue {
  const context = useContext(InstanceEventsContext);
  if (!context) {
    throw new Error("useInstanceEventsContext must be used within an InstanceEventsProvider");
  }
  return context;
}
