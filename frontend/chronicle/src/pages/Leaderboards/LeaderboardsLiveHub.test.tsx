import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"
import { useRankingsInstances } from "@/api/rankingsQueries"
import { LeaderboardsLiveHub } from "./LeaderboardsLiveHub"

vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [], isPending: false, isError: false }) }))
vi.mock("@/api/rankingsQueries", () => ({
  useRankingsInstances: vi.fn(() => ({ data: [{ instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, category: "raid", total_kills: 12, top_players: [] }], isPending: false, isError: false })),
  useRankingsEncounters: () => ({ data: [
    { encounter_name: "Ragnaros", total_kills: 12, top_dps: 1450 },
    { encounter_name: "Gehennas", total_kills: 10, top_dps: 1300 },
    { encounter_name: "Trash", total_kills: 25, top_dps: 1200 },
  ], isPending: false, isError: false }),
  useRankingsFilters: () => ({ data: [{ player_class: "MAGE", specs: [{ spec: "Frost", sub_specs: [""] }] }], isPending: false, isError: false }),
  useRankingsLeaderboard: () => ({ data: { entries: [] }, isPending: false, isError: false }),
  useRankingsStats: () => ({ data: [], isPending: false, isError: false }),
  useRankingsClearTimes: () => ({ data: [], isPending: false, isError: false }),
  useRankingsKillTimes: () => ({ data: [], isPending: false, isError: false }),
  useRankingsSuccessRates: () => ({ data: [], isPending: false, isError: false }),
  useParseScoreSpreads: () => ({ data: { available: false, spreads: [] }, isPending: false, isError: false }),
  useTimeParseSpreads: () => ({ data: { spreads: [] }, isPending: false, isError: false }),
}))
vi.mock("@/api/queries", () => ({
  useRealms: () => ({ data: [{ id: "realm-id", name: "Nordanaar" }], isPending: false, isError: false }),
  useSupportedInstanceProgressionBosses: () => ({ data: new Map([["Molten Core", new Set(["Ragnaros"])]]), isPending: false, isError: false }),
  useSupportedInstanceRankingEncounterSets: () => ({ data: new Map([["Molten Core", [{ id: "", label: "Default", encounters: ["Ragnaros"] }]]]), isPending: false, isError: false }),
}))
vi.mock("@/components/Ads/AdRailStack", () => ({ AdRailStack: () => null }))
vi.mock("./Hub/LiveHubRatings", () => ({ LiveHubRatings: () => <p>Live ratings</p> }))
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
  it("uses the configured Turtle roster and exposes Trash only under Performances", () => {
    const ratings = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core&tab=ratings&encounter=Trash"]}><LeaderboardsLiveHub /></MemoryRouter>)
    expect(ratings).toContain("Ragnaros")
    expect(ratings).not.toContain("Gehennas")
    expect(ratings).not.toContain("Trash")
    expect(ratings).toContain("Full clear") // invalid encounter falls back to raid selection

    const performances = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core&tab=performances"]}><LeaderboardsLiveHub /></MemoryRouter>)
    expect(performances).not.toContain("Gehennas")
    expect(performances).toContain("Trash")
    expect(performances).toContain("Full clear")
  })

  it("hides the cohort selector for one raid cohort and uses it even with a stale URL choice", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core&difficulty=Old&size=25"]}><LeaderboardsLiveHub /></MemoryRouter>)
    expect(html).not.toContain('aria-label="Raid cohort"')
    expect(html).toContain("Live overview")
  })
  it("offers a cohort selector when multiple raid populations are published", () => {
    const hook = vi.mocked(useRankingsInstances)
    const original = hook.getMockImplementation()!
    hook.mockImplementation(() => {
      const result = original()
      return { ...result, data: [...(result.data ?? []), {
        instance_name: "Molten Core", difficulty_name: "Heroic", max_players: 25, category: "raid", total_kills: 3, top_players: [],
      }] } as ReturnType<typeof useRankingsInstances>
    })
    try {
      const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core"]}><LeaderboardsLiveHub /></MemoryRouter>)
      expect(html).toContain('aria-label="Raid cohort"')
      expect(html).toContain("Heroic · 25 players")
    } finally {
      hook.mockImplementation(original)
    }
  })
  it("selects the published empty-difficulty zero-size cohort without treating its URL values as missing", () => {
    const hook = vi.mocked(useRankingsInstances)
    const original = hook.getMockImplementation()!
    hook.mockImplementation(() => {
      const result = original()
      return { ...result, data: [...(result.data ?? []), {
        instance_name: "Molten Core", difficulty_name: "", max_players: 0, category: "raid", total_kills: 3, top_players: [],
      }] } as ReturnType<typeof useRankingsInstances>
    })
    try {
      const selected = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core&difficulty=&size=0"]}><LeaderboardsLiveHub /></MemoryRouter>)
      expect(selected).toContain('<option value="|0" selected="">Default · 0 players</option>')
      const missing = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core"]}><LeaderboardsLiveHub /></MemoryRouter>)
      expect(missing).toContain('<option value="" selected="">Choose difficulty and size</option>')
    } finally {
      hook.mockImplementation(original)
    }
  })

  it("uses the Storybook landing grid with published cohorts", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2"]}><LeaderboardsLiveHub /></MemoryRouter>)
    expect(html).toContain("Molten Core")
    expect(html).toContain("12 recorded kills")
    expect(html).toContain('aria-label="Leaderboard section"')
    expect(html).not.toContain("Mock data for design review")
  })
})
