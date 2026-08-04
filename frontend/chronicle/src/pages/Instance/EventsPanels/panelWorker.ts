/**
 * Web Worker for panel event processing.
 *
 * This worker runs panel processors off the main thread to keep UI responsive.
 * The actual pipeline lives in panelRequestProcessor.ts, shared with the
 * main-thread fallback in workerPool.ts.
 */

import { processWorkerRequest } from "./panelRequestProcessor";
import type { WorkerRequest } from "./processorTypes";

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  self.postMessage(processWorkerRequest(e.data));
};
