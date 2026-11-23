import type { ArmorySearchResult, GuildInfo, SupportedInstance } from "@/api/typesGenerated"
import { instancePathSegment } from "@/pages/Leaderboards/v2Selection"
import type { NavLink } from "../navItems"

/** A raid or boss that has leaderboards. */
export interface RankingMatch {
  instance: string
  /** Set when the query matched a boss rather than the raid itself. */
  boss?: string
  href: string
  /** Quick links into the raid's leaderboard tabs. */
  tabs: { label: string; href: string }[]
}

export type TopResult =
  | { kind: "player"; player: ArmorySearchResult }
  | { kind: "guild"; guild: GuildInfo }
  | { kind: "ranking"; ranking: RankingMatch }
  | { kind: "page"; link: NavLink }

export interface GlobalSearchResults {
  top?: TopResult
  rankings: RankingMatch[]
  players: ArmorySearchResult[]
  guilds: GuildInfo[]
  pages: NavLink[]
}

const norm = (value: string) => value.toLowerCase().replace(/['’]/g, "").trim()

/** "Molten Core" → "mc", "Blackwing Lair" → "bwl". Raiders search by these. */
function initials(name: string): string {
  return name.split(/[\s-]+/).filter((word) => /^[A-Za-z]/.test(word) && !/^(of|the)$/i.test(word)).map((word) => word[0]).join("").toLowerCase()
}

/** Nicknames raiders type that initials alone do not produce. */
const RAID_ALIASES: Record<string, string[]> = {
  "Blackwing Lair": ["bwl"],
  "Temple of Ahn'Qiraj": ["aq40", "aq"],
  "Ruins of Ahn'Qiraj": ["aq20"],
  "Onyxia's Lair": ["ony", "onyxia"],
  "Naxxramas": ["naxx"],
}

/** 3 = exact, 2 = prefix (of the name or one of its words), 1 = substring, 0 = none. */
function score(name: string, query: string): number {
  const n = norm(name)
  if (!query) return 0
  if (n === query) return 3
  if (n.startsWith(query) || n.split(/\s+/).some((word) => word.startsWith(query))) return 2
  return n.includes(query) ? 1 : 0
}

export function rankingHref(instance: string, tab?: string, boss?: string): string {
  const path = `/leaderboards/${instancePathSegment(instance)}${tab ? `/${tab}` : ""}`
  return boss ? `${path}?${new URLSearchParams({ encounters: boss })}` : path
}

function rankingMatch(instance: string, boss?: string): RankingMatch {
  return {
    instance,
    boss,
    href: rankingHref(instance, boss ? "performances" : undefined, boss),
    tabs: [
      { label: "Ratings", href: rankingHref(instance, "ratings", boss) },
      { label: "Performances", href: rankingHref(instance, "performances", boss) },
      { label: "Speedruns", href: rankingHref(instance, "speedruns", boss) },
      { label: "Statistics", href: rankingHref(instance, "statistics", boss) },
    ],
  }
}

/** Raids and bosses whose names (or raid initials) match the query, best first. */
export function matchRankings(query: string, instances: readonly SupportedInstance[], limit = 4): RankingMatch[] {
  const q = norm(query)
  if (q.length < 2) return []
  const scored: { score: number; match: RankingMatch }[] = []
  for (const instance of instances) {
    if (instance.fallback) continue
    const names = [instance.name, ...(instance.derived_names ?? [])]
    const raidScore = Math.max(...names.map((name) => score(name, q)), initials(instance.name) === q || RAID_ALIASES[instance.name]?.includes(q) ? 3 : 0)
    if (raidScore > 0) scored.push({ score: raidScore + 0.5, match: rankingMatch(instance.name) })
    for (const boss of instance.progression_bosses ?? []) {
      const bossScore = score(boss, q)
      if (bossScore > 0) scored.push({ score: bossScore, match: rankingMatch(instance.name, boss) })
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((row) => row.match)
}

export function matchPages(query: string, links: readonly NavLink[], limit = 4): NavLink[] {
  const q = norm(query)
  if (!q) return []
  return links
    .map((link) => ({ link, score: Math.max(score(link.title, q) * 2, ...(link.keywords ?? []).map((word) => score(word, q))) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.link)
}

/**
 * Pick the one result worth a large card, the way a search engine answers a query outright:
 * an exact character or guild name, then a raid or boss, then the best-matching player or page.
 */
export function pickTopResult(query: string, results: Omit<GlobalSearchResults, "top">): TopResult | undefined {
  const q = norm(query)
  const player = results.players.find((row) => norm(row.name) === q)
  if (player) return { kind: "player", player }
  const guild = results.guilds.find((row) => norm(row.name) === q)
  if (guild) return { kind: "guild", guild }
  const page = results.pages.find((link) => norm(link.title) === q)
  if (page) return { kind: "page", link: page }
  if (results.rankings[0]) return { kind: "ranking", ranking: results.rankings[0] }
  if (results.players[0]) return { kind: "player", player: results.players[0] }
  if (results.guilds[0]) return { kind: "guild", guild: results.guilds[0] }
  if (results.pages[0]) return { kind: "page", link: results.pages[0] }
  return undefined
}

export const playerHref = (player: Pick<ArmorySearchResult, "realm_name" | "id">) =>
  `/armory/${encodeURIComponent(player.realm_name)}/${encodeURIComponent(player.id)}`
export const guildHref = (guild: Pick<GuildInfo, "id">) => `/g/${guild.id}`
export const raidSearchHref = (query: string) => `/search?${new URLSearchParams({ q: query })}`
