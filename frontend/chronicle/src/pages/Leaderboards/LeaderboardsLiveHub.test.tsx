import { useLandingHighlights } from "./Hub/landingHighlights"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useRankingsLeaderboard } from "@/api/rankingsQueries"
import { useHubSummary, type HubSummary } from "./Hub/hubSummaryAdapter"
import { useSiteConfig } from "@/api/queries"
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
vi.mock("./Hub/landingHighlights", async (importOriginal) => ({
  ...await importOriginal<typeof import("./Hub/landingHighlights")>(),
  useLandingHighlights: vi.fn(),
}))
vi.mock("./Hub/hubSummaryAdapter", () => ({ useHubSummary: vi.fn() }))
vi.mock("@tanstack/react-query", () => ({ keepPreviousData: undefined, useQuery: () => ({ data: [], isPending: false, isError: false }) }))
vi.mock("@/api/rankingsQueries", () => ({
  useRankingsLeaderboard: vi.fn(() => ({ data: { entries: [] }, isPending: false, isError: false })),
  useRankingsStats: () => ({ data: [], isPending: false, isError: false }),
  useRankingsClearTimes: () => ({ data: [], isPending: false, isError: false }),
  useRankingsKillTimes: () => ({ data: [], isPending: false, isError: false }),
  useRankingsKillTimesByBoss: () => ({ data: { entries: [], total_count: 0 }, isPending: false, isError: false }),
  useRankingsSuccessRates: () => ({ data: [], isPending: false, isError: false }),
  useParseScoreSpreads: () => ({ data: { available: false, spreads: [] }, isPending: false, isError: false }),
  useTimeParseSpreads: () => ({ data: { spreads: [] }, isPending: false, isError: false }),
}))
vi.mock("@/api/queries", () => ({
  useSiteConfig: vi.fn(() => ({ data: { root_tenant_ratings_disabled: false }, isPending: false, isError: false })),
  useSupportedInstances: () => ({ data: [{ name: "Molten Core", category: "raid", raid_progression_order: 100 }] }),
  useRealms: () => ({ data: [{ id: "realm-id", name: "Nordanaar" }], isPending: false, isError: false }),
  useSupportedInstanceProgressionBosses: () => ({ data: new Map([["Molten Core", new Set(["Ragnaros"])]]), isPending: false, isError: false }),
  useSupportedInstanceRankingEncounterSets: () => ({ data: new Map([["Molten Core", [{ id: "", label: "Default", encounters: ["Ragnaros"] }]]]), isPending: false, isError: false }),
}))
vi.mock("@/components/Ads/AdRailStack", () => ({ AdRailStack: () => null }))
vi.mock("./Hub/LiveHubRatings", () => ({ LiveHubRatings: ({ view, subject }: { view: string; subject: string }) => <p>Live ratings {view} {subject}</p> }))
vi.mock("./Hub/LiveHubOverview", () => ({ LiveHubOverview: () => <p>Live overview</p> }))

function setSummary(data: HubSummary) {
  vi.mocked(useHubSummary).mockReturnValue({ data, isPending: false, isError: false } as ReturnType<typeof useHubSummary>)
}

