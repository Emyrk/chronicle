import assert from "node:assert/strict";
import { test } from "node:test";
import { createCache, CACHE_TTL_MS } from "../src/analytics/cache.ts";
function store() {
  const values = new Map<string, Response>();
  return {
    match: async (key: string) => values.get(key)?.clone(),
    put: async (key: string, value: Response) => {
      values.set(key, value.clone());
    },
  };
}
test("one-hour TTL, exact key isolation and shared storage across isolates", async () => {
  let now = 100,
    calls = 0;
  const storage = store();
  const cache = createCache(
    () => storage,
    () => now,
  );
  const load = async () => ++calls;
  assert.equal(await cache("property:date:v1", load), 1);
  now += CACHE_TTL_MS - 1;
  assert.equal(await cache("property:date:v1", load), 1);
  assert.equal(
    await createCache(
      () => storage,
      () => now,
    )("property:date:v1", load),
    1,
  );
  now++;
  assert.equal(await cache("property:date:v1", load), 2);
  assert.equal(await cache("other:date:v1", load), 3);
  assert.equal(await cache("property:otherdate:v1", load), 4);
  assert.equal(await cache("property:date:v2", load), 5);
});
test("in-flight requests coalesce, errors are not cached and retries recover", async () => {
  const cache = createCache(() => store());
  let reject!: (e: Error) => void,
    calls = 0;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const load = () => {
    calls++;
    return new Promise<number>((_, r) => {
      reject = r;
      started();
    });
  };
  const a = cache("key", load),
    b = cache("key", load);
  assert.equal(a, b);
  // Explicit lifecycle signal, no sleeps or scheduler-dependent polling.
  await ready;
  reject(new Error("upstream"));
  await assert.rejects(a, /upstream/);
  await assert.rejects(b, /upstream/);
  assert.equal(calls, 1);
  assert.equal(await cache("key", async () => 42), 42);
});
test("cache read/write errors never replace successful upstream data", async () => {
  const broken = {
    match: async () => {
      throw Error("read");
    },
    put: async () => {
      throw Error("write");
    },
  };
  const cache = createCache(() => broken);
  assert.equal(await cache("key", async () => 42), 42);
});
