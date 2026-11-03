import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useQuery } from "@tanstack/react-query"
import { useRankingsInstances, useRankingsLeaderboard } from "@/api/rankingsQueries"
import { LiveOverview, type LiveOverviewProps } from "./LiveOverview"

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }))
vi.mock("@/api/rankingsQueries", () => ({ useRankingsInstances: vi.fn(), useRankingsLeaderboard: vi.fn() }))

const raids = [
  { category: "raid", instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, total_kills: 1234 },
  { category: "raid", instance_name: "Molten Core", difficulty_name: "Heroic", max_players: 25, total_kills: 57 },
  { category: "dungeon", instance_name: "Blackrock Depths", difficulty_name: "Normal", max_players: 5, total_kills: 9999 },
]
const base: LiveOverviewProps = {
  instanceName: "Molten Core", selection: { kind: "clear" }, subject: "player", role: "dps", onOpenTab: vi.fn(),
}
function mockState(state: { summary?: Record<string, unknown>; performances?: Record<string, unknown>; ratings?: Record<string, unknown> } = {}) {
  vi.mocked(useRankingsInstances).mockReturnValue({ isPending: false, isError: false, data: raids, ...state.summary } as ReturnType<typeof useRankingsInstances>)
  vi.mocked(useRankingsLeaderboard).mockReturnValue({ isPending: false, isError: false, data: { entries: [], total_count: 0 }, ...state.performances } as unknown as ReturnType<typeof useRankingsLeaderboard>)
  vi.mocked(useQuery).mockReturnValue({ isPending: false, isError: false, data: { entries: [] }, ...state.ratings } as unknown as ReturnType<typeof useQuery>)
}
function render(props: Partial<LiveOverviewProps> = {}) { return renderToStaticMarkup(<LiveOverview {...base} {...props} />) }

beforeEach(() => { vi.clearAllMocks(); mockState() })

describe("LiveOverview", () => {
  it("keeps raid cohorts separate and uses the published all-cohort Renown board with display-only realm IDs", () => {
    mockState({ ratings: { data: { entries: [{ realm_id: "realm-1", player_guid: "guid-1", player_name: "Live priest", player_class: "PRIEST", score: 921 }] } } })
    const markup = render({ realmIDs: ["realm-1"] })
    expect(markup).toContain("1,234")
    expect(markup).toContain("57")
    expect(markup).not.toContain("9,999")
    expect(markup).not.toContain("1,291")
    expect(markup).toContain("Live priest")
    expect(markup).toContain("All published cohorts")
    const options = vi.mocked(useQuery).mock.calls[0][0]
    expect(options.enabled).toBe(true)
    expect(options.queryKey?.[1]).toContain("rating_metric=renown")
    expect(options.queryKey?.[1]).toContain("realm_ids=realm-1")
    expect(vi.mocked(useRankingsLeaderboard).mock.calls[0][1]).toBe(false)
  })

  it("requests Peak only for an explicit exact published player cohort and never silently broadens it", () => {
    const cohort = { difficulty: "Normal", maxPlayers: 40, playerClass: "MAGE", spec: "Fire", subSpec: "", performance: "dps" as const }
    render({ ratingCohort: cohort, selection: { kind: "bosses", bosses: ["Ragnaros"] } })
    const request = String(vi.mocked(useQuery).mock.calls[0][0].queryKey?.[1])
    expect(request).toContain("rating_metric=peak")
    expect(request).toContain("encounter_name=Ragnaros")
    expect(request).toContain("max_players=40")
    expect(request).toContain("class=MAGE")
    expect(request).toContain("spec=Fire")
    vi.clearAllMocks()
    const invalid = render({ ratingCohort: { ...cohort, difficulty: "Mythic" } })
    expect(invalid).toContain("Choose an exact difficulty")
    expect(vi.mocked(useQuery).mock.calls[0][0].enabled).toBe(false)
    vi.clearAllMocks()
    expect(render({ ratingCohort: cohort, cls: "PRIEST" })).toContain("Choose an exact difficulty")
    expect(vi.mocked(useQuery).mock.calls[0][0].enabled).toBe(false)
  })

  it("uses an exact boss, raid population, role and realm for performances", () => {
    mockState({ performances: { data: { entries: [{ id: "log-1", player_name: "Live mage", player_class: "MAGE", hps: 654 }], total_count: 1 } } })
    const markup = render({ selection: { kind: "bosses", bosses: ["Ragnaros"] }, performanceCohort: { difficulty: "Normal", maxPlayers: 40 }, role: "healing", realmName: "Nordanaar" })
    expect(vi.mocked(useRankingsLeaderboard).mock.calls[0]).toEqual([{
      instance_names: "Molten Core", encounter_names: "Ragnaros", class: undefined, spec: undefined, sub_spec: undefined,
      difficulty_names: "Normal", max_players: 40, role: "heal", metric: "hps", realm_names: "Nordanaar", limit: 3,
    }, true])
    expect(markup).toContain("Live mage")
    expect(markup).toContain("654 hps")
    expect(markup).toContain("40 players")
  })

  it("disables unsupported boss sets, missing raid populations, dungeons, and guild performances", () => {
    const multi = render({ selection: { kind: "bosses", bosses: ["Garr", "Ragnaros"] }, performanceCohort: { difficulty: "Normal", maxPlayers: 40 } })
    expect(multi).toContain("Combined boss selections have no published rating board")
    expect(vi.mocked(useQuery).mock.calls[0][0].enabled).toBe(false)
    expect(vi.mocked(useRankingsLeaderboard).mock.calls[0][1]).toBe(false)
    expect(render({ selection: { kind: "bosses", bosses: ["Ragnaros"] } })).toContain("Choose a published raid difficulty")
    expect(render({ subject: "guild", selection: { kind: "bosses", bosses: ["Ragnaros"] }, performanceCohort: { difficulty: "Normal", maxPlayers: 40 } })).toContain("not available in guild view")
    mockState({ summary: { data: raids } })
    expect(render({ instanceName: "Blackrock Depths" })).toContain("Overview only covers raids")
    expect(vi.mocked(useQuery).mock.lastCall?.[0].enabled).toBe(false)
  })

  it("distinguishes loading, error and empty states for summary, ratings and performances", () => {
    mockState({ summary: { isPending: true, data: undefined } })
    expect(render()).toContain("Loading raid overview")
    mockState({ summary: { isPending: false, isError: true, data: undefined } })
    expect(render()).toContain("Could not load raid overview")
    mockState({ ratings: { isPending: true, data: undefined } })
    expect(render()).toContain("Loading published ratings")
    mockState({ ratings: { isError: true, data: undefined } })
    expect(render()).toContain("Could not load published ratings")
    mockState()
    expect(render()).toContain("No published scores")
    mockState({ performances: { isPending: true, data: undefined } })
    expect(render({ selection: { kind: "bosses", bosses: ["Ragnaros"] }, performanceCohort: { difficulty: "Normal", maxPlayers: 40 } })).toContain("Loading performances")
    mockState({ performances: { isError: true, data: undefined } })
    expect(render({ selection: { kind: "bosses", bosses: ["Ragnaros"] }, performanceCohort: { difficulty: "Normal", maxPlayers: 40 } })).toContain("Could not load performances")
  })
})
