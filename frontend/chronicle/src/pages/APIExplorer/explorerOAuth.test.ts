import { afterEach, describe, expect, it, vi } from "vitest"
import { ExplorerOAuthSession } from "./explorerOAuth"

const tokens = { access_token: "access-one", refresh_token: "refresh-one", expires_in: 3600, token_type: "bearer" }
const tokenResponse = (data = tokens) => new Response(JSON.stringify(data), { status: 200 })

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function setup() {
  vi.stubGlobal("window", { location: { origin: "https://chronicle.example" } })
  const fetch = vi.fn().mockImplementation(async () => tokenResponse())
  vi.stubGlobal("fetch", fetch)
  return { fetch, session: new ExplorerOAuthSession() }
}

describe("explorer OAuth session", () => {
  it("exchanges credentials only at the token endpoint and uses bearer tokens for API calls", async () => {
    const { fetch, session } = setup()
    await session.connect("app-id", "secret")
    expect(fetch.mock.calls[0][0]).toBe("/oauth/token")
    expect(fetch.mock.calls[0][1].body.get("client_secret")).toBe("secret")
    await session.fetch("/api/external/v1/health")
    const [url, init] = fetch.mock.calls[1]
    expect(url).toBe("https://chronicle.example/api/external/v1/health")
    expect(init.headers.get("Authorization")).toBe("Bearer access-one")
    expect(init.credentials).toBe("omit")
    expect(init.redirect).toBe("error")
    expect(JSON.stringify(init)).not.toContain("secret")
  })

  it("refreshes after expiry without the secret and serializes concurrent refreshes", async () => {
    const { fetch, session } = setup()
    const now = vi.spyOn(Date, "now").mockReturnValue(0)
    await session.connect("app-id", "secret")
    now.mockReturnValue(3_700_000)
    fetch.mockImplementation(async (url: string) => url === "/oauth/token"
      ? tokenResponse({ ...tokens, access_token: "access-two", refresh_token: "refresh-two" })
      : new Response("ok"))
    await Promise.all([session.fetch("/api/external/v1/health"), session.fetch("/api/external/v1/openapi.json")])
    const exchanges = fetch.mock.calls.filter(([url]) => url === "/oauth/token")
    expect(exchanges).toHaveLength(2)
    expect(exchanges[1][1].body.get("grant_type")).toBe("refresh_token")
    expect(exchanges[1][1].body.get("refresh_token")).toBe("refresh-one")
    expect(exchanges[1][1].body.has("client_secret")).toBe(false)
    expect(fetch.mock.calls[2][1].headers.get("Authorization")).toBe("Bearer access-two")
    now.mockReturnValue(7_400_000)
    await session.fetch("/api/external/v1/health")
    expect(fetch.mock.calls[4][1].body.get("refresh_token")).toBe("refresh-two")
  })

  it("never sends tokens off-origin, outside the external API, or after disconnect", async () => {
    const { fetch, session } = setup()
    await session.connect("app-id", "secret")
    await expect(session.fetch("https://evil.example/api/external/v1/health")).rejects.toThrow("only be used")
    await expect(session.fetch("/api/v1/user")).rejects.toThrow("only be used")
    session.disconnect()
    await expect(session.fetch("/api/external/v1/health")).rejects.toThrow("disconnected")
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("does not reconnect when a token response arrives after disconnect", async () => {
    const { fetch, session } = setup()
    let complete!: (response: Response) => void
    fetch.mockImplementation(() => new Promise<Response>((resolve) => { complete = resolve }))
    const connected = session.connect("app-id", "secret")
    session.disconnect()
    complete(tokenResponse())
    await expect(connected).rejects.toThrow()
    await expect(session.fetch("/api/external/v1/health")).rejects.toThrow("disconnected")
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("does not expose token endpoint error bodies", async () => {
    const { fetch, session } = setup()
    fetch.mockResolvedValue(new Response('sensitive server payload', { status: 401 }))
    await expect(session.connect("app-id", "secret")).rejects.toThrow("App authentication failed (401)")
  })

  it("fails closed when refreshing fails instead of retrying a rotated refresh token", async () => {
    const { fetch, session } = setup()
    const now = vi.spyOn(Date, "now").mockReturnValue(0)
    await session.connect("app-id", "secret")
    now.mockReturnValue(3_700_000)
    fetch.mockResolvedValue(new Response("no", { status: 401 }))
    await expect(session.fetch("/api/external/v1/health")).rejects.toThrow("could not be refreshed")
    await expect(session.fetch("/api/external/v1/health")).rejects.toThrow("disconnected")
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
