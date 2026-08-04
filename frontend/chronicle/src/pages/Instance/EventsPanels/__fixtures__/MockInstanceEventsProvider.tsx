/**
 * Mock InstanceEventsProvider for Storybook stories.
 * Serves stream data from static fixture files instead of API.
 */

import { useCallback, useRef, useState, useMemo, type ReactNode } from "react";
import { isGzipped, decompressGzip, readVarint, readVarint64, type PayloadHeader } from "@/api/protodecode/decode";
import { InstanceEventsContext, type StreamType, type CachedStream, type InstanceEventsContextValue } from "@/hooks/instanceEvents";

// Import fixture data as URLs (Vite handles these as static assets)
import damageFixture from "./damage.bin?url";
import healFixture from "./heal.bin?url";
import resourceChangeFixture from "./resource_change.bin?url";
import slainFixture from "./slain.bin?url";
import castFixture from "./cast.bin?url";
import auraFixture from "./aura.bin?url";
import extraAttackFixture from "./extra_attack.bin?url";

const FIXTURE_URLS: Record<StreamType, string> = {
  damage: damageFixture,
  heal: healFixture,
  resource_change: resourceChangeFixture,
  slain: slainFixture,
  ressurection: "", // No fixture for ressurection yet
  cast: castFixture,
  aura: auraFixture,
  extra_attack: extraAttackFixture,
  aura_cast: "", // No fixture for aura_cast yet
  spell_go: "", spell_start: "", spell_fail: "", unit_classification: "", combatant_info: "", dispel: "", interrupt: "", absorbed: "", companion_stats: "", consume: "", // No fixtures yet
};

// Use the real InstanceEventsContext so useInstanceEventsContext works

/**
 * Parse all encounter headers from stream data without fully decoding messages.
 */
function parseAllHeaders(data: Uint8Array): PayloadHeader[] {
  const headers: PayloadHeader[] = [];
  let offset = 0;

  while (offset < data.length) {
    const { value: strLen, bytesRead: strLenBytes } = readVarint(data, offset);
    offset += strLenBytes;
    const encounterID = new TextDecoder().decode(data.subarray(offset, offset + strLen));
    offset += strLen;

    const { value: timestampMs, bytesRead: tsBytes } = readVarint64(data, offset);
    offset += tsBytes;
    const firstTimestamp = new Date(Number(timestampMs));

    const { value: count, bytesRead: countBytes } = readVarint(data, offset);
    offset += countBytes;

    const { value: dataLength, bytesRead: dataLenBytes } = readVarint(data, offset);
    offset += dataLenBytes;

    headers.push({
      encounterID,
      firstTimestamp,
      count,
      dataLength,
    });

    offset += dataLength;
  }

  return headers;
}

interface MockInstanceEventsProviderProps {
  children: ReactNode;
  /** Override instance ID (defaults to fixture instance ID) */
  instanceId?: string;
}

export function MockInstanceEventsProvider({ 
  children, 
  instanceId = "fixture-instance" 
}: MockInstanceEventsProviderProps) {
  const cacheRef = useRef<Map<StreamType, CachedStream>>(new Map());
  const fetchingRef = useRef<Map<StreamType, Promise<CachedStream>>>(new Map());
  const [fetchingTypes, setFetchingTypes] = useState<Set<StreamType>>(new Set());

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

    // Start new fetch from fixture
    const fetchPromise = (async () => {
      setFetchingTypes(prev => new Set(prev).add(type));
      
      try {
        const fixtureUrl = FIXTURE_URLS[type];
        if (!fixtureUrl) {
          // No fixture recorded for this stream yet — serve an empty stream
          // so panels render their no-data state instead of an error.
          const empty: CachedStream = { data: new Uint8Array(0), headers: [] };
          cacheRef.current.set(type, empty);
          return empty;
        }

        const response = await fetch(fixtureUrl);
        if (!response.ok) {
          throw new Error(`Failed to load fixture: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        let data = new Uint8Array(buffer);

        if (isGzipped(data)) {
          data = await decompressGzip(data);
        }

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
  }, []);

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
