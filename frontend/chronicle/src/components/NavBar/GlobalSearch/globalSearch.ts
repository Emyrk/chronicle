import type { SearchSuggestionPlayer, SearchSuggestionGuild, SupportedInstance } from "@/api/typesGenerated"
import { encodeQuery, type Node } from "@/pages/InstanceSearch/queryModel"
import { instancePathSegment } from "@/pages/Leaderboards/v2Selection"
import type { NavLink } from "../navItems"

export type SearchPlayer = SearchSuggestionPlayer
export type SearchGuild = SearchSuggestionGuild

/** A local catalog match with only destinations supported by its metadata. */
export interface RankingMatch {
  instance: string
  /** Set when the query matched a boss rather than the raid itself. */
  boss?: string
  href: string
  searchHref: string
  searchRequiresLogin: boolean
  /** Capability-aware catalog destinations. */
  tabs: { label: string; href: string }[]
}

export type TopResult =
  | { kind: "player"; player: SearchPlayer }
  | { kind: "guild"; guild: SearchGuild }
  | { kind: "ranking"; ranking: RankingMatch }
  | { kind: "page"; link: NavLink }

export interface GlobalSearchResults {
  top?: TopResult
  rankings: RankingMatch[]
  players: readonly SearchPlayer[]
  guilds: readonly SearchGuild[]
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

/** Only these names are explicitly published as canonical ranking encounters. */
function rankingBosses(instance: SupportedInstance): string[] {
  return [...new Set([
    ...(instance.progression_bosses ?? []),
    ...(instance.ranking_encounter_sets ?? []).flatMap((set) => set.encounters),
  ])]
}

function rankingMatch(instance: SupportedInstance, boss?: string): RankingMatch {
  const ranked = rankingBosses(instance).length > 0
  const searchHref = boss ? bossSearchHref(instance.name, boss) : instanceSearchHref(instance.name)
  const tabs: RankingMatch["tabs"] = []
  if (ranked) {
    tabs.push(
      { label: "Ratings", href: rankingHref(instance.name, "ratings", boss) },
      { label: "Performances", href: rankingHref(instance.name, "performances", boss) },
    )
  }
  // A full-clear speedrun is a raid destination, not a boss-filtered board.
  if (instance.speedrun_rules) tabs.push({ label: "Speedruns", href: rankingHref(instance.name, "speedruns") })
  if (ranked) tabs.push({ label: "Statistics", href: rankingHref(instance.name, "statistics", boss) })
  if (instance.speedrun_rules || Object.keys(instance.damage_by_encounter ?? {}).length > 0) {
    tabs.push({ label: "Rules", href: rankingHref(instance.name, "rulesets") })
  }
  tabs.push({ label: boss ? "Search logs (login required)" : "Search logs", href: searchHref })
  return {
    instance: instance.name,
    boss,
    href: ranked ? rankingHref(instance.name, boss ? "performances" : undefined, boss) : searchHref,
    searchHref,
    searchRequiresLogin: !!boss,
    tabs,
  }
}

function instanceNames(instance: SupportedInstance): string[] {
  return [instance.name, ...(instance.derived_names ?? []), ...(instance.zone_names ?? []),
    initials(instance.name), ...(RAID_ALIASES[instance.name] ?? [])]
}

/** Local catalog only: never fetch uploaded logs to populate suggestions. */
export function matchRankings(query: string, instances: readonly SupportedInstance[], limit = 4): RankingMatch[] {
  const q = norm(query)
  if (q.length < 2) return []
  const scored = new Map<string, { score: number; match: RankingMatch }>()
  const add = (value: number, match: RankingMatch) => {
    const key = JSON.stringify([match.instance, match.boss])
    if (value > (scored.get(key)?.score ?? 0)) scored.set(key, { score: value, match })
  }
  for (const instance of instances) {
    if (instance.fallback) continue
    const raidScore = Math.max(...instanceNames(instance).map((name) => score(name, q)))
    if (raidScore > 0) add(raidScore + 0.5, rankingMatch(instance))
    const bosses = rankingBosses(instance)
    for (const boss of bosses) {
      const bossScore = score(boss, q)
      if (bossScore > 0) add(bossScore, rankingMatch(instance, boss))
    }
    // Creature labels are not always encounter names. Unknown bosses and adds
    // lead to their parent instance, never a fabricated encounter filter.
    const units = [...(instance.bosses ?? []), ...(instance.trash ?? [])]
    const unitScore = Math.max(0, ...units.filter((unit) => !bosses.includes(unit.name)).map((unit) => score(unit.name, q)))
    if (unitScore > 0) add(unitScore, rankingMatch(instance))
  }
  return [...scored.values()].sort((a, b) => b.score - a.score).slice(0, limit).map((row) => row.match)
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

export const playerHref = (player: Pick<SearchSuggestionPlayer, "realm_name" | "id">) =>
  `/armory/${encodeURIComponent(player.realm_name)}/${encodeURIComponent(player.id)}`
export const guildHref = (guild: Pick<SearchSuggestionGuild, "id">) => `/g/${guild.id}`
function searchHref(where: Node): string {
  return `/search?${new URLSearchParams({ q: encodeQuery(where) })}`
}

const instanceSearchHref = (instance: string) => searchHref({ field: "instance.name", op: "=", value: instance })

/** Encounter quantifiers require login, unlike the simple raid-name handoff. */
export const bossSearchHref = (instance: string, boss: string) => searchHref({ and: [
  { field: "instance.name", op: "=", value: instance },
  { any_encounter: { field: "encounter.name", op: "=", value: boss } },
] })

export function raidSearchHref(query: string, instances: readonly SupportedInstance[] = []): string {
  const q = norm(query)
  const instance = instances.find((row) => !row.fallback && instanceNames(row).some((name) => norm(name) === q))
  if (instance) return instanceSearchHref(instance.name)
  return q ? searchHref({ field: "instance.name", op: "contains", value: query.trim() }) : "/search"
}
