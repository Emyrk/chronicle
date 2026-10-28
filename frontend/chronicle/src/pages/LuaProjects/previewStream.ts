import type { PanelPackage } from "../Guides/package/panelLoader"
import type { EventStreams, PanelStream } from "../Guides/runtime/panelEvents"
import { selectPreviewEncounters } from "./luaPreviewBounds"

async function readAll(stream: ReadableStream<Uint8Array>, signal: AbortSignal): Promise<Uint8Array> {
  const reader = stream.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener("abort", cancel, { once: true })
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    signal.throwIfAborted()
    while (true) {
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      total += value.byteLength
      chunks.push(value)
    }
  } finally {
    signal.removeEventListener("abort", cancel)
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength }
  return result
}

/** Fetches one of the instance's authorized event streams (gunzipping if needed) for the browser preview. */
export async function fetchPreviewStream(instanceId: string, stream: PanelStream, { signal }: { signal: AbortSignal }): Promise<Uint8Array> {
  const response = await fetch(`/api/v1/raidlogs/instances/${encodeURIComponent(instanceId)}/events/${stream}`, { signal, credentials: "same-origin" })
  if (!response.ok) throw new Error(`${stream} events unavailable (${response.status})`)
  if (!response.body) throw new Error("Streaming events are unavailable in this browser")
  const bytes = await readAll(response.body, signal)
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  if (typeof DecompressionStream === "undefined") throw new Error("Gzip decompression is unavailable in this browser")
  return readAll(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip")), signal)
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort))
  })
}

/**
 * Keeps the most recent instance's stream bytes so re-running a preview (or auto-preview after every
 * edit) does not download them again. Each stream downloads once and is shared: a caller giving up only
 * stops waiting, and switching instances drops the old bytes.
 */
export function createCachedStreamProvider(fetchStream: typeof fetchPreviewStream = fetchPreviewStream) {
  let cached: { instanceId: string; abort: AbortController; streams: Map<PanelStream, Promise<Uint8Array>> } | null = null
  return {
    getStream(instanceId: string, stream: PanelStream, { signal }: { signal: AbortSignal }): Promise<Uint8Array> {
      if (cached?.instanceId !== instanceId) {
        cached?.abort.abort()
        cached = { instanceId, abort: new AbortController(), streams: new Map() }
      }
      const entry = cached
      let promise = entry.streams.get(stream)
      if (!promise) {
        promise = fetchStream(instanceId, stream, { signal: entry.abort.signal })
        promise.catch(() => { if (entry.streams.get(stream) === promise) entry.streams.delete(stream) })
        entry.streams.set(stream, promise)
      }
      return abortable(promise, signal)
    },
  }
}

export type PreviewStreamProvider = ReturnType<typeof createCachedStreamProvider>

/** Downloads every stream the panel declares, trimmed to the encounters it will replay. */
export async function loadPreviewStreams(provider: Pick<PreviewStreamProvider, "getStream">, instanceId: string, panel: Pick<PanelPackage, "streams" | "streamScope">,
  encounterIds: readonly string[], signal: AbortSignal): Promise<EventStreams> {
  const entries = await Promise.all(panel.streams.map(async stream =>
    [stream, selectPreviewEncounters(await provider.getStream(instanceId, stream, { signal }), encounterIds, panel.streamScope)] as const))
  return Object.fromEntries(entries)
}
