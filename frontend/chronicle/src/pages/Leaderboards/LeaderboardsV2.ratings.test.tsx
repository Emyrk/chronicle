import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MemoryRouter } from "react-router-dom"
import { LeaderboardsV2 } from "./LeaderboardsV2"
import { liveRatingURL } from "./Ratings/liveRatingAdapter"

vi.mock("@/api/rankingsQueries", () => ({
  useRankingsInstances: () => ({ data: [{ instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, category: "raid", total_kills: 123, top_players: [] }], isPending: false, isError: false }),
  useRankingsFilters: () => ({ data: [], isPending: false, isError: false }),
  useRankingsEncounters: () => ({ data: [{ encounter_name: "Ragnaros", total_kills: 12, top_dps: 1400 }], isPending: false, isError: false }),
}))
vi.mock("@/api/queries", () => ({
  useRealms: () => ({ data: [{ id: "a0000000-0000-4000-8000-000000000001", name: "Nordanaar" }], isPending: false, isError: false, isSuccess: true }),
}))
vi.mock("@/components/Ads/AdRailStack", () => ({ AdRailStack: () => null }))

describe("published ratings on the live hub", () => {
  it("shows a live empty state for an unseeded guild boss board, never mock scores", () => {
    const client = new QueryClient()
    const request = { instanceName: "Molten Core", encounterName: "Ragnaros", subject: "guild" as const, metric: "renown" as const, window: "period" as const, realmIDs: ["a0000000-0000-4000-8000-000000000001"] }
    client.setQueryData(["tenant-rating-board", liveRatingURL(request), 0], { pages: [{ entries: [] }], pageParams: [""] })
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/leaderboards?tab=ratings&instance=Molten+Core&encounter=Ragnaros&subject=guild&realm_ids=a0000000-0000-4000-8000-000000000001"]}><LeaderboardsV2 /></MemoryRouter></QueryClientProvider>)
    expect(html).toContain("Molten Core · Ragnaros")
    expect(html).toContain("No published scores for this cohort yet")
    expect(html).toContain("Ratings realms: Nordanaar")
    expect(html).not.toContain("Load more")
    expect(html).not.toContain("Mock data")
  })
})
