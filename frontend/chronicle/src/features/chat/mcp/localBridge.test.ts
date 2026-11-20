import { afterEach, describe, expect, it, vi } from "vitest"
import { connectLocalMcp, parseBridgeCommands, parseBridgeConnection, readBridgeJSON, type BridgeConnection } from "./localBridge"
import type { BrowserCommand } from "./browserTools"

const page = { url: "http://localhost:4000/modules/author/module/edit", generation: "g1", sessionId: "s1" }
const owner = { id: "owner-1", name: "Agent", version: "1" }
const command: BrowserCommand = { ownershipRevision: 1, id: "c1", type: "tool", generation: "g1", toolName: "run_preview", arguments: {}, capability: { id: "lua-editor", version: 1 } }
const connection: BridgeConnection = { id: "tab", name: "Module", page, owner, ownershipRevision: 1 }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r }); return { promise, resolve } }
afterEach(() => vi.useRealTimers())

function harness() {
  vi.useFakeTimers()
  const abort = new AbortController()
  let metadata = { ...connection }
  let commands = [command]
  let currentPage = page
  let failure = 0
  const bodies: Record<string, unknown>[] = []
  const requests: { path: string; init: RequestInit }[] = []
  const execute = vi.fn< (command: BrowserCommand, page: unknown, tools: unknown, signal: AbortSignal) => Promise<unknown> >(async () => ({ status: "success" }))
  const status = vi.fn()
  const changed = vi.fn()
  let controls!: { revoke: () => Promise<void> }
  let intercept: ((path: string) => Promise<Response> | undefined) | undefined
  const token = crypto.randomUUID().replaceAll("-", "").repeat(2)
  const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const path = String(url).split("/v1/")[1]
    requests.push({ path, init: init! })
    expect(init?.credentials).toBe("omit")
    expect(init?.referrerPolicy).toBe("no-referrer")
    if (path === "connect") {
      const body = JSON.parse(init!.body as string)
      expect(body.protocol).toBe(3)
      expect(init?.headers).not.toHaveProperty("Authorization")
      metadata = { ...metadata, id: body.clientId }
      return Response.json({ protocol: 3, clientId: body.clientId, token })
    }
    expect(init?.headers).toHaveProperty("Authorization", `Bearer ${token}`)
    expect(init?.headers).toHaveProperty("X-Chronicle-Client", metadata.id)
    const intercepted = intercept?.(path)
    if (intercepted) return intercepted
    if (path === "browser/disconnect") return Response.json({ ok: true })
    if (failure) { if (failure === 1) throw new TypeError("offline"); return new Response("", { status: failure }) }
    if (path === "browser") { bodies.push(JSON.parse(init!.body as string)); return Response.json({ ok: true, connection: metadata }) }
    return Response.json({ protocol: 3, connection: metadata, commands })
  })
  const pending = connectLocalMcp({ signal: abort.signal, current: () => ({ name: " Module ", page: currentPage, tools: [] }),
    connected: vi.fn(), changed, status, controls: value => { controls = value }, execute, fetch: fetcher }).catch(error => error)
  return { execute, bodies, requests, status, changed, pending, abort, token,
    setMetadata: (value: Partial<BridgeConnection>) => { metadata = { ...metadata, ...value } },
    metadata: () => metadata, controls: () => controls,
    setCommands: (value: BrowserCommand[]) => { commands = value },
    setPage: (value: typeof page) => { currentPage = value },
    fail: (value: number) => { failure = value },
    intercept: (value: typeof intercept) => { intercept = value },
    tick: () => vi.advanceTimersByTimeAsync(500),
    start: () => vi.advanceTimersByTimeAsync(0),
    stop: async () => { abort.abort(); await pending },
  }
}

