export const CACHE_TTL_MS = 60 * 60 * 1000;
interface Store {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<unknown>;
}
// Cache API is per-colocation, while this map only coalesces requests in this isolate.
// Synthetic keys are never routed or returned to unauthenticated clients.
async function bounded<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Cache timeout")), 1000);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export function createCache(store: () => Store | undefined, now = Date.now) {
  const pending = new Map<string, Promise<unknown>>();
  return function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = pending.get(key);
    if (existing) return existing as Promise<T>;
    const work = (async () => {
      const url = `https://analytics-cache.invalid/${encodeURIComponent(key)}`;
      let cache: Store | undefined;
      try {
        cache = store();
        const response = cache ? await bounded(cache.match(url)) : undefined;
        if (response) {
          const entry = await bounded(
            response.json<{ at: number; value: T }>(),
          );
          if (entry.at <= now() && now() - entry.at < CACHE_TTL_MS)
            return entry.value;
        }
      } catch {
        /* Cache availability must not gate analytics. */
      }
      const value = await load();
      try {
        if (cache)
          await bounded(
            cache.put(
              url,
              new Response(JSON.stringify({ at: now(), value }), {
                headers: {
                  "Content-Type": "application/json",
                  "Cache-Control": "max-age=3600",
                },
              }),
            ),
          );
      } catch {
        /* Successful upstream responses remain usable. */
      }
      return value;
    })();
    pending.set(key, work);
    void work.finally(() => pending.delete(key)).catch(() => {});
    return work;
  };
}
export const cached = createCache(() =>
  typeof caches === "undefined" ? undefined : caches.default,
);
