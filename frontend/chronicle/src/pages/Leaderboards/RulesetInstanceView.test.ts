import { describe, expect, it } from "vitest"
import { damageRuleRows, rulesetEntries } from "./damageRuleRows"
import type { SupportedInstance } from "@/api/typesGenerated"

describe("DPS ruleset", () => {
  it("orders encounter rules by progression and resolves creature names", () => {
    const instance: SupportedInstance = {
      name: "Molten Core",
      category: "raid",
      progression_bosses: ["Garr", "Lucifron"],
      bosses: [{ entry_id: 12057, name: "Garr" }],
      trash: [{ entry_id: 12099, name: "Firesworn" }],
      damage_by_encounter: {
        Lucifron: { mode: "boss-only" },
        Garr: { mode: "entries", entry_ids: [12057, 12099, 999] },
      },
    }
    expect(damageRuleRows(instance)).toEqual([
      { name: "Garr", mode: "entries", targets: [
        { id: 12057, name: "Garr" },
        { id: 12099, name: "Firesworn" },
        { id: 999, name: "Creature 999" },
      ] },
      { name: "Lucifron", mode: "boss-only", targets: [] },
    ])
  })

  it("shows no encounter restrictions when no rules are configured", () => {
    expect(damageRuleRows({ name: "Other", category: "raid" })).toEqual([])
  })

  it("lists DPS, speedrun-only, and derived rulesets in progression order", () => {
    const instances: SupportedInstance[] = [
      { name: "Unrestricted", category: "raid", raid_progression_order: 3000 },
      { name: "Early", category: "raid", raid_progression_order: 1000, damage_by_encounter: { Boss: { mode: "boss-only" } } },
      { name: "Empty", category: "raid", damage_by_encounter: {} },
      { name: "Late", category: "raid", raid_progression_order: 2000,
        derived_names: ["Late Wing"],
        speedrun_rules: { requirements: [{ name: "Boss", entry_ids: [1], count: 1, category: "Bosses" }] },
        derived_speedrun_rules: { "Late Wing": { requirements: [{ name: "Trash", entry_ids: [2], count: 3, category: "Trash" }] } },
        derived_raid_progression_orders: { "Late Wing": 2001 },
      },
    ]
    expect(rulesetEntries(instances).map((entry) => entry.name)).toEqual(["Late Wing", "Late", "Early"])
    expect(rulesetEntries(instances).find((entry) => entry.name === "Late Wing")).toMatchObject({
      derived: true, damageRuleCount: 0, speedrunRules: { requirements: [{ name: "Trash", count: 3 }] },
    })
  })
})
