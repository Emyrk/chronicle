import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchCareer, playerCareerURL, guildCareerURL, useCareerLeaderboard, usePlayerCareer, useGuildCareer } from "./career"
vi.mock("@tanstack/react-query", () => ({ keepPreviousData: undefined, useQuery: (options: unknown) => options }))
afterEach(() => vi.unstubAllGlobals())
describe("career reads", () => {
  it("encodes identity without metric overrides", () => {
    expect(playerCareerURL("Realm One", "a/b")).toBe("/api/v1/armory/Realm%20One/a%2Fb/career")
    expect(guildCareerURL("a/b")).toBe("/api/v1/guilds/a%2Fb/career")
  })
  it("does not turn transport failure into empty evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })))
    await expect(fetchCareer("/career")).rejects.toThrow("503")
  })
})

it("scopes independent reads by tenant and subject without cross-subject placeholder", () => {
  const player = usePlayerCareer("tenant-a", "Realm", "guid") as unknown as { queryKey: unknown[]; placeholderData?: unknown }
  expect(player.queryKey).toEqual(["career", "tenant-a", "player", "Realm", "guid"])
  expect(player.placeholderData).toBeUndefined()
  const leaderboard = useCareerLeaderboard("tenant-c", new URLSearchParams({ limit: "1" }), false) as unknown as { queryKey: unknown[]; enabled: boolean }
  expect(leaderboard.queryKey).toEqual(["career", "tenant-c", "leaderboard", "/api/v1/leaderboards-v2/career?limit=1"])
  expect(leaderboard.enabled).toBe(false)
  const guild = useGuildCareer("tenant-b", "guild") as unknown as { queryKey: unknown[] }
  expect(guild.queryKey).toEqual(["career", "tenant-b", "guild", "guild"])
})
