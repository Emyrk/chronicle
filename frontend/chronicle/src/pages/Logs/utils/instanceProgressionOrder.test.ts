import { describe, expect, it } from "vitest"
import type { SupportedInstance } from "@/api/typesGenerated"
import {
  compareByRaidProgression,
  getRaidLevel,
  getRaidProgressionOrder,
  groupByRaidLevel,
} from "./instanceProgressionOrder"

const supportedInstances = [
  { name: "Molten Core", category: "raid", raid_progression_order: 100 },
  { name: "Naxxramas", category: "raid", raid_progression_order: 2030 },
  { name: "Karazhan", category: "raid", raid_progression_order: 1000 },
  { name: "Ulduar", category: "raid", raid_progression_order: 2100 },
  { name: "Onyxia's Lair", category: "raid", raid_progression_order: 2150 },
  {
    name: "Tower of Karazhan",
    category: "raid",
    raid_progression_order: 900,
    derived_names: ["Lower Tower of Karazhan", "Upper Tower of Karazhan"],
    derived_raid_progression_orders: {
      "Lower Tower of Karazhan": 900,
      "Upper Tower of Karazhan": 950,
    },
  },
] as SupportedInstance[]

describe("raid progression order", () => {
  it("sorts the highest progression raid first", () => {
    const raids = [
      "Molten Core",
      "Naxxramas",
      "Lower Tower of Karazhan",
      "Upper Tower of Karazhan",
    ]

    raids.sort((left, right) =>
      compareByRaidProgression(left, right, supportedInstances),
    )

    expect(raids).toEqual([
      "Naxxramas",
      "Upper Tower of Karazhan",
      "Lower Tower of Karazhan",
      "Molten Core",
    ])
  })

  it("uses independent orders for derived instance names", () => {
    expect(getRaidProgressionOrder("Lower Tower of Karazhan", supportedInstances)).toBe(900)
    expect(getRaidProgressionOrder("Upper Tower of Karazhan", supportedInstances)).toBe(950)
  })

  it("groups raids by level with the highest level first", () => {
    const groups = groupByRaidLevel(
      ["Molten Core", "Karazhan", "Naxxramas", "Ulduar"],
      (name) => name,
      supportedInstances,
    )

    expect(groups).toEqual([
      { level: 80, items: ["Ulduar", "Naxxramas"] },
      { level: 70, items: ["Karazhan"] },
      { level: 60, items: ["Molten Core"] },
    ])
    expect(getRaidLevel("Unknown Raid", supportedInstances)).toBeNull()
  })

  it("places Wrath Onyxia after Ulduar", () => {
    expect(
      compareByRaidProgression("Onyxia's Lair", "Ulduar", supportedInstances),
    ).toBeLessThan(0)
  })

  it("sorts unconfigured raids alphabetically after configured raids", () => {
    const raids = ["Unknown Z", "Molten Core", "Unknown A"]

    raids.sort((left, right) =>
      compareByRaidProgression(left, right, supportedInstances),
    )

    expect(raids).toEqual(["Molten Core", "Unknown A", "Unknown Z"])
  })
})
