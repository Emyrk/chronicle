import { afterEach, describe, expect, it, vi } from "vitest"
import { gzipSync } from "fflate"
import { createCachedStreamProvider, fetchPreviewStream, loadPreviewStreams } from "./previewStream"

function response(chunks: Uint8Array[], status = 200) {
  return { ok: status === 200, status, headers: new Headers(), body: new ReadableStream<Uint8Array>({
    start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close() },
  }) }
}

describe("browser preview download", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("requests the selected instance through the existing authorized event endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(response([new Uint8Array([1, 2, 3])]))
    vi.stubGlobal("fetch", fetch)
    const signal = new AbortController().signal
    expect(await fetchPreviewStream("instance-id", "damage", { signal })).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetch).toHaveBeenCalledWith("/api/v1/raidlogs/instances/instance-id/events/damage", { signal, credentials: "same-origin" })
  })

  it("rejects denied downloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([], 403)))
    await expect(fetchPreviewStream("id", "damage", { signal: new AbortController().signal })).rejects.toThrow("403")
  })

  it("cancels an in-flight stream when preview changes", async () => {
    let started!: () => void
    const reading = new Promise<void>(resolve => { started = resolve })
    const stream = new ReadableStream<Uint8Array>({ pull() { started() } })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), body: stream }))
    const controller = new AbortController()
    const pending = expect(fetchPreviewStream("id", "damage", { signal: controller.signal })).rejects.toBeDefined()
    await reading
    controller.abort()
    await pending
  })

  it("expands gzip payloads in full", async () => {
    const raw = new Uint8Array(1024).map((_, index) => index % 251)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([gzipSync(raw)])))
    expect(await fetchPreviewStream("id", "damage", { signal: new AbortController().signal })).toEqual(raw)
  })

  it("downloads each instance's stream once and shares it across re-runs", async () => {
    const fetchStream = vi.fn(async (id: string, stream: string) => new TextEncoder().encode(`${id}:${stream}`))
    const provider = createCachedStreamProvider(fetchStream)
    const first = new AbortController()
    const abandoned = provider.getStream("a", "damage", { signal: first.signal })
    first.abort()
    await expect(abandoned).rejects.toBeDefined()
    // The caller gave up, but the shared download finished and is reused.
    expect(await provider.getStream("a", "damage", { signal: new AbortController().signal })).toEqual(new TextEncoder().encode("a:damage"))
    expect(await provider.getStream("a", "heal", { signal: new AbortController().signal })).toEqual(new TextEncoder().encode("a:heal"))
    expect(await provider.getStream("b", "damage", { signal: new AbortController().signal })).toEqual(new TextEncoder().encode("b:damage"))
    expect(fetchStream).toHaveBeenCalledTimes(3)
  })

  it("retries a stream whose download failed", async () => {
    const fetchStream = vi.fn().mockRejectedValueOnce(new Error("503")).mockResolvedValue(new Uint8Array([1]))
    const provider = createCachedStreamProvider(fetchStream)
    await expect(provider.getStream("a", "damage", { signal: new AbortController().signal })).rejects.toThrow("503")
    expect(await provider.getStream("a", "damage", { signal: new AbortController().signal })).toEqual(new Uint8Array([1]))
  })

  it("loads every declared stream for the preview", async () => {
    const getStream = vi.fn(async () => new Uint8Array())
    const streams = await loadPreviewStreams({ getStream }, "a", { streams: ["damage", "aura"], streamScope: "selection" }, ["e1"], new AbortController().signal)
    expect(Object.keys(streams)).toEqual(["damage", "aura"])
    expect(getStream.mock.calls.map(call => (call as unknown[])[1])).toEqual(["damage", "aura"])
  })
})