/** The hub at a URL, through the app's routes so the tab path segment is read. */
function hub(url: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/leaderboards" element={<LeaderboardsLiveHub />} />
        <Route path="/leaderboards/:segment" element={<LeaderboardsLiveHub />} />
        <Route path="/leaderboards/:instance/:tab" element={<LeaderboardsLiveHub />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("live Storybook Hub", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useSiteConfig).mockReturnValue({ data: { root_tenant_ratings_disabled: false }, isPending: false, isError: false } as ReturnType<typeof useSiteConfig>)
    vi.mocked(useLandingHighlights).mockReturnValue({ data: undefined, isFetching: true, isError: false, refetch: vi.fn() } as unknown as ReturnType<typeof useLandingHighlights>)
    setSummary(summary)
  })
  it("fetches only the exact supported landing realm scope", () => {
    hub("/leaderboards")
    expect(useLandingHighlights).toHaveBeenLastCalledWith(undefined, undefined, true)
    hub("/leaderboards?realm_ids=realm-id")
    expect(useLandingHighlights).toHaveBeenLastCalledWith(undefined, "realm-id", true)
    hub("/leaderboards/Molten-Core")
    expect(useLandingHighlights).toHaveBeenLastCalledWith(undefined, undefined, false)
  })
  it("rejects multiple and unknown landing realms while leaving the selector available", () => {
    for (const ids of ["realm-id,other", "unknown"]) {
      const html = hub(`/leaderboards?realm_ids=${ids}`)
      expect(html).toContain("Choose All realms or one realm to view highlights")
      expect(html).toContain("Realm: Select a realm")
      expect(html).not.toContain("No published highlights")
      expect(vi.mocked(useLandingHighlights).mock.calls.at(-1)?.[2]).toBe(false)
    }
  })
  it("honors backend unsupported scope rather than treating its empty arrays as pending", () => {
    vi.mocked(useLandingHighlights).mockReturnValue({ data: { status: "unsupported_scope", landing_previews: [], snapshots: [] }, isFetching: false, isError: false } as unknown as ReturnType<typeof useLandingHighlights>)
    const html = hub("/leaderboards")
    expect(html).toContain("Choose All realms or one realm to view highlights")
    expect(html).not.toContain("Highlights awaiting refresh")
  })
  it("shows loading or fetch failure instead of published empty", () => {
    expect(hub("/leaderboards")).toContain("Loading highlights")
    vi.mocked(useLandingHighlights).mockReturnValue({ data: undefined, isFetching: false, isError: true, refetch: vi.fn() } as unknown as ReturnType<typeof useLandingHighlights>)
    const html = hub("/leaderboards")
    expect(html).toContain("Highlights could not be refreshed")
    expect(html).toContain("Try again")
    expect(html).not.toContain("No qualifying highlights")
    expect(html).not.toContain("No published highlights")
  })
  it("keeps prior snapshot data visible on a same-scope refetch failure", () => {
    vi.mocked(useLandingHighlights).mockReturnValue({ data: { status: "ready", landing_previews: [], snapshots: [{
      instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, status: "empty",
      configuration_fingerprint: "policy", refreshed_at: "2026-11-09T12:00:00Z",
    }] }, isFetching: false, isError: true, refetch: vi.fn() } as unknown as ReturnType<typeof useLandingHighlights>)
    const html = hub("/leaderboards")
    expect(html).toContain("Showing the last loaded highlights")
    expect(html).toContain("No qualifying highlights")
    expect(html).toContain("2026-11-09T12:00:00Z")
  })
  it("keeps the hub frame with an error card when the first summary load fails", () => {
    vi.mocked(useHubSummary).mockReturnValue({ data: undefined, isPending: false, isError: true, isFetching: false, refetch: vi.fn() } as unknown as ReturnType<typeof useHubSummary>)
    for (const url of ["/leaderboards", "/leaderboards/Molten-Core/ratings"]) {
      const html = hub(url)
      expect(html).toContain("Could not load leaderboards")
      expect(html).toContain("Try again")
      expect(html).toContain("Ratings")
      expect(html).not.toContain("Could not load leaderboard summary.")
    }
  })
  it("shows the legacy root message and skips rating queries when root ratings are disabled", () => {
    vi.mocked(useSiteConfig).mockReturnValue({ data: { root_tenant_ratings_disabled: true }, isPending: false, isError: false } as ReturnType<typeof useSiteConfig>)
    const html = hub("/leaderboards/ratings")
    expect(html).toContain("Visit a specific server to see ratings")
    expect(vi.mocked(useHubSummary).mock.calls.at(-1)?.[1]).toBe(false)
  })

  it("keeps ratings available for a specific tenant when root ratings are disabled", () => {
    vi.mocked(useSiteConfig).mockReturnValue({ data: { tenant: {}, root_tenant_ratings_disabled: true }, isPending: false, isError: false } as ReturnType<typeof useSiteConfig>)
    const html = hub("/leaderboards/Molten-Core/ratings")
    expect(html).toContain("Live ratings")
    expect(html).not.toContain("Visit a specific server to see ratings")
    expect(vi.mocked(useHubSummary).mock.calls.at(-1)?.[1]).toBe(true)
  })

  it("renders the original instance banner, realm/title, scope bar, encounters, and tabs with live names", () => {
    const html = hub("/leaderboards/Molten-Core?realm_ids=realm-id")
    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('aria-label="Realm: Nordanaar"')
    expect(html).toContain('aria-label="Leaderboard scope"')
    expect(html).toContain('aria-label="Encounters"')
    expect(html).toContain('data-entity-kind="raid"')
    expect(html).toContain('data-entity-kind="encounter"')
    expect(html).toContain("Ragnaros")
    expect(html).toContain("Live overview")
    expect(html).toContain('href="/leaderboards/Molten-Core/ratings?realm_ids=realm-id"')
    expect(html).toContain('href="/leaderboards?realm_ids=realm-id"')
    expect(html).not.toContain("Mock data for design review")
    expect(html).not.toContain("Ratings realms:")
    expect(vi.mocked(useHubSummary).mock.calls[0][0]).toMatchObject({ metadataOnly: true })
    expect(useHubSummary).toHaveBeenCalledTimes(1)
  })
  it("opens shared ratings-board links and preserves the board across hub tabs", () => {
    for (const view of ["peak", "mastery", "renown"] as const) {
      const html = hub(`/leaderboards/Molten-Core/ratings?rating=${view}&realm_ids=realm-id`)
      expect(html).toContain(`Live ratings ${view}`)
      expect(html).toContain(`href="/leaderboards/Molten-Core?rating=${view}&amp;realm_ids=realm-id"`)
    }

    expect(hub("/leaderboards/Molten-Core/ratings?rating=unknown")).toContain("Live ratings overview")
  })

  it("opens shared guild links and preserves guild mode across hub tabs", () => {
    const guilds = hub("/leaderboards/Molten-Core/ratings?rating=renown&subject=guild&realm_ids=realm-id")
    expect(guilds).toContain("Live ratings renown guild")
    expect(guilds).toContain('href="/leaderboards/Molten-Core?rating=renown&amp;subject=guild&amp;realm_ids=realm-id"')
    expect(guilds).toContain(">Guilds<")

    expect(hub("/leaderboards/Molten-Core/ratings?subject=unknown")).toContain("Live ratings overview player")
  })

  it("uses the configured Turtle roster and exposes Trash only under Performances", () => {
    const ratings = hub("/leaderboards/Molten-Core/ratings?encounter=Trash")
    expect(ratings).toContain("Ragnaros")
    expect(ratings).not.toContain("Gehennas")
    expect(ratings).not.toContain(">Trash</span>")
    expect(ratings).toContain("Full clear") // invalid encounter falls back to raid selection

    const performances = hub("/leaderboards/Molten-Core/performances")
    expect(performances).not.toContain("Gehennas")
    expect(performances).toContain("Trash")
    expect(performances).toContain("Full clear")
  })

  it("uses the default encounter set as the clear preset while listing hard-mode bosses", () => {
    setSummary({
      ...summary,
      instances: [{ ...summary.instances[0], instance_name: "Emerald Sanctum", difficulty_name: "", max_players: 0 }],
      encounters: [
        { encounter_name: "Erennius", total_kills: 12, top_dps: 1450 },
        { encounter_name: "Solnius", total_kills: 10, top_dps: 1300 },
        { encounter_name: "Solnius (Hard Mode)", total_kills: 5, top_dps: 1500 },
      ],
      progression_bosses: ["Erennius", "Solnius", "Solnius (Hard Mode)"],
      ranking_encounter_sets: [
        { id: "", label: "Normal", encounters: ["Erennius", "Solnius"] },
        { id: "hard", label: "Hard Mode", encounters: ["Solnius (Hard Mode)"] },
      ],
      selected_cohort: { difficulty_name: "", max_players: 0 },
    })
    const html = hub("/leaderboards/Emerald-Sanctum?difficulty=&size=0")
    expect(html).toContain("2 of 2 selected")
    expect(html).toMatch(/aria-pressed="false"[^>]*title="Solnius \(Hard Mode\)\. Click to select, Ctrl\+Click to toggle"/)
  })

  it("uses Sartharion 0D as the Obsidian Sanctum clear preset while listing drake variants", () => {
    setSummary({
      ...summary,
      instances: [{ ...summary.instances[0], instance_name: "Obsidian Sanctum", difficulty_name: "10 Player", max_players: 10 }],
      encounters: [
        { encounter_name: "Sartharion", total_kills: 12, top_dps: 1450 },
        { encounter_name: "Sartharion (1 Drake)", total_kills: 10, top_dps: 1500 },
        { encounter_name: "Sartharion (2 Drakes)", total_kills: 8, top_dps: 1550 },
        { encounter_name: "Sartharion (3 Drakes)", total_kills: 5, top_dps: 1600 },
      ],
      progression_bosses: ["Sartharion", "Sartharion (1 Drake)", "Sartharion (2 Drakes)", "Sartharion (3 Drakes)"],
      ranking_encounter_sets: [
        { id: "", label: "0D", encounters: ["Sartharion"] },
        { id: "1d", label: "1D", encounters: ["Sartharion (1 Drake)"] },
        { id: "2d", label: "2D", encounters: ["Sartharion (2 Drakes)"] },
        { id: "3d", label: "3D", encounters: ["Sartharion (3 Drakes)"] },
      ],
      selected_cohort: { difficulty_name: "10 Player", max_players: 10 },
    })
    const html = hub("/leaderboards/Obsidian-Sanctum/ratings?difficulty=10+Player&size=10")
    expect(html).toContain("1 of 1 selected")
    expect(html).toMatch(/aria-pressed="false"[^>]*title="Sartharion \(3 Drakes\)\. Click to select, Ctrl\+Click to toggle"/)
  })

  it("hides the cohort selector for one raid cohort and uses it even with a stale URL choice", () => {
    const html = hub("/leaderboards/Molten-Core?difficulty=Old&size=25")
    expect(html).not.toContain('aria-label="Raid cohort"')
    expect(html).toContain("Live overview")
  })
  it("offers a cohort selector when multiple raid populations are published", () => {
    setSummary({ ...summary, selected_cohort: null, instances: [...summary.instances, {
      ...summary.instances[0], difficulty_name: "Heroic", max_players: 25,
    }] })
    const html = hub("/leaderboards/Molten-Core")
    expect(html).toContain('aria-label="Difficulty and size"')
    expect(html).toContain("Heroic · 25")
  })
  it("selects the URL's published empty-difficulty zero-size cohort, else the summary's resolved one", () => {
    setSummary({ ...summary, instances: [...summary.instances, {
      ...summary.instances[0], difficulty_name: "", max_players: 0,
    }] })
    const selected = hub("/leaderboards/Molten-Core?difficulty=&size=0")
    expect(selected).toMatch(/aria-pressed="true"[^>]*>Default</)
    // Without a URL choice the summary's resolved (busiest) cohort is selected, not an empty prompt.
    const missing = hub("/leaderboards/Molten-Core")
    expect(missing).toMatch(/aria-pressed="true"[^>]*>Normal · 40</)
  })
  it("requests all-role performances without a zero-size URL parameter", () => {
    setSummary({ ...summary, instances: [{ ...summary.instances[0], difficulty_name: "", max_players: 0 }],
      selected_cohort: { difficulty_name: "", max_players: 0 } })
    hub("/leaderboards/Molten-Core/performances")
    const [params, enabled] = vi.mocked(useRankingsLeaderboard).mock.calls[0]
    expect(enabled).toBe(true)
    expect(params).toMatchObject({ instance_names: "Molten Core", difficulty_names: "", exact_cohort: true, metric: "dps" })
    expect(params.role).toBeUndefined()
    expect(params.max_players).toBe(0)
    // The preset sends its bosses, never an empty list (which ranks every encounter, Trash included).
    expect(params.encounter_names).toBeTruthy()
    expect(params.encounter_names!.split(",")).not.toContain("Trash")
  })

  it("omits Onyxia from ChromieCraft landing grids", () => {
    const onyxia = {
      ...summary.instances[0],
      instance_name: "Onyxia's Lair",
      difficulty_name: "25 Player",
      max_players: 25,
    }
    setSummary({
      ...summary,
      instances: [...summary.instances, onyxia],
      configuration: { effective_flavor: ["chromiecraft"] } as unknown as HubSummary["configuration"],
    })

    const html = hub("/leaderboards")
    expect(html).toContain("Molten Core")
    expect(html).not.toContain("Onyxia&#x27;s Lair")
  })

  it("uses the Storybook landing grid with published cohorts", () => {
    const html = hub("/leaderboards")
    expect(html).toContain("Molten Core")
    expect(html).toContain("12 recorded kills")
    expect(html).toContain('href="/leaderboards/Molten-Core?difficulty=Normal&amp;size=40"')
    expect(html).toContain('href="/leaderboards/ratings"')
    expect(html).toContain('aria-label="Leaderboard section"')
    expect(html).not.toContain("Mock data for design review")
    expect(useHubSummary).toHaveBeenCalledTimes(1)
  })
})
