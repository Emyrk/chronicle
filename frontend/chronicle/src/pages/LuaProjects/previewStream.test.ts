import { afterEach, describe, expect, it, vi } from "vitest"
import { gzipSync } from "fflate"
import { fetchPreviewDamage } from "./previewStream"

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
    expect(await fetchPreviewDamage("instance-id", { signal })).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetch).toHaveBeenCalledWith("/api/v1/raidlogs/instances/instance-id/events/damage", { signal, credentials: "same-origin" })
  })

  it("rejects denied downloads", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([], 403)))
    await expect(fetchPreviewDamage("id", { signal: new AbortController().signal })).rejects.toThrow("403")
  })

  it("cancels an in-flight stream when preview changes", async () => {
    let started!: () => void
    const reading = new Promise<void>(resolve => { started = resolve })
    const stream = new ReadableStream<Uint8Array>({ pull() { started() } })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), body: stream }))
    const controller = new AbortController()
    const pending = expect(fetchPreviewDamage("id", { signal: controller.signal })).rejects.toBeDefined()
    await reading
    controller.abort()
    await pending
  })

  it("expands gzip payloads in full", async () => {
    const raw = new Uint8Array(1024).map((_, index) => index % 251)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([gzipSync(raw)])))
    expect(await fetchPreviewDamage("id", { signal: new AbortController().signal })).toEqual(raw)
  })
})
