import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { RankingsBoxPlotStats } from "@/api/typesGenerated"
import { useHubSummary, type HubSummary } from "./hubSummaryAdapter"
import type { HubLiveTabContext } from "./LeaderboardHub"
import { LiveHubOverview } from "./LiveHubOverview"
import { liveOverviewData } from "./liveOverviewData"

vi.mock("./hubSummaryAdapter", () => ({ useHubSummary: vi.fn() }))
vi.mock("@/api/rankingsQueries", () => {
  const idle = () => ({ isPending: false, isError: false, data: undefined })
  return { useRankingsStats: vi.fn(idle), useRankingsSuccessRates: vi.fn(idle), useRankingsKillTimes: vi.fn(idle), useRankingsKillTimeLeaderboard: vi.fn(idle) }
})

const entry = { player_guid: "mage-1", player_name: "Actual Mage", player_class: "MAGE", player_spec: "Frost", player_sub_spec: "", score: 42, peak_raw: 1311.6, realm_id: "realm-1", realm_name: "Turtle" }
const guild = { guild_id: "guild-1", guild_name: "Actual Guild", score: 15, realm_id: "realm-1", realm_name: "Turtle" }
const ratings = { player: { peak: [entry], ranked_mastery: [entry], renown: [entry] }, guild: { peak: [guild], ranked_mastery: [guild], renown: [guild] } }
const summary = {
  landing_previews: [], selected_cohort: { difficulty_name: "", max_players: 0 }, generation_id: null,
  instances: [{ category: "raid", instance_name: "Molten Core", difficulty_name: "", max_players: 0, total_kills: 12, top_players: [] }],
  encounters: [{ encounter_name: "Ragnaros", total_kills: 12, top_dps: 1532.69 }],
  ratings: { raid: ratings, bosses: [{ encounter_name: "Ragnaros", ...ratings }] },
  speedruns: [], realms: [], filters: [], progression_bosses: ["Ragnaros"], ranking_encounter_sets: [],
  performances: [{ id: "p1", player_guid: "war-1", player_name: "Actual Warrior", player_class: "WARRIOR", player_spec: "Fury", guild_name: "Actual Guild", dps: 1200.4, hps: 0 }],
} as unknown as HubSummary
const stat = (cls: string, spec: string, median: number): RankingsBoxPlotStats => ({ player_class: cls, player_spec: spec, min_dps: median - 100, q1_dps: median - 20, median_dps: median, q3_dps: median + 20, max_dps: median + 100, count: 30 })

const context = (over: Partial<HubLiveTabContext> = {}) => ({
  tab: "overview", instanceName: "Molten Core", realm: "All realms", scope: {}, role: "dps", subject: "characters",
  ratingView: "overview", statisticsView: "specs", period: "180d", selection: { kind: "full-clear" },
  onStatisticsView: vi.fn(), onView: vi.fn(), onPeriod: vi.fn(), setSelection: vi.fn(), onTab: vi.fn(), onRatings: vi.fn(),
  onStatistics: vi.fn(), onScope: vi.fn(), onRole: vi.fn(),
  overview: { kind: "raid", where: "Molten Core", noRole: false },
  ...over,
}) as HubLiveTabContext

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useHubSummary).mockReturnValue({ isPending: false, isError: false, data: summary } as ReturnType<typeof useHubSummary>)
})

describe("live Hub overview", () => {
  it("renders the Storybook Overview from the page summary without refetching it", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <LiveHubOverview context={context()} summary={summary} realmIDs={[]} bosses={["Ragnaros"]} />
      </MemoryRouter>,
    )
    expect(html).toContain("Actual Mage")
    expect(html).toContain("Guild Renown · Molten Core")
    expect(html).toContain("Actual Warrior")
    expect(html).toContain("1,533/s")
    // Peak carries the DPS behind it, on the ratings card and the boss cards.
    expect(html).toContain("1,312 dps")
    expect(html).toContain("1,312/s")
    expect(vi.mocked(useHubSummary).mock.calls[0][1]).toBe(false)
  })

  it("requests one exact summary for a class scope", () => {
    renderToStaticMarkup(
      <MemoryRouter>
        <LiveHubOverview context={context({ scope: { cls: "MAGE", spec: "Frost" }, role: "healing" })} summary={summary} realmIDs={[]} bosses={["Ragnaros"]} />
      </MemoryRouter>,
    )
    expect(vi.mocked(useHubSummary).mock.calls[0][0]).toMatchObject({ instanceName: "Molten Core", cohort: { difficulty: "", maxPlayers: 0 }, performance: "hps", cls: "MAGE", spec: "Frost" })
    expect(vi.mocked(useHubSummary).mock.calls[0][1]).toBe(true)
  })
})

describe("liveOverviewData", () => {
  const base = { summary, bosses: ["Ragnaros"], role: "dps" as const, subject: "characters" as const, unfiltered: true }

  it("ranks the class's specs among every spec, with their published leaders", () => {
    const data = liveOverviewData({ ...base, scope: { cls: "MAGE" }, stats: [stat("WARRIOR", "Fury", 900), stat("MAGE", "Frost", 800), stat("MAGE", "Fire", 700)] })
    expect(data.specSpreads?.map((s) => s.spec)).toEqual(["Fury", "Frost", "Fire"])
    expect(data.cohorts?.map((c) => [c.spec, c.rank, c.of, c.peak?.player.name])).toEqual([["Frost", 2, 3, "Actual Mage"], ["Fire", 3, 3, undefined]])
  })

  it("leaves unpublished slots empty rather than inventing them", () => {
    const data = liveOverviewData({ ...base, scope: {} })
    expect(data.specSpreads).toBeUndefined()
    expect(data.guildClears).toBeUndefined()
    expect(data.guildTimeSpreads).toBeUndefined()
    expect(data.bosses?.[0]).toMatchObject({ boss: "Ragnaros", kills: 12, topDps: 1532.69 })
  })

  it("hides unfiltered encounter totals behind a filter", () => {
    const data = liveOverviewData({ ...base, unfiltered: false, scope: {} })
    expect(data.bosses?.[0].kills).toBeUndefined()
    expect(data.bosses?.[0].topDps).toBeUndefined()
  })
})
