import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useRankingsLeaderboard } from "@/api/rankingsQueries"
import { useHubSummary, type HubSummary } from "./Hub/hubSummaryAdapter"
import { LeaderboardsLiveHub } from "./LeaderboardsLiveHub"

const summary = { landing_previews: [], instances: [{ instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, category: "raid", total_kills: 12, top_players: [] }],
  realms: [{ id: "realm-id", name: "Nordanaar" }], encounters: [
    { encounter_name: "Ragnaros", total_kills: 12, top_dps: 1450 },
    { encounter_name: "Gehennas", total_kills: 10, top_dps: 1300 },
    { encounter_name: "Trash", total_kills: 25, top_dps: 1200 },
  ], filters: [{ player_class: "MAGE", specs: [{ spec: "Frost", sub_specs: [""] }] }],
  progression_bosses: ["Ragnaros"], ranking_encounter_sets: [{ id: "", label: "Default", encounters: ["Ragnaros"] }],
  selected_cohort: { difficulty_name: "Normal", max_players: 40 }, generation_id: null,
  ratings: { raid: { player: { peak: [], ranked_mastery: [], renown: [] }, guild: { peak: [], ranked_mastery: [], renown: [] } }, bosses: [] },
  performances: [], speedruns: [],
} as HubSummary
vi.mock("./Hub/hubSummaryAdapter", () => ({ useHubSummary: vi.fn() }))
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [], isPending: false, isError: false }) }))
vi.mock("@/api/rankingsQueries", () => ({
  useRankingsLeaderboard: vi.fn(() => ({ data: { entries: [] }, isPending: false, isError: false })),
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

function setSummary(data: HubSummary) {
  vi.mocked(useHubSummary).mockReturnValue({ data, isPending: false, isError: false } as ReturnType<typeof useHubSummary>)
}

describe("live Storybook Hub", () => {
  beforeEach(() => { vi.clearAllMocks(); setSummary(summary) })
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
    expect(useHubSummary).toHaveBeenCalledTimes(1)
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
    setSummary({ ...summary, selected_cohort: null, instances: [...summary.instances, {
      ...summary.instances[0], difficulty_name: "Heroic", max_players: 25,
    }] })
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core"]}><LeaderboardsLiveHub /></MemoryRouter>)
    expect(html).toContain('aria-label="Raid cohort"')
    expect(html).toContain("Heroic · 25 players")
  })
  it("selects the URL's published empty-difficulty zero-size cohort, else the summary's resolved one", () => {
    setSummary({ ...summary, instances: [...summary.instances, {
      ...summary.instances[0], difficulty_name: "", max_players: 0,
    }] })
    const selected = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core&difficulty=&size=0"]}><LeaderboardsLiveHub /></MemoryRouter>)
    expect(selected).toContain('<option value="|0" selected="">Default · 0 players</option>')
    // Without a URL choice the summary's resolved (busiest) cohort is selected, not an empty prompt.
    const missing = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core"]}><LeaderboardsLiveHub /></MemoryRouter>)
    expect(missing).toContain('<option value="Normal|40" selected="">Normal · 40 players</option>')
  })
  it("requests all-role performances without a zero-size URL parameter", () => {
    setSummary({ ...summary, instances: [{ ...summary.instances[0], difficulty_name: "", max_players: 0 }],
      selected_cohort: { difficulty_name: "", max_players: 0 } })
    renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2?instance=Molten+Core&tab=performances"]}><LeaderboardsLiveHub /></MemoryRouter>)
    const [params, enabled] = vi.mocked(useRankingsLeaderboard).mock.calls[0]
    expect(enabled).toBe(true)
    expect(params).toMatchObject({ instance_names: "Molten Core", difficulty_names: "", exact_cohort: true, metric: "dps" })
    expect(params.role).toBeUndefined()
    expect(params.max_players).toBeUndefined()
  })

  it("uses the Storybook landing grid with published cohorts", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboard-v2"]}><LeaderboardsLiveHub /></MemoryRouter>)
    expect(html).toContain("Molten Core")
    expect(html).toContain("12 recorded kills")
    expect(html).toContain('aria-label="Leaderboard section"')
    expect(html).not.toContain("Mock data for design review")
    expect(useHubSummary).toHaveBeenCalledTimes(1)
  })
})
