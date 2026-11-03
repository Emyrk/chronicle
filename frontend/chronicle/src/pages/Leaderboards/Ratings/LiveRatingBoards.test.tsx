import { describe, expect, it } from "vitest"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { renderToStaticMarkup } from "react-dom/server"
import { LiveRatingBoards } from "./LiveRatingBoards"
import { liveRatingURL, type LiveRatingBoardRequest } from "./liveRatingAdapter"

const request: LiveRatingBoardRequest = {
  instanceName: "Molten Core", encounterName: "Ragnaros", subject: "player", metric: "peak", window: "period",
  cohort: { difficulty: "Normal", maxPlayers: 40, playerClass: "Mage", spec: "Frost", subSpec: "", performance: "dps" },
}

describe("published live boards", () => {
  it("renders only actual published values and names with ID fallbacks", () => {
    const client = new QueryClient()
    client.setQueryData(["tenant-rating-board", liveRatingURL(request), 0], {
      pages: [{ entries: [
        { realm_id: "realm-1", player_guid: "guid-1", player_name: "Agnia", guild_name: "Raiders", player_class: "MAGE", player_spec: "Frost", player_sub_spec: "", score: 93.25, eligible_kills: 7 },
        { realm_id: "realm-2", player_guid: "guid-2", player_class: "MAGE", player_spec: "Frost", player_sub_spec: "", score: 88, eligible_kills: 3 },
      ] }], pageParams: [""],
    })
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><LiveRatingBoards {...request} realmNames={{ "realm-1": "Turtle" }} /></QueryClientProvider>)
    expect(html).toContain("Agnia")
    expect(html).toContain("Raiders")
    expect(html).toContain("guid-2")
    expect(html).toContain("93.3")
    expect(html).toContain("Turtle")
    expect(html).toContain("realm-2")
    expect(html).toContain("2 shown")
    expect(html).not.toContain("All 2 ranked")
    expect(html).not.toContain("Rank 1")
  })
  it("shows an unseeded state rather than an invented score", () => {
    const client = new QueryClient()
    client.setQueryData(["tenant-rating-board", liveRatingURL(request), 0], { pages: [{ entries: [] }], pageParams: [""] })
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><LiveRatingBoards {...request} /></QueryClientProvider>)
    expect(html).toContain("No published scores")
    expect(html).not.toContain("Load more")
  })
})
