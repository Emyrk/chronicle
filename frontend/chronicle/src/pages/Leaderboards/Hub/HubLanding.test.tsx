import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { RankingsInstanceSummary, SupportedInstance } from "@/api/typesGenerated"
import { LeaderboardsHubApp } from "./HubLanding"

const instances = [
  { category: "raid", instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, total_kills: 1234, top_players: [] },
  { category: "raid", instance_name: "Molten Core", difficulty_name: "Heroic", max_players: 25, total_kills: 57, top_players: [] },
  { category: "dungeon", instance_name: "Blackrock Depths", difficulty_name: "Normal", max_players: 5, total_kills: 99, top_players: [] },
] satisfies RankingsInstanceSummary[]

function render(props: Partial<Parameters<typeof LeaderboardsHubApp>[0]> = {}) {
  return renderToStaticMarkup(<MemoryRouter><LeaderboardsHubApp instances={instances} realm="Nordanaar" realms={["Nordanaar"]} {...props} /></MemoryRouter>)
}

describe("live Hub landing", () => {
  it("keeps each published cohort separate without fixture rankings or mock footer", () => {
    const markup = render({ tab: "speedruns" })
    expect(markup).toContain("1,234 recorded kills")
    expect(markup).toContain("57 recorded kills")
    expect(markup).toContain("99 recorded kills")
    // One card per difficulty/size; the badge names it when an instance has several.
    expect(markup).toContain("Normal · 40")
    expect(markup).toContain("Heroic · 25")
    expect(markup).toContain("Realm: Nordanaar")
    expect(markup).not.toContain("Fastest full clear")
    expect(markup).not.toContain("Guild Renown")
    expect(markup).not.toContain("Mock data for design review")
  })

  it("shows configured instances without rankings as compact links below published cards", () => {
    const markup = render({
      instances: [
        ...instances,
        { ...instances[0], instance_name: "Upper Karazhan", total_kills: 0 },
      ],
      instanceHref: (name) => `/leaderboards/${name.replaceAll(" ", "-")}`,
    })

    expect(markup.indexOf("Upper Karazhan")).toBeGreaterThan(markup.indexOf("Blackrock Depths"))
    expect(markup).toContain("Configured instances without rankings")
    expect(markup).toContain("Open an instance to view its configured encounters and rules.")
    expect(markup).toContain("No rankings yet")
    expect(markup).toContain('href="/leaderboards/Upper-Karazhan"')
  })

  it("separates raid cards by level tier and keeps cohorts together", () => {
    const raidInstances = [
      { ...instances[0], instance_name: "Molten Core", difficulty_name: "Heroic", max_players: 25 },
      { ...instances[0], instance_name: "Blackwing Lair" },
      { ...instances[0], instance_name: "Molten Core" },
      { ...instances[0], instance_name: "Karazhan" },
      { ...instances[0], instance_name: "Ulduar" },
    ] satisfies RankingsInstanceSummary[]
    const supportedInstances = [
      { name: "Molten Core", category: "raid", raid_progression_order: 100 },
      { name: "Blackwing Lair", category: "raid", raid_progression_order: 300 },
      { name: "Karazhan", category: "raid", raid_progression_order: 1000 },
      { name: "Ulduar", category: "raid", raid_progression_order: 2100 },
    ] satisfies SupportedInstance[]

    const markup = render({ instances: raidInstances, supportedInstances })
    const level80 = markup.indexOf("Level 80")
    const level70 = markup.indexOf("Level 70")
    const level60 = markup.indexOf("Level 60")
    // React 19 emits image preload links first, so match the visible card headings.
    const ulduar = markup.indexOf("Ulduar</h2>")
    const karazhan = markup.indexOf("Karazhan</h2>")
    const blackwingLair = markup.indexOf("Blackwing Lair</h2>")
    const firstMoltenCore = markup.indexOf("Molten Core</h2>")
    const lastMoltenCore = markup.lastIndexOf("Molten Core</h2>")

    expect(level80).toBeGreaterThan(-1)
    expect(level80).toBeLessThan(ulduar)
    expect(ulduar).toBeLessThan(level70)
    expect(level70).toBeLessThan(karazhan)
    expect(karazhan).toBeLessThan(level60)
    expect(level60).toBeLessThan(blackwingLair)
    expect(blackwingLair).toBeLessThan(firstMoltenCore)
    expect(lastMoltenCore).toBeGreaterThan(firstMoltenCore)
  })

  it("shows the published board summaries for each tab instead of mock rows", () => {
    const player = { realm_id: "realm", realm_name: "Nordanaar", player_guid: "mage-1", player_name: "Live Mage",
      player_class: "MAGE", player_spec: "Frost", player_sub_spec: "", score: 98 }
    const guild = { realm_id: "realm", realm_name: "Nordanaar", guild_id: "guild-1", guild_name: "Live Guild", score: 1200 }
    const landingPreviews = [{ instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40,
      player: { peak: [player], ranked_mastery: [player], renown: [player] },
      guild: { peak: [], ranked_mastery: [], renown: [guild] },
      speedruns: [{ instance_id: "run-1", guild_name: "Live Clear", duration_ms: 120000 }],
      performances: [{ player_guid: "mage-1", player_name: "Live Mage", player_class: "MAGE", realm_id: "realm", dps: 1725 }],
      statistics: [{ player_class: "MAGE", player_spec: "Frost", player_sub_spec: "", median_dps: 840 }],
    }] as unknown as NonNullable<Parameters<typeof LeaderboardsHubApp>[0]["landingPreviews"]>
    const overview = render({ tab: "overview", landingPreviews })
    expect(overview).toContain("Live Clear")
    expect(overview).toContain("Live Guild")
    expect(overview).toContain("Live Mage")
    expect(overview).not.toContain("Mock data for design review")
    const ratings = render({ tab: "ratings", landingPreviews })
    expect(ratings).toContain("Live Mage")
    expect(ratings).not.toContain("Live Clear")
    const speedruns = render({ tab: "speedruns", landingPreviews })
    expect(speedruns).toContain("Live Clear")
    expect(speedruns).not.toContain("Live Mage")
    const performances = render({ tab: "performances", landingPreviews })
    expect(performances).toContain("Live Mage")
    expect(performances).toContain("1,725 dps")
    const statistics = render({ tab: "statistics", landingPreviews })
    expect(statistics).toContain("Frost")
    expect(statistics).toContain("840 dps")
    expect(render({ tab: "parsing", landingPreviews })).not.toContain("Live Mage")
  })

  it("chooses a cohort with a published speedrun before an empty cohort", () => {
    const hero = [{ instance_name: "Molten Core", difficulty_name: "Heroic", max_players: 25,
      player: { peak: [], ranked_mastery: [], renown: [] }, guild: { peak: [], ranked_mastery: [], renown: [] },
      speedruns: [{ instance_id: "hero-run", guild_name: "Heroic Clear", duration_ms: 95000 }] }]
    const markup = render({ tab: "speedruns", landingPreviews: hero as unknown as NonNullable<Parameters<typeof LeaderboardsHubApp>[0]["landingPreviews"]> })
    expect(markup).toContain("Heroic Clear")
  })

  it("treats legacy zero-size cohorts as missing data, not zero-player raids", () => {
    const zero = [{ category: "raid", instance_name: "Onyxia's Lair", difficulty_name: "", max_players: 0,
      total_kills: 10, top_players: [] }] satisfies RankingsInstanceSummary[]
    // A lone cohort shows only its kills; the label only tells several cohorts apart.
    const lone = render({ instances: zero })
    expect(lone).toContain("10 recorded kills")
    expect(lone).not.toContain("size not recorded")
    // Several cohorts: each card's badge names its own, a zero size as just the difficulty.
    const markup = render({ instances: [...zero, { ...zero[0], difficulty_name: "Normal", max_players: 25 }] })
    expect(markup).toContain(">Default<")
    expect(markup).toContain("Normal · 25")
    expect(markup).not.toContain("0 players")
  })

  it("uses the caller's instance view and never falls back to fixture Hub data", () => {
    expect(render({ instance: "Molten Core", onInstance: () => {}, renderInstance: (name) => <p>Published {name}</p> })).toContain("Published Molten Core")
    const unavailable = render({ instance: "Molten Core", onInstance: () => {} })
    expect(unavailable).toContain("No live instance view available")
    expect(unavailable).not.toContain("Fastest full clear")
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("persisted highlight status", () => {
  const snapshot = { instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40,
    configuration_fingerprint: "policy", refreshed_at: "2026-11-09T12:00:00Z" }
  it("distinguishes unprepared from published empty without losing configured cards", () => {
    const pending = render({ landingSnapshots: [{ ...snapshot, status: "not_prepared" }] })
    expect(pending).toContain("Highlights awaiting refresh")
    expect(pending).not.toContain("No qualifying highlights")
    const empty = render({ landingSnapshots: [{ ...snapshot, status: "empty" }] })
    expect(empty).toContain("No qualifying highlights")
    expect(empty).toContain('dateTime="2026-11-09T12:00:00Z"')
  })
  it("shows a compact relative refresh age at the bottom right", () => {
    vi.useFakeTimers()

    vi.setSystemTime(new Date("2026-11-09T12:42:00Z"))
    const minutes = render({ landingSnapshots: [{ ...snapshot, status: "empty" }] })
    expect(minutes).toContain("items-end justify-between")
    expect(minutes).toContain("Updated 42 minutes ago")

    vi.setSystemTime(new Date("2026-11-09T15:00:00Z"))
    expect(render({ landingSnapshots: [{ ...snapshot, status: "empty" }] })).toContain("Updated 3 hr ago")

    vi.setSystemTime(new Date("2026-11-10T13:00:00Z"))
    expect(render({ landingSnapshots: [{ ...snapshot, status: "empty" }] })).toContain("Updated &gt;1d ago")
  })

  it("labels stale published snapshots", () => {
    expect(render({ landingSnapshots: [{ ...snapshot, status: "stale" }] })).toContain("Stale highlights")
  })
  it("keeps the realm selector and cards but does not claim empty results on selection or transport errors", () => {
    const markup = render({ landingBlocked: true, landingNotice: <p>Choose All realms or one realm to view highlights</p> })
    expect(markup).toContain("Realm: Nordanaar")
    expect(markup).toContain("Choose All realms or one realm")
    expect(markup).not.toContain("No published highlights")
    expect(markup).not.toContain("Highlights awaiting refresh")
  })
})

describe("all persisted card tabs", () => {
  const snapshot = { instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, configuration_fingerprint: "policy", refreshed_at: "2026-11-09T12:00:00Z" }
  const emptyPreview = { ...snapshot, player: { peak: [], ranked_mastery: [], renown: [] }, guild: { peak: [], ranked_mastery: [], renown: [] }, speedruns: [], performances: [], statistics: [] }
  for (const tab of ["overview", "ratings", "speedruns", "performances", "statistics"] as const) {
    it(`${tab} distinguishes preparing, empty, and stale policy`, () => {
      expect(render({ tab, landingSnapshots: [{ ...snapshot, status: "not_prepared" }] })).toContain("Highlights awaiting refresh")
      const rebuilding = render({ tab, landingSnapshots: [{ ...snapshot, status: "rebuilding" }] })
      expect(rebuilding).toContain("Highlights awaiting refresh")
      expect(rebuilding).not.toContain("No published highlights")
      expect(rebuilding).not.toContain("No qualifying")
      expect(render({ tab, landingSnapshots: [{ ...snapshot, status: "empty" }], landingPreviews: [emptyPreview] })).toContain("No qualifying highlights")
      const withheld = render({ tab, landingSnapshots: [{ ...snapshot, status: "stale" }] })
      expect(withheld).toContain("Stale highlights withheld until refresh")
      expect(withheld).not.toContain("No qualifying")
      const agedEmpty = render({ tab, landingSnapshots: [{ ...snapshot, status: "stale" }], landingPreviews: [emptyPreview] })
      expect(agedEmpty).toContain("Stale · Updated")
      expect(agedEmpty).toContain("2026-11-09T12:00:00Z")
      expect(agedEmpty).not.toContain("withheld")
    })
  }
})
