const DAMAGE_LIMIT = 32_000_000

async function readBounded(stream: ReadableStream<Uint8Array>, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
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
      if (total > maxBytes) throw new Error("Damage stream exceeds the browser preview limit")
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

/** Fetches authorized event bytes, bounding both transport and expanded data before preview. */
export async function fetchPreviewDamage(instanceId: string, { signal, maxBytes }: { signal: AbortSignal; maxBytes: number }): Promise<Uint8Array> {
  const limit = Math.min(maxBytes, DAMAGE_LIMIT)
  const response = await fetch(`/api/v1/raidlogs/instances/${encodeURIComponent(instanceId)}/events/damage`, { signal, credentials: "same-origin" })
  if (!response.ok) throw new Error(`Damage events unavailable (${response.status})`)
  if (!response.body) throw new Error("Streaming damage events are unavailable in this browser")
  const size = Number(response.headers.get("content-length"))
  if (Number.isFinite(size) && size > limit) throw new Error("Damage stream exceeds the browser preview limit")
  const bytes = await readBounded(response.body, limit, signal)
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes
  if (typeof DecompressionStream === "undefined") throw new Error("Gzip decompression is unavailable in this browser")
  return readBounded(new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream("gzip")), limit, signal)
}
