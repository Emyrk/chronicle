import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { LeaderboardsV2 } from "./LeaderboardsV2"

vi.mock("@/api/rankingsQueries", () => ({
  useRankingsInstances: () => ({ data: [{ instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, category: "raid", total_kills: 123, top_players: [] }], isPending: false, isError: false }),
  useRankingsFilters: () => ({ data: [], isPending: false, isError: false }),
}))
vi.mock("@/api/queries", () => ({
  useRealms: () => ({ data: [{ id: "realm-id", name: "Nordanaar" }], isPending: false, isError: false, isSuccess: true }),
}))
vi.mock("@/components/Ads/AdRailStack", () => ({ AdRailStack: () => null }))

describe("production leaderboards hub", () => {
  it("uses published instance data and preserves tab/realm URL selection in card links", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboards?tab=ratings&realm_ids=realm-id"]}><LeaderboardsV2 /></MemoryRouter>)
    expect(html).toContain("Molten Core")
    expect(html).toContain("123 recorded kills")
    expect(html).toContain("Ratings realms: Nordanaar")
    expect(html).toContain("tab=ratings&amp;realm_ids=realm-id&amp;instance=Molten+Core")
    expect(html).toContain('href="/leaderboards/statistics"')
    expect(html).toContain('href="/leaderboards/speedruns"')
    expect(html).toContain('href="/leaderboards/parsing"')
    expect(html).toContain('href="/leaderboards/rulesets"')
    expect(html).not.toContain("Mock data for design review")
  })
})
