import { describe, expect, it } from "vitest"
import { damageRuleRows, renownRuleRows, rulesetEntries } from "./damageRuleRows"
import type { SupportedInstance } from "@/api/typesGenerated"

describe("Leaderboard ruleset", () => {
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
      { name: "Garr", mode: "entries", rankedTime: "window", targets: [
        { id: 12057, name: "Garr", boss: true },
        { id: 12099, name: "Firesworn", boss: false },
        { id: 999, name: "Creature 999", boss: false },
      ] },
      { name: "Lucifron", mode: "boss-only", rankedTime: "window", targets: [] },
    ])
  })

  it("adds the hard-coded Assembly of Iron rule for Ulduar", () => {
    const rows = damageRuleRows({ name: "Ulduar", category: "raid" })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      name: "Assembly of Iron",
      mode: "phase-kill",
      rankedTime: "full",
      targets: [
        { id: 32867, name: "Steelbreaker", boss: true },
        { id: 32927, name: "Runemaster Molgeim", boss: true },
        { id: 32857, name: "Stormcaller Brundir", boss: true },
      ],
    })
    expect(rows[0].note).toContain("council member who dies")
    expect(rulesetEntries([{ name: "Ulduar", category: "raid" }])[0].damageRuleCount).toBe(1)
  })

  it("shows no encounter restrictions when no rules are configured", () => {
    expect(damageRuleRows({ name: "Other", category: "raid" })).toEqual([])
  })

  it("orders Renown bosses by progression, then alphabetically", () => {
    const instance: SupportedInstance = {
      name: "Raid",
      category: "raid",
      progression_bosses: ["Second", "First"],
      renown_rules: [
        { encounter_name: "Optional B", points: 1 },
        { encounter_name: "First", points: 3 },
        { encounter_name: "Optional A", points: 0 },
        { encounter_name: "Second", points: 2 },
      ],
    }
    const entry = rulesetEntries([instance])[0]
    expect(renownRuleRows(entry).map((rule) => rule.encounter_name)).toEqual([
      "Second", "First", "Optional A", "Optional B",
    ])
  })

  it("lists DPS, speedrun-only, and derived rulesets in progression order", () => {
    const instances: SupportedInstance[] = [
      { name: "Unrestricted", category: "raid", raid_progression_order: 3000 },
      { name: "Early", category: "raid", raid_progression_order: 1000, damage_by_encounter: { Boss: { mode: "boss-only" } } },
      { name: "Empty", category: "raid", damage_by_encounter: {} },
      { name: "Renown", category: "raid", raid_progression_order: 1500,
        renown_rules: [{ encounter_name: "Boss", points: 2 }],
      },
      { name: "Late", category: "raid", raid_progression_order: 2000,
        derived_names: ["Late Wing"],
        speedrun_rules: { requirements: [{ name: "Boss", entry_ids: [1], count: 1, category: "Bosses" }] },
        derived_speedrun_rules: { "Late Wing": { requirements: [{ name: "Trash", entry_ids: [2], count: 3, category: "Trash" }] } },
        derived_renown_rules: { "Late Wing": [{ encounter_name: "Wing Boss", points: 4 }] },
        derived_raid_progression_orders: { "Late Wing": 2001 },
      },
    ]
    expect(rulesetEntries(instances).map((entry) => entry.name)).toEqual(["Late Wing", "Late", "Renown", "Early"])
    expect(rulesetEntries(instances).find((entry) => entry.name === "Late Wing")).toMatchObject({
      derived: true,
      damageRuleCount: 0,
      speedrunRules: { requirements: [{ name: "Trash", count: 3 }] },
      renownRules: [{ encounter_name: "Wing Boss", points: 4 }],
    })
  })
})
