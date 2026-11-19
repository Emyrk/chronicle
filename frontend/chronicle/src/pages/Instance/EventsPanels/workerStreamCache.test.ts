import { describe, expect, it } from "vitest";
import type { WorkerRequest } from "./processorTypes";
import {
  prepareWorkerRequest,
  resolveWorkerRequest,
  type WorkerTransportRequest,
} from "./workerStreamCache";

function workerRequest(data: Uint8Array): WorkerRequest {
  return {
    requestId: 1,
    panelId: "damage_done",
    context: {
      players: {},
      selectedEncounterIds: [],
      entitySelection: { playerIds: [], enemyIds: [] },
    },
    streams: [{ type: "damage", data }],
  };
}

describe("worker stream cache", () => {
  it("transmits a stream once and reuses it for later requests", () => {
    const data = new Uint8Array([1, 2, 3]);
    const knownStreamIds = new Set<number>();
    const workerCache = new Map<number, Uint8Array>();

    const first = prepareWorkerRequest(workerRequest(data), knownStreamIds, true);
    expect(first.request.streams[0]?.data).toBe(data);
    expect(first.transmittedCacheIds).toHaveLength(1);

    const firstResolved = resolveWorkerRequest(first.request, workerCache);
    expect(firstResolved.streams[0]?.data).toBe(data);
    first.transmittedCacheIds.forEach((cacheId) => knownStreamIds.add(cacheId));

    const second = prepareWorkerRequest(workerRequest(data), knownStreamIds, false);
    expect(second.request.streams[0]?.data).toBeUndefined();
    expect(second.transmittedCacheIds).toEqual([]);

    const secondResolved = resolveWorkerRequest(second.request, workerCache);
    expect(secondResolved.streams[0]?.data).toBe(data);
  });

  it("clears the worker cache when the cache scope changes", () => {
    const firstData = new Uint8Array([1]);
    const secondData = new Uint8Array([2]);
    const workerCache = new Map<number, Uint8Array>();

    const first = prepareWorkerRequest(workerRequest(firstData), new Set(), true);
    resolveWorkerRequest(first.request, workerCache);
    expect(workerCache.size).toBe(1);

    const second = prepareWorkerRequest(workerRequest(secondData), new Set(), true);
    const resolved = resolveWorkerRequest(second.request, workerCache);

    expect(workerCache.size).toBe(1);
    expect(resolved.streams[0]?.data).toBe(secondData);
  });

  it("rejects a request that references a stream the worker does not have", () => {
    const request: WorkerTransportRequest = {
      ...workerRequest(new Uint8Array()),
      resetStreamCache: false,
      streams: [{ type: "damage", cacheId: 123 }],
    };

    expect(() => resolveWorkerRequest(request, new Map())).toThrow("Worker stream cache miss: 123");
  });
});
