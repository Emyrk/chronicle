import { describe, expect, it } from "vitest"
import type { ArmorySearchResult, GuildInfo, SupportedInstance } from "@/api/typesGenerated"
import { decodeQuery } from "@/pages/InstanceSearch/queryModel"
import { allNavLinks } from "../navItems"
import { matchPages, matchRankings, pickTopResult, rankingHref, raidSearchHref, bossSearchHref } from "./globalSearch"

const instances = [
  { name: "Molten Core", category: "raid", progression_bosses: ["Lucifron", "Ragnaros"] },
  { name: "Blackwing Lair", category: "raid", progression_bosses: ["Razorgore the Untamed", "Nefarian"] },
  { name: "Naxxramas", category: "raid", progression_bosses: ["Kel'Thuzad"] },
  { name: "Fallback", category: "raid", fallback: true },
] as SupportedInstance[]

const player = (name: string) => ({ id: name, name, realm_name: "Nordanaar", class: "Mage" }) as ArmorySearchResult
const guild = (name: string) => ({ id: name, name }) as GuildInfo

describe("matchRankings", () => {
  it("matches raid initials, names, and bosses", () => {
    expect(matchRankings("bwl", instances).map((row) => row.instance)).toEqual(["Blackwing Lair"])
    expect(matchRankings("naxx", instances)[0]).toMatchObject({ instance: "Naxxramas", boss: undefined, href: "/leaderboards/Naxxramas" })
    expect(matchRankings("kelthuzad", instances)[0]).toMatchObject({ instance: "Naxxramas", boss: "Kel'Thuzad" })
    expect(matchRankings("rag", instances)[0].href).toBe(rankingHref("Molten Core", "performances", "Ragnaros"))
  })

  it("puts raids ahead of equally strong dungeon matches before applying the limit", () => {
    const catalog = [
      { name: "Black Morass", category: "dungeon" },
      { name: "Blackfathom Deeps", category: "dungeon" },
      { name: "Blackrock Depths", category: "dungeon" },
      { name: "Blackrock Spire", category: "dungeon" },
      { name: "Blackwing Lair", category: "raid" },
    ] as SupportedInstance[]
    const rankings = matchRankings("black", catalog)
    expect(rankings).toHaveLength(4)
    expect(rankings[0]).toMatchObject({ instance: "Blackwing Lair", category: "raid" })
    expect(pickTopResult("black", { rankings, players: [], guilds: [], pages: [] }))
      .toMatchObject({ kind: "ranking", ranking: { instance: "Blackwing Lair" } })
    expect(matchRankings("Black Morass", catalog)[0]).toMatchObject({ instance: "Black Morass", category: "dungeon" })
  })

  it("keeps stronger dungeon matches ahead of weaker raid matches", () => {
    const catalog = [
      { name: "Black", category: "dungeon" },
      { name: "Blackwing Lair", category: "raid" },
    ] as SupportedInstance[]
    expect(matchRankings("black", catalog)[0].instance).toBe("Black")
  })

  it("preserves the instance category for boss and battleground presentation", () => {
    expect(matchRankings("rag", instances)[0]).toMatchObject({ category: "raid", boss: "Ragnaros" })
    expect(matchRankings("warsong", [{ name: "Warsong Gulch", category: "battleground" }] as SupportedInstance[])[0])
      .toMatchObject({ category: "battleground" })
  })

  it("ignores short queries and fallback instances", () => {
    expect(matchRankings("m", instances)).toEqual([])
    expect(matchRankings("fallback", instances)).toEqual([])
  })
})

describe("matchPages", () => {
  it("matches titles and keywords", () => {
    expect(matchPages("modules", allNavLinks())[0].id).toBe("modules")
    expect(matchPages("lua", allNavLinks())[0].id).toBe("modules")
    expect(matchPages("ladder", allNavLinks())[0].id).toBe("leaderboards")
  })
})

describe("pickTopResult", () => {
  const empty = { rankings: [], players: [], guilds: [], pages: [] }

  it("prefers an exact character, then guild, then raid", () => {
    const rankings = matchRankings("rag", instances)
    expect(pickTopResult("Rag", { ...empty, rankings, players: [player("Rag")], guilds: [guild("Rag")] })?.kind).toBe("player")
    expect(pickTopResult("Rag", { ...empty, rankings, players: [player("Ragnar")], guilds: [guild("Rag")] })?.kind).toBe("guild")
    expect(pickTopResult("Rag", { ...empty, rankings, players: [player("Ragnar")] })?.kind).toBe("ranking")
    expect(pickTopResult("zzz", empty)).toBeUndefined()
  })
})

const queryFromHref = (href: string) => decodeQuery(new URL(href, "https://example.test").searchParams.get("q"))

