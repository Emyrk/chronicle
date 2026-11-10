import { describe, expect, it } from "vitest"
import { leaderboardRaidContext } from "./leaderboardRaidContext"

describe("leaderboardRaidContext", () => {
  it("publishes the selected raid population and preset bosses", () => {
    expect(
      leaderboardRaidContext(
        "Molten Core",
        { kind: "clear" },
        ["Lucifron", "Trash", "Ragnaros"],
        ["Lucifron", "Ragnaros"],
        { difficultyName: "Normal", maxPlayers: 40 },
      ),
    ).toEqual({
      instanceName: "Molten Core",
      label: "Molten Core leaderboards",
      difficultyName: "Normal",
      maxPlayers: 40,
      bossNames: ["Lucifron", "Ragnaros"],
    })
  })

  it("uses the page's hand-picked bosses and excludes trash", () => {
    expect(
      leaderboardRaidContext(
        "Naxxramas",
        { kind: "bosses", bosses: ["Patchwerk", "Trash", "Thaddius"] },
        ["Patchwerk", "Trash", "Thaddius"],
        ["Patchwerk", "Thaddius"],
      ).bossNames,
    ).toEqual(["Patchwerk", "Thaddius"])
  })
})
