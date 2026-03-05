/**
 * Worker pool for panel processing.
 *
 * Uses a small, reusable pool of workers to avoid spawn overhead while still
 * allowing multiple panels to process in parallel.
 */

import type { WorkerRequest, WorkerResponse } from "./processorTypes";

interface WorkerSlot {
  worker: Worker;
  busy: boolean;
}

interface QueuedRequest {
  request: WorkerRequest;
  queuedAtMs: number;
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
}

const DEFAULT_POOL_SIZE = 2;
const MAX_POOL_SIZE = 4;
const detectedConcurrency = typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)
  ? navigator.hardwareConcurrency
  : DEFAULT_POOL_SIZE;
const WORKER_POOL_SIZE = Math.max(1, Math.min(detectedConcurrency, MAX_POOL_SIZE));

let poolInitialized = false;
let workerSlots: WorkerSlot[] = [];
let requestQueue: QueuedRequest[] = [];

function createWorker(): Worker {
  return new Worker(new URL("./panelWorker.ts", import.meta.url), { type: "module" });
}

function initializePool(): void {
  if (poolInitialized) {
    return;
  }

  workerSlots = Array.from({ length: WORKER_POOL_SIZE }, () => ({
    worker: createWorker(),
    busy: false,
  }));

  poolInitialized = true;
}

function getIdleSlot(): WorkerSlot | null {
  for (const slot of workerSlots) {
    if (!slot.busy) {
      return slot;
    }
  }
  return null;
}

function replaceWorker(slot: WorkerSlot): void {
  slot.worker.terminate();
  slot.worker = createWorker();
}

function dispatchQueuedRequests(): void {
  let idleSlot = getIdleSlot();

  while (idleSlot && requestQueue.length > 0) {
    const queued = requestQueue.shift()!;
    runRequest(idleSlot, queued);
    idleSlot = getIdleSlot();
  }
}

function runRequest(slot: WorkerSlot, queued: QueuedRequest): void {
  slot.busy = true;

  const { worker } = slot;
  const startedAtMs = performance.now();
  const queueWaitMs = Math.max(0, startedAtMs - queued.queuedAtMs);

  const cleanup = (): void => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
    slot.busy = false;
    dispatchQueuedRequests();
  };

  const handleMessage = (e: MessageEvent<WorkerResponse>) => {
    if (e.data.requestId !== queued.request.requestId) {
      return;
    }

    cleanup();
    queued.resolve({
      ...e.data,
      queueWaitMs,
    });
  };

  const handleError = (e: ErrorEvent) => {
    worker.removeEventListener("message", handleMessage);
    worker.removeEventListener("error", handleError);
    slot.busy = false;

    // Replace the failed worker so future requests still have a healthy slot.
    replaceWorker(slot);

    queued.reject(new Error(e.message || "Worker error"));
    dispatchQueuedRequests();
  };

  worker.addEventListener("message", handleMessage);
  worker.addEventListener("error", handleError);
  worker.postMessage(queued.request);
}

/**
 * Execute a request using the worker pool.
 */
export function executeRequest(request: WorkerRequest): Promise<WorkerResponse> {
  initializePool();

  return new Promise((resolve, reject) => {
    requestQueue.push({
      request,
      queuedAtMs: performance.now(),
      resolve,
      reject,
    });

    dispatchQueuedRequests();
  });
}

/**
 * Terminate all workers in the pool.
 * Call on page unload or when cleaning up.
 */
export function terminatePool(): void {
  for (const slot of workerSlots) {
    slot.worker.terminate();
  }

  for (const queued of requestQueue) {
    queued.reject(new Error("Worker pool terminated"));
  }

  workerSlots = [];
  requestQueue = [];
  poolInitialized = false;
}
