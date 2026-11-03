/**
 * Web Worker for panel event processing.
 *
 * This worker runs panel processors off the main thread to keep UI responsive.
 * The actual pipeline lives in panelRequestProcessor.ts, shared with the
 * main-thread fallback in workerPool.ts.
 */

import { processWorkerRequest } from "./panelRequestProcessor";
import { resolveWorkerRequest, type WorkerTransportRequest } from "./workerStreamCache";

const streamCache = new Map<number, Uint8Array>();

self.onmessage = (e: MessageEvent<WorkerTransportRequest>) => {
  const request = resolveWorkerRequest(e.data, streamCache);
  self.postMessage(processWorkerRequest(request));
};
