import { afterEach, describe, expect, it, vi } from "vitest";
import { InstanceStreamCache } from "./streamCache";
import { loadInstanceStream } from "./streamLoader";
import type { CachedStream } from "./types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const oldData: CachedStream = { data: new Uint8Array([1]), headers: [] };
const newData: CachedStream = { data: new Uint8Array([2]), headers: [] };
afterEach(() => vi.unstubAllGlobals());

describe("InstanceStreamCache", () => {
  it("deduplicates pending loads and completed streams", async () => {
    const pending = deferred<CachedStream>();
    const load = vi.fn(() => pending.promise);
    const cache = new InstanceStreamCache(load);
    const a = cache.fetchStream("damage");
    expect(cache.fetchStream("damage")).toBe(a);
    pending.resolve(newData);
    expect(await a).toBe(newData);
    expect(await cache.fetchStream("damage")).toBe(newData);
    expect(load).toHaveBeenCalledOnce();
  });

  it("aborts old requests and rejects late success without overwriting replacement data or tracking", async () => {
    const old = deferred<CachedStream>();
    const next = deferred<CachedStream>();
    const signals: AbortSignal[] = [];
    const load = vi.fn((_type, signal: AbortSignal) => { signals.push(signal); return signals.length === 1 ? old.promise : next.promise; });
    const cache = new InstanceStreamCache(load);
    const first = cache.fetchStream("damage");
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    cache.clear();
    expect(signals[0].aborted).toBe(true);
    const second = cache.fetchStream("damage");
    old.resolve(oldData);
    await rejected;
    expect(cache.getStream("damage")).toBeNull();
    expect(cache.getFetching().has("damage")).toBe(true);
    expect(cache.fetchStream("damage")).toBe(second);
    next.resolve(newData);
    await second;
    expect(cache.getStream("damage")).toBe(newData);
    expect(cache.getFetching().size).toBe(0);
  });

  it("does not let an old failure remove a replacement request", async () => {
    const old = deferred<CachedStream>();
    const next = deferred<CachedStream>();
    const load = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const cache = new InstanceStreamCache(load);
    const first = cache.fetchStream("damage");
    const rejected = expect(first).rejects.toThrow("old failure");
    await Promise.resolve();
    cache.clear();
    const second = cache.fetchStream("damage");
    old.reject(new Error("old failure"));
    await rejected;
    expect(cache.fetchStream("damage")).toBe(second);
    next.resolve(newData);
    await second;
  });

  it("keeps separate resolved-instance caches isolated", async () => {
    const a = new InstanceStreamCache(async () => oldData);
    const b = new InstanceStreamCache(async () => newData);
    await a.fetchStream("damage");
    expect(b.getStream("damage")).toBeNull();
    await b.fetchStream("damage");
    expect(b.getStream("damage")).toBe(newData);
  });

  it("never converts an aborted404 into a cached empty stream", async () => {
    const response = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn(() => response.promise));
    const cache = new InstanceStreamCache((type, signal) => loadInstanceStream("old-id", type, signal));
    const first = cache.fetchStream("damage");
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    await Promise.resolve();
    cache.clear();
    response.resolve(new Response(null, { status: 404 }));
    await rejected;
    expect(cache.getStream("damage")).toBeNull();
  });

  it("rejects an old body that finishes after cancellation", async () => {
    const body = deferred<ArrayBuffer>();
    const reading = deferred<void>();
    const response = new Response(new Uint8Array(0));
    vi.spyOn(response, "arrayBuffer").mockImplementation(() => { reading.resolve(); return body.promise; });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
    const cache = new InstanceStreamCache((type, signal) => loadInstanceStream("old-id", type, signal));
    const pending = cache.fetchStream("damage");
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await reading.promise;
    cache.clear();
    body.resolve(new ArrayBuffer(0));
    await rejected;
    expect(cache.getStream("damage")).toBeNull();
  });

  it("supports effect cleanup followed by a fresh request (StrictMode replay)", async () => {
    const load = vi.fn(async () => newData);
    const cache = new InstanceStreamCache(load);
    const old = cache.fetchStream("damage");
    const rejected = expect(old).rejects.toMatchObject({ name: "AbortError" });
    cache.clear();
    expect(await cache.fetchStream("damage")).toBe(newData);
    await rejected;
    expect(cache.getFetching().size).toBe(0);
  });

  it("still supports genuinely missing streams", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    const stream = await loadInstanceStream("new-id", "damage", new AbortController().signal);
    expect(stream.data.byteLength).toBe(0);
  });
});
