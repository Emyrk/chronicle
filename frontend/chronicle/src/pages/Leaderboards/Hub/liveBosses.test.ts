import { describe, expect, it } from "vitest"
import { liveHubBosses, liveHubPreset } from "./liveBosses"

const recorded = ["Baron Geddon", "Gehennas", "Ragnaros", "Trash"]
const defaultSet = [{ id: "", label: "Default", encounters: ["Ragnaros", "Baron Geddon"] }]

describe("live Hub encounter roster", () => {
  it("follows the configured default raid set rather than historical rows", () => {
    expect(liveHubBosses(recorded, new Set(["Ragnaros", "Baron Geddon"]), defaultSet)).toEqual(["Ragnaros", "Baron Geddon"])
    expect(liveHubBosses(recorded, new Set(["Ragnaros"]), defaultSet, true)).toEqual(["Ragnaros", "Baron Geddon", "Trash"])
  })

  it("offers hard-mode bosses alongside the default bosses without changing the preset", () => {
    const sets = [
      { id: "", label: "Normal", encounters: ["Erennius", "Solnius"] },
      { id: "hard", label: "Hard Mode", encounters: ["Solnius (Hard Mode)", "Erennius"] },
    ]
    expect(liveHubPreset([], new Set(["Erennius", "Solnius", "Solnius (Hard Mode)"]), sets)).toEqual([
      "Erennius", "Solnius",
    ])
    expect(liveHubBosses([], new Set(sets[0].encounters), sets)).toEqual([
      "Erennius", "Solnius", "Solnius (Hard Mode)",
    ])
  })

  it("falls back to the progression roster and never treats Trash as a boss", () => {
    expect(liveHubBosses(recorded, new Set(["Ragnaros"]))).toEqual(["Ragnaros"])
    expect(liveHubBosses(recorded)).toEqual(["Baron Geddon", "Gehennas", "Ragnaros"])
    expect(liveHubBosses(["Trash"], undefined, [], true)).toEqual(["Trash"])
  })
})
