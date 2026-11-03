import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { useQueries, useQuery } from "@tanstack/react-query"
import { LiveGuildRatings } from "./LiveGuildRatings"

vi.mock("@tanstack/react-query", () => ({ useQueries: vi.fn(), useQuery: vi.fn() }))

const cohort = { difficulty: "", maxPlayers: 0 }
const props = { instanceName: "Molten Core", bosses: ["Ragnaros"], view: "overview" as const,
  period: "180d" as const, cohort, onView: vi.fn(), onBoss: vi.fn() }

describe("live guild ratings", () => {
  it("uses the Storybook board with published guild metric previews", () => {
    vi.mocked(useQueries).mockReturnValue(Array.from({ length: 6 }, () => ({ data: { entries: [{ guild_id: "guild-1", guild_name: "Actual Guild", realm_id: "realm-1", score: 82 }] } })) as ReturnType<typeof useQueries>)
    vi.mocked(useQuery).mockReturnValue({ isPending: true } as ReturnType<typeof useQuery>)
    const html = renderToStaticMarkup(<LiveGuildRatings {...props} />)
    expect(html).toContain("Actual Guild")
    expect(html).toContain("By boss")
    expect(html).not.toContain("Browse published ratings")
    const options = vi.mocked(useQueries).mock.calls[0][0] as unknown as { queries: { queryKey: unknown[] }[] }
    expect(String(options.queries[0].queryKey[1])).toContain("max_players=0")
    expect(String(options.queries[1].queryKey[1])).toContain("rating_metric=mastery")
  })

  it("renders published full-list rows in the selected boss table", () => {
    vi.clearAllMocks()
    vi.mocked(useQueries).mockReturnValue(Array.from({ length: 3 }, () => ({ data: { entries: [] } })) as ReturnType<typeof useQueries>)
    vi.mocked(useQuery).mockReturnValue({ isPending: false, isError: false, data: { total: 30, page: 0, has_next_page: true,
      rows: [{ rank: 9, entry: { guild_id: "guild-1", guild_name: "Actual Guild", realm_id: "realm-1", realm_name: "Realm", score: 82 }, scores: { peak: 82, mastery: 61, renown: 4 } }] } } as ReturnType<typeof useQuery>)
    const html = renderToStaticMarkup(<LiveGuildRatings {...props} encounterName="Ragnaros" />)
    expect(html).toContain("Actual Guild")
    expect(html).toContain("30 guilds match")
    const options = vi.mocked(useQuery).mock.calls[0][0] as unknown as { queryKey: unknown[]; enabled: boolean }
    expect(String(options.queryKey[1])).toContain("/guild-full-list?")
    expect(options.enabled).toBe(true)
  })
})
