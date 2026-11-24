import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSuggestionScheduler, validSuggestionQuery } from "./suggestionScheduler"

describe("suggestion scheduling", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("debounces and coalesces to only the latest pending query", async () => {
    const schedule = createSuggestionScheduler()
    const first = schedule(new AbortController().signal).catch((error: Error) => error.name)
    await vi.advanceTimersByTimeAsync(100)
    const latest = vi.fn()
    const second = schedule(new AbortController().signal).then(latest)
    expect(await first).toBe("AbortError")
    await vi.advanceTimersByTimeAsync(199)
    expect(latest).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await second
    expect(latest).toHaveBeenCalledOnce()
  })

  it("bounds continuous request starts to one per second independently of debounce", async () => {
    const schedule = createSuggestionScheduler()
    const started = vi.fn()
    const first = schedule(new AbortController().signal).then(started)
    await vi.advanceTimersByTimeAsync(200)
    await first
    const second = schedule(new AbortController().signal).then(started)
    await vi.advanceTimersByTimeAsync(999)
    expect(started).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await second
    expect(started).toHaveBeenCalledTimes(2)
  })

  it("keeps a continuous typing stream bounded and eventually serves its latest query", async () => {
    const schedule = createSuggestionScheduler()
    const starts: number[] = []
    const requests: Promise<void | string>[] = []
    for (let query = 0; query < 20; query++) {
      requests.push(schedule(new AbortController().signal)
        .then(() => { starts.push(query) })
        .catch((error: Error) => error.name))
      await vi.advanceTimersByTimeAsync(250)
    }
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.all(requests)
    expect(starts.length).toBeLessThanOrEqual(6)
    expect(starts.at(-1)).toBe(19)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cancels queued work without consuming a request budget", async () => {
    const schedule = createSuggestionScheduler()
    const controller = new AbortController()
    const cancelled = schedule(controller.signal).catch((error: Error) => error.name)
    controller.abort()
    expect(await cancelled).toBe("AbortError")
    expect(vi.getTimerCount()).toBe(0)
    const started = vi.fn()
    const next = schedule(new AbortController().signal).then(started)
    await vi.advanceTimersByTimeAsync(200)
    await next
    expect(started).toHaveBeenCalledOnce()
  })

  it("rejects already aborted work", async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(createSuggestionScheduler()(controller.signal)).rejects.toMatchObject({ name: "AbortError" })
    expect(vi.getTimerCount()).toBe(0)
  })

  it("counts Unicode code points and trims before validating", () => {
    expect(validSuggestionQuery(" é ")).toBe(false)
    expect(validSuggestionQuery(" é界 ")).toBe(true)
    expect(validSuggestionQuery("😀")).toBe(false)
    expect(validSuggestionQuery("😀".repeat(64))).toBe(true)
    expect(validSuggestionQuery("😀".repeat(65))).toBe(false)
  })
})