describe("catalog destinations", () => {
  const catalog: SupportedInstance[] = [
    {
      name: "Temple of Ahn'Qiraj", category: "raid", derived_names: ["AQ Temple"],
      progression_bosses: ["Twin Emperors"],
      ranking_encounter_sets: [{ id: "optional", label: "Optional", encounters: ["Twin Emperors", "Viscidus"] }],
      bosses: [{ entry_id: 1, name: "Twin Emperors" }, { entry_id: 2, name: "Twin Emperors" }, { entry_id: 3, name: "Unmapped creature" }],
      trash: [{ entry_id: 4, name: "Anubisath Defender" }, { entry_id: 5, name: "Anubisath Defender" }],
      speedrun_rules: { requirements: [] }, damage_by_encounter: { "Twin Emperors": { mode: "all" } },
    },
    { name: "Ulduar", category: "raid", progression_bosses: ["Hodir"],
      ranking_encounter_sets: [{ id: "hard", label: "Hard mode", encounters: ["Hodir (Hard Mode)"] }] },
    { name: "Small Dungeon", category: "dungeon", bosses: [{ entry_id: 6, name: "Dungeon Boss" }] },
  ]

  it("roundtrips aliases and derived names to canonical raid predicates", () => {
    for (const alias of ["aq", "AQ40", "AQ Temple", "Temple of Ahn'Qiraj"]) {
      expect(queryFromHref(raidSearchHref(alias, catalog))).toEqual({ field: "instance.name", op: "=", value: "Temple of Ahn'Qiraj" })
    }
    expect(queryFromHref(raidSearchHref("bwl", instances))).toEqual({ field: "instance.name", op: "=", value: "Blackwing Lair" })
    expect(queryFromHref(raidSearchHref("未知 & raid"))).toEqual({ field: "instance.name", op: "contains", value: "未知 & raid" })
    expect(raidSearchHref(" ")).toBe("/search")
  })

  it("deduplicates canonical encounters and includes non-progression ranking sets", () => {
    expect(matchRankings("twin", catalog)).toHaveLength(1)
    const boss = matchRankings("viscidus", catalog)[0]
    expect(boss.boss).toBe("Viscidus")
    expect(boss.searchRequiresLogin).toBe(true)
    expect(boss.tabs).toContainEqual({ label: "Search logs (login required)", href: boss.searchHref })
    expect(queryFromHref(boss.searchHref)).toEqual({ and: [
      { field: "instance.name", op: "=", value: "Temple of Ahn'Qiraj" },
      { any_encounter: { field: "encounter.name", op: "=", value: "Viscidus" } },
    ] })
    expect(boss.searchHref).toBe(bossSearchHref("Temple of Ahn'Qiraj", "Viscidus"))
  })

  it("preserves published variant names and targets without normalization", () => {
    const boss = matchRankings("hodir (hard", catalog)[0]
    expect(boss.href).toBe(rankingHref("Ulduar", "performances", "Hodir (Hard Mode)"))
    expect(queryFromHref(boss.searchHref)?.and?.[1].any_encounter?.value).toBe("Hodir (Hard Mode)")
  })

  it("routes unclassified creatures and adds to one parent without boss filters", () => {
    for (const query of ["unmapped", "anubisath"]) {
      const matches = matchRankings(query, catalog)
      expect(matches).toHaveLength(1)
      expect(matches[0].boss).toBeUndefined()
      expect(matches[0].searchRequiresLogin).toBe(false)
      expect(queryFromHref(matches[0].searchHref)).toEqual({ field: "instance.name", op: "=", value: "Temple of Ahn'Qiraj" })
      expect(matches[0].tabs.every((tab) => !tab.href.includes("encounters="))).toBe(true)
    }
  })

  it("only offers supported boards, full-clear speedruns, and the existing rules route", () => {
    const dungeon = matchRankings("dungeon boss", catalog)[0]
    expect(dungeon.href).toBe(dungeon.searchHref)
    expect(dungeon.tabs).toEqual([{ label: "Search logs", href: dungeon.searchHref }])
    const boss = matchRankings("viscidus", catalog)[0]
    expect(boss.tabs).toContainEqual({ label: "Speedruns", href: rankingHref("Temple of Ahn'Qiraj", "speedruns") })
    expect(boss.tabs).toContainEqual({ label: "Rules", href: rankingHref("Temple of Ahn'Qiraj", "rulesets") })
    expect(matchRankings("hodir", catalog)[0].tabs.map((tab) => tab.label)).not.toContain("Speedruns")
    expect(matchRankings("hodir", catalog)[0].tabs.map((tab) => tab.label)).not.toContain("Rules")
  })
})
