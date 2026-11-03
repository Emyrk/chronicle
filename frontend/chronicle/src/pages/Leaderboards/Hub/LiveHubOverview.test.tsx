import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useQuery } from "@tanstack/react-query"
import { useRankingsInstances, useRankingsLeaderboard } from "@/api/rankingsQueries"
import { LiveHubOverview } from "./LiveHubOverview"

vi.mock("@tanstack/react-query", () => ({ useQuery: vi.fn() }))
vi.mock("@/api/rankingsQueries", () => ({ useRankingsInstances: vi.fn(), useRankingsEncounters: () => ({ data: [] }), useRankingsLeaderboard: vi.fn() }))

const base = { instanceName: "Molten Core", selection: { kind: "bosses" as const, bosses: ["Ragnaros"] },
  subject: "player" as const, role: "dps" as const, cls: "MAGE", spec: "Frost", subSpec: "",
  onTab: vi.fn(), onBoss: vi.fn(), onRatings: vi.fn() }
const cohort = { difficulty: "", maxPlayers: 0 }
const ratingCohort = { ...cohort, playerClass: "MAGE", spec: "Frost", subSpec: "", performance: "dps" as const }

beforeEach(() => {
  vi.clearAllMocks()
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
    expect(vi.mocked(useRankingsLeaderboard).mock.calls[0][0]).toMatchObject({ difficulty_names: "", max_players: 0, exact_cohort: true })
    expect(vi.mocked(useRankingsLeaderboard).mock.calls[0][1]).toBe(true)
    expect(html).not.toContain("cannot be filtered")
  })

  it("requests speedruns filtered by the recorded zero-size cohort, not the player count", () => {
    renderToStaticMarkup(<LiveHubOverview {...base} selection={{ kind: "clear" }} performanceCohort={cohort} ratingCohort={ratingCohort} />)
    const options = vi.mocked(useQuery).mock.calls[3][0]
    expect(options.enabled).toBe(true)
    expect(String(options.queryKey)).toContain("0")
  })

  it("does not request Peak without a selected matching cohort", () => {
    renderToStaticMarkup(<LiveHubOverview {...base} ratingCohort={undefined} />)
    expect(vi.mocked(useQuery).mock.calls[1][0].enabled).toBe(false)
    vi.clearAllMocks()
    renderToStaticMarkup(<LiveHubOverview {...base} ratingCohort={{ ...ratingCohort, difficulty: "Heroic" }} />)
    expect(vi.mocked(useQuery).mock.calls[1][0].enabled).toBe(false)
  })
})
