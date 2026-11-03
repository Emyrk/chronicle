import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { LeaderboardsLiveHub } from "./LeaderboardsLiveHub"

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [], isPending: false, isError: false }) }))
vi.mock("@/api/rankingsQueries", () => ({
  useRankingsInstances: () => ({ data: [{ instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, category: "raid", total_kills: 12, top_players: [] }], isPending: false, isError: false }),
  useRankingsEncounters: () => ({ data: [{ encounter_name: "Ragnaros", total_kills: 12, top_dps: 1450 }], isPending: false, isError: false }),
  useRankingsFilters: () => ({ data: [{ player_class: "MAGE", specs: [{ spec: "Frost", sub_specs: [""] }] }], isPending: false, isError: false }),
  useRankingsLeaderboard: () => ({ data: { entries: [] }, isPending: false, isError: false }),
  useRankingsStats: () => ({ data: [], isPending: false, isError: false }),
  useRankingsClearTimes: () => ({ data: [], isPending: false, isError: false }),
  useRankingsKillTimes: () => ({ data: [], isPending: false, isError: false }),
  useRankingsSuccessRates: () => ({ data: [], isPending: false, isError: false }),
  useParseScoreSpreads: () => ({ data: { available: false, spreads: [] }, isPending: false, isError: false }),
  useTimeParseSpreads: () => ({ data: { spreads: [] }, isPending: false, isError: false }),
}))
vi.mock("@/api/queries", () => ({ useRealms: () => ({ data: [{ id: "realm-id", name: "Nordanaar" }], isPending: false, isError: false }) }))
vi.mock("@/components/Ads/AdRailStack", () => ({ AdRailStack: () => null }))
vi.mock("./Hub/LiveHubOverview", () => ({ LiveHubOverview: () => <p>Live overview</p> }))

describe("live Storybook Hub", () => {
  it("renders the original instance banner, realm/title, scope bar, encounters, and tabs with live names", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core&realm_ids=realm-id"]}><LeaderboardsLiveHub /></MemoryRouter>)
    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('aria-label="Realm: Nordanaar"')
    expect(html).toContain('aria-label="Leaderboard scope"')
    expect(html).toContain('aria-label="Encounters"')
    expect(html).toContain("Ragnaros")
    expect(html).toContain("Live overview")
    expect(html).not.toContain("Mock data for design review")
    expect(html).not.toContain("Ratings realms:")
  })
  it("uses the Storybook landing grid with published cohorts", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2"]}><LeaderboardsLiveHub /></MemoryRouter>)
    expect(html).toContain("Molten Core")
    expect(html).toContain("12 recorded kills")
    expect(html).toContain('aria-label="Leaderboard section"')
    expect(html).not.toContain("Mock data for design review")
  })
})
