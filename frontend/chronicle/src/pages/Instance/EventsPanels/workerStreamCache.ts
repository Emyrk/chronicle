import type { StreamType } from "@/hooks/instanceEvents";
import type { WorkerRequest } from "./processorTypes";

export interface WorkerTransportStream {
  type: StreamType;
  cacheId: number;
  data?: Uint8Array;
}

export interface WorkerTransportRequest extends Omit<WorkerRequest, "streams"> {
  resetStreamCache: boolean;
  streams: WorkerTransportStream[];
}

export interface PreparedWorkerRequest {
  request: WorkerTransportRequest;
  transmittedCacheIds: number[];
}

const streamCacheIds = new WeakMap<Uint8Array, number>();
let nextStreamCacheId = 1;

function streamCacheId(data: Uint8Array): number {
  const cached = streamCacheIds.get(data);
  if (cached !== undefined) {
    return cached;
  }

  const id = nextStreamCacheId++;
  streamCacheIds.set(data, id);
  return id;
}

export function prepareWorkerRequest(
  request: WorkerRequest,
  knownStreamIds: ReadonlySet<number>,
  resetStreamCache: boolean,
): PreparedWorkerRequest {
  const transmittedCacheIds: number[] = [];
  const includedStreamIds = new Set<number>();
  const streams = request.streams.map(({ type, data }): WorkerTransportStream => {
    const cacheId = streamCacheId(data);
    const shouldTransmit = resetStreamCache
      || (!knownStreamIds.has(cacheId) && !includedStreamIds.has(cacheId));

    if (!shouldTransmit) {
      return { type, cacheId };
    }

    includedStreamIds.add(cacheId);
    transmittedCacheIds.push(cacheId);
    return { type, cacheId, data };
  });

  return {
    request: {
      ...request,
      resetStreamCache,
      streams,
    },
    transmittedCacheIds,
  };
}

export function resolveWorkerRequest(
  request: WorkerTransportRequest,
  streamCache: Map<number, Uint8Array>,
): WorkerRequest {
  if (request.resetStreamCache) {
    streamCache.clear();
  }

  const streams = request.streams.map(({ type, cacheId, data }) => {
    if (data !== undefined) {
      streamCache.set(cacheId, data);
      return { type, data };
    }

    const cached = streamCache.get(cacheId);
    if (!cached) {
      throw new Error(`Worker stream cache miss: ${cacheId}`);
    }
    return { type, data: cached };
  });

  return {
    requestId: request.requestId,
    panelId: request.panelId,
    context: request.context,
    streams,
  };
}