describe("protocol 3 local MCP relay", () => {
  it("validates protocol, ownership, command bounds and metadata", () => {
    const state = { protocol: 3, connection, commands: [command] }
    expect(parseBridgeCommands(state)).toEqual([command])
    for (const value of [null, { ...state, protocol: 2 }, { ...state, commands: [command, command] },
      { ...state, connection: { ...connection, owner: null } }, { ...state, commands: [{ ...command, ownershipRevision: 2 }] },
      { ...state, commands: [{ ...command, type: "eval" }] }]) expect(() => parseBridgeCommands(value)).toThrow()
    for (const patch of [{ ownershipRevision: -1 }, { ownershipRevision: 2 ** 53 }, { name: "x".repeat(81) },
      { owner: { ...owner, id: "é" } }, { owner: { ...owner, version: "" } }, { page: {} }, { owner: undefined }]) {
      expect(() => parseBridgeConnection({ ...connection, ...patch })).toThrow()
    }
    expect(parseBridgeConnection({ ...connection, name: "🎉".repeat(80) }).name).toHaveLength(160)
  })
  it("bounds responses without Content-Length", async () => {
    await expect(readBridgeJSON(new Response("x".repeat(256 * 1024 + 1)))).rejects.toThrow("too large")
  })
  it("keeps two registrations and credentials independent and disconnects with a fresh signal", async () => {
    const a = harness(); const b = harness()
    await a.start()
    expect(a.metadata().id).not.toBe(b.metadata().id)
    expect(a.token).not.toBe(b.token)
    await a.stop()
    const disconnect = a.requests.at(-1)!
    expect(disconnect.path).toBe("browser/disconnect")
    expect(disconnect.init.body).toBe("{}")
    expect(disconnect.init.signal?.aborted).toBe(false)
    await b.tick()
    expect(b.abort.signal.aborted).toBe(false)
    await b.stop()
  })
  it.each([false, true])("echoes the original revision and bounds results (%s)", async oversized => {
    const h = harness()
    h.execute.mockResolvedValue({ output: oversized ? "x".repeat(64 * 1024) : "ok" })
    await h.start(); await h.tick()
    expect(h.bodies[0].name).toBe("Module")
    expect(h.bodies[1]).toMatchObject({ result: { ownershipRevision: 1, id: "c1", result: oversized ? { status: "client_error" } : { output: "ok" } } })
    expect(h.execute).toHaveBeenCalledOnce()
    await h.stop()
  })
  it.each(["revision", "page", "removed", "network"])("cancels work and drops late results on %s", async change => {
    const h = harness(); const result = deferred<unknown>()
    h.execute.mockReturnValue(result.promise)
    await h.start()
    const signal = h.execute.mock.calls[0][3]
    if (change === "revision") { h.setMetadata({ owner: null, ownershipRevision: 2 }); h.setCommands([]) }
    if (change === "page") h.setPage({ ...page, generation: "g2" })
    if (change === "removed") h.setCommands([])
    if (change === "network") h.fail(1)
    await h.tick()
    expect(signal.aborted).toBe(true)
    result.resolve({ saved: true }); h.fail(0)
    await h.tick(); await h.tick()
    expect(h.bodies.every(body => !body.result)).toBe(true)
    expect(h.execute).toHaveBeenCalledOnce()
    expect(h.requests.filter(r => r.path === "connect")).toHaveLength(1)
    await h.stop()
  })
  it("waits available for explicit ownership", async () => {
    const h = harness(); h.setMetadata({ owner: null, ownershipRevision: 0 }); h.setCommands([])
    await h.start(); expect(h.execute).not.toHaveBeenCalled()
    h.setMetadata({ owner, ownershipRevision: 1 }); h.setCommands([command]); await h.tick()
    expect(h.execute).toHaveBeenCalledOnce(); await h.stop()
  })
  it.each([401, 403, 404])("does not bootstrap again after terminal %s", async code => {
    const h = harness(); await h.start(); h.fail(code); await h.tick()
    expect(await h.pending).toBeInstanceOf(Error)
    expect(h.requests.filter(r => r.path === "connect")).toHaveLength(1)
    expect(h.requests.at(-1)?.path).toBe("browser/disconnect")
  })
  it("limits transient retries to the heartbeat lease", async () => {
    const h = harness(); await h.start(); h.fail(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await h.pending).toBeInstanceOf(Error)
    expect(h.status).toHaveBeenCalledWith("reconnecting")
    expect(h.requests.filter(r => r.path === "connect")).toHaveLength(1)
  })
  it("cancels immediately on stale revoke, adopts fresh metadata, never retries revoke or accepts stale poll", async () => {
    const h = harness(); const work = deferred<unknown>(); h.execute.mockReturnValue(work.promise)
    await h.start()
    const poll = deferred<Response>()
    h.intercept(path => path === "state" ? poll.promise : path === "browser/revoke"
      ? Promise.resolve(Response.json({ connection: { ...h.metadata(), owner: { ...owner, id: "new" }, ownershipRevision: 3 } }, { status: 409 })) : undefined)
    await h.tick()
    const revoked = h.controls().revoke()
    expect(h.execute.mock.calls[0][3].aborted).toBe(true)
    await expect(revoked).rejects.toThrow("Control changed")
    poll.resolve(Response.json({ protocol: 3, connection: h.metadata(), commands: [command] }))
    work.resolve({ late: true })
    await h.tick()
    expect(h.changed.mock.calls.at(-1)?.[0].ownershipRevision).toBe(3)
    expect(h.requests.filter(r => r.path === "browser/revoke")).toHaveLength(1)
    expect(h.bodies.every(body => !body.result)).toBe(true)
    await h.stop()
  })
  it("releases control without disconnecting and ignores a late completed result", async () => {
    const h = harness(); const work = deferred<unknown>(); h.execute.mockReturnValue(work.promise)
    await h.start()
    h.intercept(path => path === "browser/revoke" ? Promise.resolve(Response.json({ ok: true,
      connection: { ...h.metadata(), owner: null, ownershipRevision: 2 } })) : undefined)
    await h.controls().revoke()
    expect(h.execute.mock.calls[0][3].aborted).toBe(true)
    expect(h.changed.mock.calls.at(-1)?.[0].owner).toBeNull()
    h.setMetadata({ owner: null, ownershipRevision: 2 }); h.setCommands([])
    work.resolve({ late: true }); await h.tick()
    expect(h.bodies.every(body => !body.result)).toBe(true)
    expect(h.requests.some(r => r.path === "browser/disconnect")).toBe(false)
    await h.stop()
  })
  it("does not replay a rejected late result", async () => {
    const h = harness(); await h.start()
    h.intercept(path => path === "browser" ? Promise.resolve(Response.json({ ok: true,
      connection: h.metadata(), resultAccepted: false })) : undefined)
    await h.tick(); await h.tick()
    const heartbeats = h.requests.filter(r => r.path === "browser").map(r => JSON.parse(r.init.body as string))
    expect(heartbeats[1].result.ownershipRevision).toBe(1)
    expect(heartbeats[2].result).toBeUndefined()
    expect(h.execute).toHaveBeenCalledOnce(); await h.stop()
  })
  it("fails closed on unsupported bootstrap and malformed heartbeat", async () => {
    const abort = new AbortController()
    await expect(connectLocalMcp({ signal: abort.signal, current: () => ({ name: "Module", page, tools: [] }), execute: vi.fn(), connected: vi.fn(),
      fetch: vi.fn(async () => Response.json({ protocol: 2, token: "a".repeat(64) })) })).rejects.toThrow("protocol 3")
    const h = harness(); h.intercept(path => path === "browser" ? Promise.resolve(Response.json({ ok: true })) : undefined)
    await h.start(); expect(await h.pending).toBeInstanceOf(Error)
    expect(h.execute).not.toHaveBeenCalled()
  })
})
