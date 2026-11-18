import { strToU8, zipSync } from "fflate"
import { afterEach, describe, expect, it, vi } from "vitest"
import { connectModuleDev, decodeDevPackage, MAX_DEV_STATE_BYTES, MODULE_DEV_ORIGIN, moduleDevToken, parseDevState, readDevJSON } from "./localModuleBridge"

const archive = () => btoa(String.fromCharCode(...zipSync({
  "project.json": strToU8(JSON.stringify({ manifest_version: 1, kind: "panel", name: "Local", entrypoint: "main.lua", capabilities: ["ui"], streams: [] })),
  "main.lua": strToU8('CreateFrame("Frame", "local", UIParent)'),
})))
const state = (commands: unknown[] = []) => ({ protocol: 1, revision: "rev1", archive: archive(), commands })
const context = () => ({ instanceId: "instance", encounterIds: ["e1"] })
const output = { ok: true, nodes: 1, output: 'frame "local"', truncated: false }
const token = "a".repeat(64)

afterEach(() => vi.useRealTimers())

describe("local module dev bridge", () => {
  it("accepts only explicit fixed-length pairing tokens, not remote addresses", () => {
    expect(moduleDevToken(`#module-dev=${token}`)).toBe(token)
    for (const hash of ["", "#module-dev=http://evil.test", "#module-dev=abc", `#module-dev=${"A".repeat(64)}`]) expect(moduleDevToken(hash)).toBeNull()
    expect(MODULE_DEV_ORIGIN).toBe("http://127.0.0.1:17643")
  })

  it("validates protocol, bounds, and command shape", () => {
    expect(parseDevState(state()).revision).toBe("rev1")
    for (const value of [null, {}, { ...state(), protocol: 2 }, { ...state(), commands: [{ type: "eval", id: "x", revision: "r" }] },
      { ...state(), archive: "a".repeat(MAX_DEV_STATE_BYTES + 1) }, { ...state(), commands: Array(17).fill({}) }]) {
      expect(() => parseDevState(value)).toThrow()
    }
  })

  it("uses the existing package validator, including reserved modules", async () => {
    expect((await decodeDevPackage(archive())).sources["main.lua"]).toContain("CreateFrame")
    const invalid = btoa(String.fromCharCode(...zipSync({ "project.json": strToU8('{}') })))
    await expect(decodeDevPackage(invalid)).rejects.toThrow("invalid panel manifest")
    await expect(decodeDevPackage("not base64!")).rejects.toThrow()
  })

  it("bounds streamed JSON even without Content-Length", async () => {
    const body = new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(MAX_DEV_STATE_BYTES))
      controller.enqueue(new Uint8Array(1))
      controller.close()
    } })
    await expect(readDevJSON(new Response(body))).rejects.toThrow("too large")
    await expect(readDevJSON(new Response("denied", { status: 403 }))).rejects.toThrow("403")
  })

  it("relays pinned preview results, keeps heartbeats running, and never sends cookies", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const heartbeats: Record<string, unknown>[] = []
    const onPackage = vi.fn()
    const preview = vi.fn(async () => output)
    let received!: () => void
    const reported = new Promise<void>(resolve => { received = resolve })
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("omit")
      expect(init?.referrerPolicy).toBe("no-referrer")
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${token}` })
      expect(String(url)).toMatch(/^http:\/\/127\.0\.0\.1:17643\/v1\//)
      if (String(url).endsWith("browser")) {
        const body = JSON.parse(init!.body as string)
        heartbeats.push(body)
        if (body.result) received()
        return Response.json({ ok: true })
      }
      return Response.json(state([{ id: "preview-1", type: "preview", revision: "rev1" }]))
    })
    const pending = connectModuleDev({ token, signal: controller.signal, context, onPackage, preview, fetch: fetcher }).catch(error => error)
    // Flush native package decompression, then advance only the bridge's polling delay.
    await vi.waitFor(() => expect(preview).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(750)
    await reported
    expect(heartbeats[1]).toMatchObject({ context: context(), result: { id: "preview-1", revision: "rev1", result: output } })
    expect(onPackage).toHaveBeenCalledOnce()
    expect(preview).toHaveBeenCalledOnce()
    controller.abort()
    await pending
    expect(vi.getTimerCount()).toBe(0)
  })

  it("never executes a command for a different source revision", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const preview = vi.fn()
    let staleResult: unknown
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).endsWith("browser")) {
        const body = JSON.parse(init!.body as string)
        if (body.result) staleResult = body.result
        return Response.json({ ok: true })
      }
      return Response.json(state([{ id: "old", type: "preview", revision: "rev0" }]))
    })
    const pending = connectModuleDev({ token, signal: controller.signal, context, onPackage: vi.fn(), preview, fetch: fetcher }).catch(error => error)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    await vi.advanceTimersByTimeAsync(1500)
    expect(staleResult).toMatchObject({ id: "old", revision: "rev0", result: { ok: false, error: "Source changed; retry preview" } })
    expect(preview).not.toHaveBeenCalled()
    controller.abort()
    await pending
  })

  it("aborts in-flight preview on disconnect", async () => {
    const controller = new AbortController()
    let started!: (signal: AbortSignal) => void
    const running = new Promise<AbortSignal>(resolve => { started = resolve })
    const preview = vi.fn((_panel, _context, signal: AbortSignal) => new Promise<typeof output>((_resolve, reject) => {
      started(signal)
      signal.addEventListener("abort", () => reject(signal.reason), { once: true })
    }))
    const fetcher = vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).endsWith("state")
      ? state([{ id: "run", type: "preview", revision: "rev1" }]) : { ok: true }))
    const pending = connectModuleDev({ token, signal: controller.signal, context, onPackage: vi.fn(), preview, fetch: fetcher }).catch(error => error)
    const signal = await running
    controller.abort()
    await pending
    expect(signal.aborted).toBe(true)
  })
})
