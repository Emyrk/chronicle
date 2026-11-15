import type { CachedStream, StreamType } from "./types";

interface StreamRequest {
  controller: AbortController;
  promise: Promise<CachedStream>;
}

/** Instance-owned cache. Cancellation invalidates even loaders that ignore AbortSignal. */
export class InstanceStreamCache {
  private epoch = 0;
  private cache = new Map<StreamType, CachedStream>();
  private requests = new Map<StreamType, StreamRequest>();
  private fetching = new Set<StreamType>();
  private listeners = new Set<() => void>();

  private readonly load: (type: StreamType, signal: AbortSignal) => Promise<CachedStream>;

  constructor(load: (type: StreamType, signal: AbortSignal) => Promise<CachedStream>) { this.load = load; }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  getFetching = () => this.fetching;
  getStream = (type: StreamType) => this.cache.get(type) ?? null;

  private publish() {
    this.fetching = new Set(this.requests.keys());
    for (const listener of this.listeners) listener();
  }

  clear = () => {
    this.epoch++;
    for (const request of this.requests.values()) request.controller.abort();
    this.requests.clear();
    this.cache.clear();
    this.publish();
  };

  fetchStream = (type: StreamType): Promise<CachedStream> => {
    const cached = this.cache.get(type);
    if (cached) return Promise.resolve(cached);
    const pending = this.requests.get(type);
    if (pending) return pending.promise;

    const epoch = this.epoch;
    const controller = new AbortController();
    const current = () => epoch === this.epoch && this.requests.get(type) === request && !controller.signal.aborted;
    // Defer the loader so request identity is installed before it can settle.
    const promise = Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return this.load(type, controller.signal);
    }).then((stream) => {
      if (!current()) throw new DOMException("Stream request superseded", "AbortError");
      this.cache.set(type, stream);
      return stream;
    }).finally(() => {
      // An old request must never remove a replacement request's tracking.
      if (epoch === this.epoch && this.requests.get(type) === request) {
        this.requests.delete(type);
        this.publish();
      }
    });
    const request: StreamRequest = { controller, promise };
    this.requests.set(type, request);
    this.publish();
    return request.promise;
  };
}
