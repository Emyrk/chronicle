import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { LeaderboardsV2 } from "./LeaderboardsV2"

vi.mock("@/api/rankingsQueries", () => ({
  useRankingsInstances: () => ({ data: [{ instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, category: "raid", total_kills: 123, top_players: [] }], isPending: false, isError: false }),
  useRankingsFilters: () => ({ data: [{ player_class: "MAGE", specs: [{ spec: "Frost", sub_specs: [""] }] }], isPending: false, isError: false }),
  useRankingsEncounters: () => ({ data: [{ encounter_name: "Ragnaros", total_kills: 12, top_dps: 1400 }], isPending: false, isError: false }),
}))
vi.mock("@/api/queries", () => ({
  useRealms: () => ({ data: [{ id: "realm-id", name: "Nordanaar" }], isPending: false, isError: false, isSuccess: true }),
}))
vi.mock("./Hub/LiveOverview", () => ({ LiveOverview: ({ instanceName, selection, subject, role, realmIDs, realmName, performanceCohort }: { instanceName: string; selection: { kind: string; bosses?: string[] }; subject: string; role: string; realmIDs: string[]; realmName?: string; performanceCohort?: { difficulty: string; maxPlayers: number } }) => <p>{[instanceName, selection.bosses?.[0] ?? "raid", subject, role, performanceCohort?.difficulty ?? "no cohort", performanceCohort?.maxPlayers, realmIDs.join(","), realmName].filter(Boolean).join(" / ")}</p> }))
vi.mock("./Hub/LivePerformances", () => ({ LivePerformances: ({ instanceName, selection, realmName }: { instanceName: string; selection: { bosses: string[] }; realmName?: string }) => <p>{instanceName} / {selection.bosses[0]} / {realmName ?? "All realms"}</p> }))
vi.mock("./Ratings/LiveRatingBoards", () => ({ LiveRatingBoards: ({ instanceName, encounterName, subject, metric, window, cohort, realmIDs, realmNames }: { instanceName: string; encounterName?: string; subject: string; metric: string; window: string; cohort?: { difficulty: string; maxPlayers: number; playerClass?: string; spec?: string; performance?: string }; realmIDs?: string[]; realmNames?: Record<string, string> }) => <p>{[instanceName, encounterName ?? "raid", subject, metric, window, cohort?.difficulty, cohort?.maxPlayers, cohort?.playerClass, cohort?.spec, cohort?.performance, realmIDs?.join(","), realmNames?.["realm-id"]].filter(Boolean).join(" / ")}</p> }))
vi.mock("@/components/Ads/AdRailStack", () => ({ AdRailStack: () => null }))

describe("production leaderboards hub", () => {
  it("uses published instance data and preserves tab/realm URL selection in card links", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboards?tab=ratings&realm_ids=realm-id"]}><LeaderboardsV2 /></MemoryRouter>)
    expect(html).toContain("Molten Core")
    expect(html).toContain("123 recorded kills")
    expect(html).toContain("Ratings realms: Nordanaar")
    expect(html).toContain("tab=ratings&amp;realm_ids=realm-id&amp;instance=Molten+Core")
    expect(html).toContain('href="/leaderboards/statistics"')
    expect(html).toContain('href="/leaderboards/speedruns"')
    expect(html).toContain('href="/leaderboards/parsing"')
    expect(html).toContain('href="/leaderboards/rulesets"')
    expect(html).not.toContain("Mock data for design review")
  })

  it("uses live overview with raid Renown by default, never an arbitrary cohort", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboards?instance=Molten+Core"]}><LeaderboardsV2 /></MemoryRouter>)
    expect(html).toContain("Molten Core / raid / player / dps / no cohort")
    expect(html).toContain('aria-label="Overview raid cohort"')
    expect(html).toContain('value="" selected=""')
    expect(html).toContain('aria-label="Encounters"')
  })

  it("passes URL-selected raid cohort, boss, subject, role and realm to overview", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboards?tab=overview&instance=Molten+Core&encounter=Ragnaros&subject=guild&role=healing&difficulty=Normal&size=40&realm_ids=realm-id"]}><LeaderboardsV2 /></MemoryRouter>)
    expect(html).toContain("Molten Core / Ragnaros / guild / healing / Normal / 40 / realm-id / Nordanaar")
    expect(html).toContain("Overview realm: Nordanaar")
    expect(html).toContain('aria-label="Overview subject"')
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*title="Show Ragnaros ratings"/)
  })

  it("renders only a published exact boss and resolves its selected realm name", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboards?tab=performances&instance=Molten+Core&encounter=Ragnaros&realm_ids=realm-id"]}><LeaderboardsV2 /></MemoryRouter>)
    expect(html).toContain("Molten Core / Ragnaros / Nordanaar")
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*title="Show Ragnaros ratings"/)
    expect(html).toContain('aria-label="Encounters"')
    expect(html).toContain("Performance realm: Nordanaar")
  })

  it("passes an exact boss, guild cohort, all-time window and display-only realm IDs to live ratings", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboards?tab=ratings&instance=Molten+Core&encounter=Ragnaros&subject=guild&rating_metric=peak&rating_window=all_time&realm_ids=realm-id"]}><LeaderboardsV2 /></MemoryRouter>)
    expect(html).toContain("Molten Core / Ragnaros / guild / peak / all_time / Normal / 40 / realm-id / Nordanaar")
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*title="Show Ragnaros ratings"/)
    expect(html).toContain('value="guild" selected=""')
    expect(html).not.toContain('aria-label="Rating class"')
  })

  it("passes an exact player class/spec/performance cohort for raid ratings", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboards?tab=ratings&instance=Molten+Core&rating_metric=mastery&realm_ids=realm-id"]}><LeaderboardsV2 /></MemoryRouter>)
    expect(html).toContain("Molten Core / raid / player / mastery / period / Normal / 40 / MAGE / Frost / dps / realm-id / Nordanaar")
    expect(html).toContain('aria-label="Rating class"')
    expect(html).toContain('aria-label="Rating sub-spec"')
  })

  it("uses live encounter names, with raid selected and multi-boss aggregation disabled", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboards?tab=ratings&instance=Molten+Core"]}><LeaderboardsV2 /></MemoryRouter>)
    expect(html).toContain('aria-label="Encounters"')
    expect(html).toContain("Ragnaros")
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*title="Whole-raid runs/)
    expect(html).not.toContain("Ctrl+Click")
    expect(html).not.toContain("All bosses")
    expect(html).not.toContain('aria-label="Rating encounter"')
  })

  it("rejects a boss not offered by live encounters", () => {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={["/leaderboards?tab=performances&instance=Molten+Core&encounter=Not+Published"]}><LeaderboardsV2 /></MemoryRouter>)
    expect(html).toContain("Select a boss for exact-kill performances")
    expect(html).not.toContain("Molten Core / Not Published")
  })
})
