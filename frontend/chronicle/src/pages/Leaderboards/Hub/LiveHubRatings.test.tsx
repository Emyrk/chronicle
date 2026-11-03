import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi, type Mock } from "vitest"
import { useQueries } from "@tanstack/react-query"
import { RatingBoards } from "@/pages/Leaderboards/Ratings/RatingLeaderboard"
import { LiveGuildRatings } from "./LiveGuildRatings"
import { LiveHubRatings, type LiveHubRatingsProps } from "./LiveHubRatings"

vi.mock("@tanstack/react-query", () => ({ useQueries: vi.fn() }))
vi.mock("@/pages/Leaderboards/Ratings/RatingLeaderboard", () => ({ RatingBoards: vi.fn(() => null) }))
vi.mock("./LiveGuildRatings", () => ({ LiveGuildRatings: vi.fn(() => null) }))

const querySpy = useQueries as unknown as Mock
type QueryOptions = { queries: Array<{ queryKey?: readonly unknown[]; enabled?: boolean }> }

const cohort = { difficulty: "Normal", maxPlayers: 40, playerClass: "MAGE", spec: "Fire", subSpec: "", performance: "dps" as const }
const props: LiveHubRatingsProps = {
  instanceName: "Molten Core", bosses: ["Ragnaros"], scope: {}, onScope: vi.fn(),
  view: "peak", onView: vi.fn(), period: "180d", subject: "player", role: "dps",
  cls: "MAGE", spec: "Fire", subSpec: "", ratingCohort: cohort, realmIDs: ["realm-1"],
}
function render(extra: Partial<LiveHubRatingsProps> = {}) {
  return renderToStaticMarkup(<LiveHubRatings {...props} {...extra} />)
}

