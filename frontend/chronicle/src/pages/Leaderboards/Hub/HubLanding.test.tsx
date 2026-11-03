import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import { describe, expect, it } from "vitest"
import type { RankingsInstanceSummary } from "@/api/typesGenerated"
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
    expect(markup).toContain("Normal · 40 players")
    expect(markup).toContain("Heroic · 25 players")
    expect(markup).toContain("Realm: Nordanaar")
    expect(markup).not.toContain("Fastest full clear")
    expect(markup).not.toContain("Guild Renown")
    expect(markup).not.toContain("Mock data for design review")
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
    const markup = render({ instances: zero })
    expect(markup).toContain("size not recorded")
    expect(markup).not.toContain("0 players")
  })

  it("uses the caller's instance view and never falls back to fixture Hub data", () => {
    expect(render({ instance: "Molten Core", onInstance: () => {}, renderInstance: (name) => <p>Published {name}</p> })).toContain("Published Molten Core")
    const unavailable = render({ instance: "Molten Core", onInstance: () => {} })
    expect(unavailable).toContain("No live instance view available")
    expect(unavailable).not.toContain("Fastest full clear")
  })
})
