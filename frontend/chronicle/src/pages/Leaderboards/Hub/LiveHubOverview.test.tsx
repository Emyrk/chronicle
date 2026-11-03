import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useQueries, useQuery } from "@tanstack/react-query"
import { useRankingsEncounters, useRankingsInstances, useRankingsLeaderboard } from "@/api/rankingsQueries"
import { LiveHubOverview } from "./LiveHubOverview"

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn(), useQueries: vi.fn() }))
vi.mock("@/api/rankingsQueries", () => ({ useRankingsInstances: vi.fn(), useRankingsEncounters: vi.fn(), useRankingsLeaderboard: vi.fn() }))

const base = { instanceName: "Molten Core", selection: { kind: "bosses" as const, bosses: ["Ragnaros"] },
  subject: "player" as const, role: "dps" as const, cls: "MAGE", spec: "Frost", subSpec: "",
  onTab: vi.fn(), onBoss: vi.fn(), onRatings: vi.fn() }
const cohort = { difficulty: "", maxPlayers: 0 }
const ratingCohort = { ...cohort, playerClass: "MAGE", spec: "Frost", subSpec: "", performance: "dps" as const }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useRankingsEncounters).mockReturnValue({ isPending: false, isError: false, data: [] } as unknown as ReturnType<typeof useRankingsEncounters>)
  vi.mocked(useQueries).mockReturnValue([])
  vi.mocked(useRankingsInstances).mockReturnValue({ isPending: false, isError: false,
    data: [{ category: "raid", instance_name: "Molten Core", difficulty_name: "", max_players: 0 }] } as ReturnType<typeof useRankingsInstances>)
  vi.mocked(useQuery).mockReturnValue({ isPending: false, isError: false, data: { entries: [] } } as ReturnType<typeof useQuery>)
  vi.mocked(useRankingsLeaderboard).mockReturnValue({ isPending: false, isError: false, data: { entries: [] } } as unknown as ReturnType<typeof useRankingsLeaderboard>)
})

describe("LiveHubOverview exact default cohort", () => {
  it("requests exact zero-size and empty-difficulty ratings and performances", () => {
    const html = renderToStaticMarkup(<LiveHubOverview {...base} performanceCohort={cohort} ratingCohort={ratingCohort} />)
    const ratingCalls = vi.mocked(useQuery).mock.calls
    expect(ratingCalls[1][0].enabled).toBe(true)
    expect(String(ratingCalls[1][0].queryKey?.[1])).toContain("difficulty_name=&max_players=0")
    expect(ratingCalls[2][0].enabled).toBe(true)
    expect(vi.mocked(useRankingsLeaderboard).mock.calls[0][0]).toMatchObject({ difficulty_names: "", exact_cohort: true })
    expect(vi.mocked(useRankingsLeaderboard).mock.calls[0][0]).not.toHaveProperty("role")
    expect(vi.mocked(useRankingsLeaderboard).mock.calls[0][0].max_players).toBeUndefined()
    expect(vi.mocked(useRankingsLeaderboard).mock.calls[0][1]).toBe(true)
    expect(html).not.toContain("cannot be filtered")
  })

  it("requests speedruns filtered by the recorded zero-size cohort, not the player count", () => {
    renderToStaticMarkup(<LiveHubOverview {...base} selection={{ kind: "clear" }} performanceCohort={cohort} ratingCohort={ratingCohort} />)
    const options = vi.mocked(useQuery).mock.calls[3][0]
    expect(options.enabled).toBe(true)
    expect(String(options.queryKey)).toContain("0")
  })

  it("requests all-class Peak and Mastery when no class or spec is selected", () => {
    renderToStaticMarkup(<LiveHubOverview {...base} cls={undefined} spec={undefined} subSpec={undefined}
      performanceCohort={cohort} ratingCohort={{ ...cohort, performance: "dps" }} />)
    const calls = vi.mocked(useQuery).mock.calls
    expect(calls[1][0].enabled).toBe(true)
    expect(String(calls[1][0].queryKey?.[1])).toContain("all_classes=true")
    expect(calls[2][0].enabled).toBe(true)
    expect(String(calls[2][0].queryKey?.[1])).toContain("rating_metric=ranked_mastery")
  })

  it("fills per-boss rating rows from published boss boards", () => {
    vi.mocked(useRankingsEncounters).mockReturnValue({ isPending: false, isError: false,
      data: [{ encounter_name: "Ragnaros", total_kills: 12, top_dps: 1532.69 }] } as ReturnType<typeof useRankingsEncounters>)
    const entry = { player_guid: "mage-1", player_name: "Actual Mage", player_class: "MAGE", player_spec: "Frost", player_sub_spec: "", score: 42, realm_id: "realm-1" }
    vi.mocked(useQueries).mockReturnValue([{ data: { entries: [entry] } }, { data: { entries: [entry] } }, { data: { entries: [entry] } }] as ReturnType<typeof useQueries>)
    const html = renderToStaticMarkup(<LiveHubOverview {...base} cls={undefined} spec={undefined} subSpec={undefined}
      bosses={["Ragnaros"]} performanceCohort={cohort} ratingCohort={{ ...cohort, performance: "dps" }} />)
    const options = vi.mocked(useQueries).mock.calls[0][0] as unknown as { queries: { queryKey?: readonly unknown[] }[] }
    const urls = options.queries.map((query) => String(query.queryKey?.[1]))
    expect(urls).toHaveLength(3)
    expect(urls[0]).toContain("encounter_name=Ragnaros")
    expect(urls[0]).toContain("all_classes=true")
    expect(urls[1]).toContain("rating_metric=ranked_mastery")
    expect(urls[2]).toContain("rating_metric=renown")
    expect(html).toContain("Actual Mage")
    expect(html).toContain("1,533/s")
  })

  it("does not request Peak without a selected matching cohort", () => {
    renderToStaticMarkup(<LiveHubOverview {...base} ratingCohort={undefined} />)
    expect(vi.mocked(useQuery).mock.calls[1][0].enabled).toBe(false)
    vi.clearAllMocks()
    renderToStaticMarkup(<LiveHubOverview {...base} ratingCohort={{ ...ratingCohort, difficulty: "Heroic" }} />)
    expect(vi.mocked(useQuery).mock.calls[1][0].enabled).toBe(false)
  })
})
