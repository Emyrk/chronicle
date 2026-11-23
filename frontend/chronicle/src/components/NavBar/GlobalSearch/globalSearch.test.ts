import { describe, expect, it } from "vitest"
import type { ArmorySearchResult, GuildInfo, SupportedInstance } from "@/api/typesGenerated"
import { allNavLinks } from "../navItems"
import { matchPages, matchRankings, pickTopResult, rankingHref } from "./globalSearch"

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
