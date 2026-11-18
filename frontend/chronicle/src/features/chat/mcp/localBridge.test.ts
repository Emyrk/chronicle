import { afterEach, describe, expect, it, vi } from "vitest"
import { connectLocalMcp, LOCAL_MCP_ORIGIN, parseBridgeCommands, readBridgeJSON } from "./localBridge"
import type { BrowserCommand } from "./browserTools"

const token = "a".repeat(64)
const page = { url: "http://localhost:4000/modules/author/module/edit", generation: "g1", sessionId: "s1" }
const command: BrowserCommand = { id: "c1", type: "tool", generation: "g1", toolName: "run_preview", arguments: {}, capability: { id: "lua-editor", version: 1, scopeType: "lua_project", scopeId: "p1" } }
afterEach(() => vi.useRealTimers())

describe("generic local MCP relay", () => {
  it("validates command protocol and rejects executable arbitrary commands", () => {
    expect(parseBridgeCommands({ protocol: 2, commands: [command] })).toEqual([command])
    for (const value of [null, { protocol: 1, commands: [] }, { protocol: 2, commands: [{ ...command, type: "eval" }] }]) expect(() => parseBridgeCommands(value)).toThrow()
  })

  it("bounds responses without Content-Length", async () => {
    await expect(readBridgeJSON(new Response("x".repeat(256 * 1024 + 1)))).rejects.toThrow("too large")
  })

  it.each([false, true])("bootstraps, advertises page, and forwards one bounded result (oversized=%s)", async (oversized) => {
    vi.useFakeTimers()
    const abort = new AbortController()
    const bodies: Record<string, unknown>[] = []
    const execute = vi.fn(async () => ({ status: "success", result: { output: oversized ? "x".repeat(64 * 1024) : "Damage 42" } }))
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe("omit")
      expect(init?.referrerPolicy).toBe("no-referrer")
      expect(String(url).startsWith(LOCAL_MCP_ORIGIN + "/v1/")).toBe(true)
      if (String(url).endsWith("connect")) {
        expect(init?.body).toBe('{"protocol":2}')
        expect(init?.headers).not.toHaveProperty("Authorization")
        return Response.json({ protocol: 2, token })
      }
      expect(init?.headers).toHaveProperty("Authorization", `Bearer ${token}`)
      if (String(url).endsWith("browser")) { bodies.push(JSON.parse(init!.body as string)); return Response.json({ ok: true }) }
      return Response.json({ protocol: 2, commands: [command] })
    })
    const pending = connectLocalMcp({ signal: abort.signal, current: () => ({ page, tools: [] }), connected: vi.fn(), execute, fetch: fetcher }).catch(error => error)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce())
    await vi.advanceTimersByTimeAsync(500)
    expect(bodies[0]).toMatchObject({ page, tools: [] })
    expect(bodies[1]).toMatchObject({ result: { id: "c1", generation: "g1", result: oversized
      ? { status: "client_error", result: { message: "Tool result exceeded the local MCP size limit" } }
      : { status: "success", result: { output: "Damage 42" } } } })
    expect(execute).toHaveBeenCalledOnce()
    abort.abort()
    await pending
  })

  it("revokes a pending browser approval when the MCP caller cancels", async () => {
    vi.useFakeTimers()
    const abort = new AbortController()
    let canceled = false
    let runningSignal: AbortSignal | undefined
    const execute = vi.fn((_command, _page, _tools, signal: AbortSignal) => {
      runningSignal = signal
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
    })
    const fetcher = vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).endsWith("connect") ? { protocol: 2, token }
      : String(url).endsWith("state") ? { protocol: 2, commands: canceled ? [] : [command] } : { ok: true }))
    const pending = connectLocalMcp({ signal: abort.signal, current: () => ({ page, tools: [] }), connected: vi.fn(), execute, fetch: fetcher }).catch(error => error)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce())
    canceled = true
    await vi.advanceTimersByTimeAsync(500)
    expect(runningSignal?.aborted).toBe(true)
    abort.abort()
    await pending
  })

  it("aborts a running call on page generation change", async () => {
    vi.useFakeTimers()
    let currentPage = page
    const abort = new AbortController()
    let runningSignal: AbortSignal | undefined
    const execute = vi.fn((_command, _page, _tools, signal: AbortSignal) => {
      runningSignal = signal
      return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))
    })
    const fetcher = vi.fn(async (url: RequestInfo | URL) => Response.json(String(url).endsWith("connect") ? { protocol: 2, token }
      : String(url).endsWith("state") ? { protocol: 2, commands: [command] } : { ok: true }))
    const pending = connectLocalMcp({ signal: abort.signal, current: () => ({ page: currentPage, tools: [] }), connected: vi.fn(), execute, fetch: fetcher }).catch(error => error)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce())
    currentPage = { ...page, generation: "g3" }
    await vi.advanceTimersByTimeAsync(500)
    expect(runningSignal?.aborted).toBe(true)
    abort.abort()
    await pending
  })
})
