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

  it("uses the caller's instance view and never falls back to fixture Hub data", () => {
    expect(render({ instance: "Molten Core", onInstance: () => {}, renderInstance: (name) => <p>Published {name}</p> })).toContain("Published Molten Core")
    const unavailable = render({ instance: "Molten Core", onInstance: () => {} })
    expect(unavailable).toContain("No live instance view available")
    expect(unavailable).not.toContain("Fastest full clear")
  })
})