describe("LiveHubRatings", () => {
  it("feeds the actual RatingBoards with published entries and no invented total", () => {
    vi.clearAllMocks()
    querySpy.mockImplementation(({ queries }: QueryOptions) => queries.map(() => ({
      data: { entries: [{ realm_id: "realm-1", player_guid: "mage-1", player_name: "Actual Mage", guild_name: "Raid", realm_name: "Realm", player_class: "MAGE", player_spec: "Fire", player_sub_spec: "", score: 95 }] },
      isError: false,
    })))
    render()
    const boardProps = vi.mocked(RatingBoards).mock.calls[0][0]
    const state = boardProps.live!.board({ scope: {}, metric: "peak", period: "180d", cohort: boardProps.live!.cohort })
    expect(state.status).toBe("ready")
    if (state.status === "ready") {
      expect(state.data.entries[0].name).toBe("Actual Mage")
      expect(state.data.total).toBeUndefined()
    }
    expect(boardProps.live!.loadPage).toBeTypeOf("function")
    const options = querySpy.mock.calls[0][0] as QueryOptions
    expect(options.queries[0].queryKey?.[1]).toContain("realm_ids=realm-1")
    expect(options.queries[0].queryKey?.[1]).toContain("class=MAGE")
    expect(options.queries[0].queryKey?.[1]).toContain("max_players=40")
    expect(LiveGuildRatings).not.toHaveBeenCalled()
  })

  it("marks preview ranks unknown when realm display filters are active", () => {
    vi.clearAllMocks()
    querySpy.mockImplementation(({ queries }: QueryOptions) => queries.map(() => ({ isError: false })))
    render()
    expect(vi.mocked(RatingBoards).mock.calls[0][0].live?.ranksKnown).toBe(false)
    vi.clearAllMocks()
    render({ realmIDs: undefined })
    expect(vi.mocked(RatingBoards).mock.calls[0][0].live?.ranksKnown).toBe(true)
  })

  it("requests the exact default cohort in the full rating view", () => {
    vi.clearAllMocks()
    querySpy.mockImplementation(({ queries }: QueryOptions) => queries.map(() => ({ isError: false })))
    render({ ratingCohort: { ...cohort, difficulty: "", maxPlayers: 0 } })
    const queries = (querySpy.mock.calls[0][0] as QueryOptions).queries
    expect(queries[0].enabled).toBe(true)
    expect(queries[0].queryKey?.[1]).toContain("difficulty_name=&max_players=0")
    expect(queries[1].enabled).toBe(true)
    expect(RatingBoards).toHaveBeenCalled()
  })

  it("shows Peak and Mastery across all classes when no class/spec is chosen", () => {
    vi.clearAllMocks()
    querySpy.mockImplementation(({ queries }: QueryOptions) => queries.map((q) => ({
      isError: false, data: q.enabled ? { entries: [{ realm_id: "realm-1", player_guid: "mage-1", player_name: "Actual Mage", player_class: "MAGE", player_spec: "Arcane", player_sub_spec: "", score: 49 }] } : undefined,
    })))
    render({ scope: {}, cls: undefined, spec: undefined, subSpec: undefined,
      ratingCohort: { difficulty: "", maxPlayers: 0, performance: "dps" }, view: "overview" })
    const queries = (querySpy.mock.calls[0][0] as QueryOptions).queries
    expect(queries[0].enabled).toBe(true)
    expect(queries[0].queryKey?.[1]).toContain("all_classes=true")
    expect(queries[1].enabled).toBe(true)
    expect(queries[1].queryKey?.[1]).toContain("rating_metric=ranked_mastery")
    const board = vi.mocked(RatingBoards).mock.calls[0][0]
    expect(board.live!.board({ scope: {}, metric: "peak", period: "180d" }).status).toBe("ready")
    expect(board.live!.loadPage).toBeTypeOf("function")
    expect(LiveGuildRatings).not.toHaveBeenCalled()
  })

  it("does not broaden a mismatched class cohort", () => {
    vi.clearAllMocks()
    querySpy.mockImplementation(({ queries }: QueryOptions) => queries.map(() => ({ isError: false })))
    render({ scope: { cls: "PRIEST" } })
    const queries = (querySpy.mock.calls[0][0] as QueryOptions).queries
    expect(queries[0].enabled).toBe(false)
    expect(queries[1].enabled).toBe(false)
    expect(queries[2].enabled).toBe(true) // Renown does not require a class cohort.
    expect(vi.mocked(RatingBoards).mock.calls[0][0].live!.board({ scope: { cls: "PRIEST" }, metric: "peak", period: "180d" }).status).toBe("error")
  })

  it("keeps all-cohort Renown available without a class, spec or raid cohort", () => {
    vi.clearAllMocks()
    querySpy.mockImplementation(({ queries }: QueryOptions) => queries.map((q) => ({
      isError: false, data: q.enabled ? { entries: [{ realm_id: "realm-1", player_guid: "mage-1", player_name: "Actual Mage", player_class: "MAGE", player_spec: "Fire", player_sub_spec: "", score: 20 }] } : undefined,
    })))
    render({ view: "renown", scope: {}, ratingCohort: undefined, cls: undefined, spec: undefined })
    const board = vi.mocked(RatingBoards).mock.calls[0][0]
    expect(board.live!.board({ scope: {}, metric: "renown", period: "180d" }).status).toBe("ready")
    const urls = (querySpy.mock.calls[0][0] as QueryOptions).queries
    expect(urls[2].enabled).toBe(true)
    expect(urls[2].queryKey?.[1]).toContain("rating_metric=renown")
    expect(urls[0].enabled).toBe(false)
    expect(urls[1].enabled).toBe(false)
  })

  it("shows a published guild board rather than fixture-backed guild cards", () => {
    vi.clearAllMocks()
    querySpy.mockImplementation(({ queries }: QueryOptions) => queries.map(() => ({ isError: false })))
    render({ subject: "guild", view: "mastery" })
    expect(RatingBoards).not.toHaveBeenCalled()
    expect(vi.mocked(LiveGuildRatings).mock.calls[0][0]).toMatchObject({ view: "mastery", cohort, bosses: ["Ragnaros"] })
  })
})
