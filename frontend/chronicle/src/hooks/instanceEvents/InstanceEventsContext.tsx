/* eslint-disable react-refresh/only-export-components -- Provider and hook are intentionally colocated. */
import { InstanceStreamCache } from "./streamCache";
import { createContext, useContext, useCallback, useEffect, useSyncExternalStore, useMemo, type ReactNode } from "react";
import { loadInstanceStream } from "./streamLoader";
import type { StreamType, InstanceEventsContextValue } from "./types";

export const InstanceEventsContext = createContext<InstanceEventsContextValue | null>(null);

interface InstanceEventsProviderProps {
  instanceId: string;
  children: ReactNode;
}

export function InstanceEventsProvider({ instanceId, children }: InstanceEventsProviderProps) {
  // Distinct cache objects also isolate callers that change ID without a keyed remount.
  const cache = useMemo(() => new InstanceStreamCache((type, signal) => loadInstanceStream(instanceId, type, signal)), [instanceId]);
  useEffect(() => () => cache.clear(), [cache]);
  const fetching = useSyncExternalStore(cache.subscribe, cache.getFetching, cache.getFetching);
  const isFetching = useCallback((type: StreamType) => fetching.has(type), [fetching]);
  const value = useMemo<InstanceEventsContextValue>(() => ({
    instanceId,
    getStream: cache.getStream,
    fetchStream: cache.fetchStream,
    isFetching,
  }), [instanceId, cache, isFetching]);

  return <InstanceEventsContext.Provider value={value}>{children}</InstanceEventsContext.Provider>;
}

export function useInstanceEventsContext(): InstanceEventsContextValue {
  const context = useContext(InstanceEventsContext);
  if (!context) {
    throw new Error("useInstanceEventsContext must be used within an InstanceEventsProvider");
  }
  return context;
}
