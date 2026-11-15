import { afterEach, describe, expect, it, vi } from "vitest"
import { createDeveloperApp, deleteDeveloperApp, getDeveloperApp, rotateDeveloperSecret } from "./developerAppApi"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.restoreAllMocks()
})

describe("developer app API", () => {
  it("loads account metadata without browser caching", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      app: { id: "app-1", client_id: "chronicle-app-1", name: "Raid bot" },
    }), { status: 200 }))
    globalThis.fetch = fetchMock

    expect(await getDeveloperApp()).toEqual({ id: "app-1", client_id: "chronicle-app-1", name: "Raid bot" })
    expect(fetchMock).toHaveBeenCalledWith("/oauth/apps", { cache: "no-store" })
  })

  it("creates and rotates a secret through the account routes", async () => {
    const credentials = { id: "app-1", client_id: "chronicle-app-1", name: "Raid bot", client_secret: "shown-once" }
    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify(credentials), { status: 200 }))
    globalThis.fetch = fetchMock

    expect(await createDeveloperApp("Raid bot")).toEqual(credentials)
    expect(fetchMock).toHaveBeenCalledWith("/oauth/apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Raid bot" }),
    })
    expect(await rotateDeveloperSecret()).toEqual(credentials)
    expect(fetchMock).toHaveBeenCalledWith("/oauth/apps/rotate", { method: "POST" })
  })

  it("deletes and reports server errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "app already exists" }), { status: 409 }))
    globalThis.fetch = fetchMock

    await deleteDeveloperApp()
    expect(fetchMock).toHaveBeenCalledWith("/oauth/apps", { method: "DELETE" })
    await expect(createDeveloperApp("Duplicate")).rejects.toThrow("app already exists")
  })
})
