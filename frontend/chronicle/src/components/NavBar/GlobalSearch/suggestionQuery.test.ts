import { QueryClient, QueryObserver } from "@tanstack/react-query"
import { afterEach, expect, it, vi } from "vitest"
import { suggestionQuery } from "./suggestionQuery"

afterEach(() => vi.unstubAllGlobals())

it("aborts superseded fetches and never publishes stale results", async () => {
  const client = new QueryClient()
  const pending: { signal: AbortSignal; resolve: (value: Response) => void }[] = []
  vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise<Response>((resolve) => {
    pending.push({ signal: init.signal as AbortSignal, resolve })
  })))
  const schedule = async () => {}
  const observer = new QueryObserver(client, suggestionQuery("ab", true, schedule))
  const unsubscribe = observer.subscribe(() => {})
  try {
    await Promise.resolve()
    expect(pending).toHaveLength(1)
    observer.setOptions(suggestionQuery("abc", true, schedule))
    await Promise.resolve()
    expect(pending[0].signal.aborted).toBe(true)
    expect(pending).toHaveLength(2)
    pending[0].resolve(new Response(JSON.stringify({ players: [{ name: "stale" }], guilds: [] })))
    await Promise.resolve()
    expect(observer.getCurrentResult().data).toBeUndefined()
    observer.setOptions(suggestionQuery("abc", false, schedule))
    expect(pending[1].signal.aborted).toBe(true)
    expect(observer.getCurrentResult().data).toBeUndefined()
  } finally {
    unsubscribe()
    client.clear()
  }
})

it("disables short, oversized and closed queries, with no automatic retries", () => {
  expect(suggestionQuery("a", true).enabled).toBe(false)
  expect(suggestionQuery("a".repeat(65), true).enabled).toBe(false)
  expect(suggestionQuery("ab", false).enabled).toBe(false)
  const options = suggestionQuery("é界", true)
  expect(options.enabled).toBe(true)
  expect(options.retry).toBe(false)
  expect(options.refetchOnWindowFocus).toBe(false)
  expect(options.refetchOnReconnect).toBe(false)
})
