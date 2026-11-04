import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { HubSummary } from "@/api/typesGenerated"
import { setBoardPage, setBoardURL } from "@/pages/Leaderboards/Ratings/setBoard"
import { useHubSummary } from "./hubSummaryAdapter"
import { LiveHubRatings, type LiveHubRatingsProps } from "./LiveHubRatings"

vi.mock("./hubSummaryAdapter", () => ({ useHubSummary: vi.fn() }))
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { caught_up: false } }),
  useQueries: ({ queries }: { queries: unknown[] }) => queries.map(() => ({ isPending: false, isError: false, data: { rows: [], total: 0, page: 0, has_next_page: false } })),
}))

const player = (name: string, score: number, raw?: number) => ({ realm_id: "r", realm_name: "Nordanaar", player_guid: name, player_name: name, player_class: "MAGE", player_spec: "Fire", player_sub_spec: "", score, peak_raw: raw })
const board = (names: string[]) => ({ player: { peak: names.map((n, i) => player(n, 100 - i, 1300 - i)), ranked_mastery: [], renown: [] }, guild: { peak: [], ranked_mastery: [], renown: [] } })
const summary = { ratings: { raid: board(["Top", "Second"]), bosses: [{ encounter_name: "Ragnaros", ...board(["Rag"]) }, { encounter_name: "Lucifron", ...board(["Luc"]) }] } } as unknown as HubSummary

const props: LiveHubRatingsProps = {
  instanceName: "Molten Core", bosses: ["Lucifron", "Ragnaros"], selected: [], scope: {}, onScope: vi.fn(), view: "overview", onView: vi.fn(),
  period: "180d", subject: "player", role: "dps", cohort: { difficulty: "", maxPlayers: 0 }, where: "Molten Core",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useHubSummary).mockReturnValue({ isPending: false, isError: false, data: summary } as ReturnType<typeof useHubSummary>)
})

describe("live Ratings tab", () => {
  it("draws the board and a card per boss from one Ratings-depth summary, Peak with its DPS", () => {
    const html = renderToStaticMarkup(<LiveHubRatings {...props} />)
    expect(html).toContain("Catching up")
    expect(html).toContain("Top")
    expect(html).toContain('data-entity-kind="character"')
    expect(html).toContain('&quot;realm&quot;:&quot;Nordanaar&quot;')
    expect(html).toContain("1,300/s")
    expect(html).toContain("Rag")
    expect(html).toContain("Luc")
    expect(vi.mocked(useHubSummary)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(useHubSummary).mock.calls[0][0]).toMatchObject({ instanceName: "Molten Core", encounters: [], bossDepth: 3, window: "period" })
  })

  it("asks for the hand-picked bosses and the all-time window", () => {
    renderToStaticMarkup(<LiveHubRatings {...props} selected={["Lucifron", "Ragnaros"]} period="all" />)
    expect(vi.mocked(useHubSummary).mock.calls[0][0]).toMatchObject({ encounters: ["Lucifron", "Ragnaros"], window: "all" })
  })

  it("says so instead of loading without a published raid cohort", () => {
    const html = renderToStaticMarkup(<LiveHubRatings {...props} view="peak" cohort={undefined} />)
    expect(html).toContain("No published raid cohort")
  })
})

describe("set board client", () => {
  it("builds one canonical URL per page and maps rows with all three scores", () => {
    const url = new URL(setBoardURL({ instanceName: "Molten Core", encounters: ["Lucifron", "Ragnaros"], subject: "player", metric: "mastery", period: "all",
      cohort: { difficulty: "", maxPlayers: 0 }, performance: "dps", cls: "MAGE", spec: "Fire", realmIDs: ["b", "a"], query: " zed ", page: 2, limit: 50 }), "http://x")
    expect(url.pathname).toBe("/api/v1/rankings/ratings/set-board")
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ encounter_names: "Lucifron,Ragnaros", rating_metric: "mastery", window: "all",
      class: "MAGE", spec: "Fire", realm_ids: "a,b", query: "zed", page: "2", max_players: "0", difficulty_name: "" })
    const page = setBoardPage({ rows: [{ rank: 7, realm_id: "r", realm_name: "R", subject_id: "g", name: "Zed", guild_name: "G", player_class: "MAGE",
      player_spec: "Fire", player_sub_spec: "", score: 80, peak: 90, mastery: 80, renown: 12, peak_raw: 1500 }], total: 40, page: 2, has_next_page: true }, "mastery")
    expect(page.rows[0].rank).toBe(7)
    expect(page.rows[0].scores?.peak?.raw).toBe(1500)
    expect(page.rows[0].entry.raw).toBeUndefined()
    expect(page.rows[0].entry).toMatchObject({ realm: "R", guid: "g" })
    expect(page.hasPreviousPage && page.hasNextPage).toBe(true)
    const withParts = setBoardPage({ rows: [{ rank: 1, realm_id: "r", realm_name: "R", subject_id: "g", name: "Zed", guild_name: "", player_class: "MAGE",
      player_spec: "Fire", player_sub_spec: "", score: 80, peak: 90, mastery: 80, renown: 0, mastery_parts: { peak: 91, form: 82, floor: 60, eligible_kills: 7 } }],
      total: 1, page: 0, has_next_page: false }, "mastery")
    expect(withParts.rows[0].entry.publishedMastery).toEqual({ peak: 91, form: 82, floor: 60, eligibleKills: 7 })
  })
})
