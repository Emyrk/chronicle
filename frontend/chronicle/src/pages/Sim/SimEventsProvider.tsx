/**
 * Drop-in InstanceEventsContext provider backed by sim-generated streams.
 *
 * Wraps children with InstanceEventsContext.Provider so that EventsPanel
 * components (and their workers) can consume sim data identically to real
 * combat log data.
 */

import { useMemo, type ReactNode } from "react";
import { InstanceEventsContext } from "@/hooks/instanceEvents";
import type { CachedStream, StreamType } from "@/hooks/instanceEvents/types";
import { emptyStream } from "@/sim/buildSimStream";

interface SimEventsProviderProps {
  streams: Map<StreamType, CachedStream>;
  children: ReactNode;
}

const EMPTY: CachedStream = emptyStream();

export function SimEventsProvider({ streams, children }: SimEventsProviderProps) {
  const value = useMemo(
    () => ({
      instanceId: "sim-run-1",
      getStream: (type: StreamType) => streams.get(type) ?? EMPTY,
      fetchStream: (type: StreamType) =>
        Promise.resolve(streams.get(type) ?? EMPTY),
      isFetching: () => false,
    }),
    [streams],
  );

  return (
    <InstanceEventsContext.Provider value={value}>
      {children}
    </InstanceEventsContext.Provider>
  );
}
