/**
 * Mock data for the leaderboard hub design review. Deterministic so stories and
 * screenshots stay stable. Nothing here is real data.
 */
import type {
  ParseScoreCohortResponse,
  ParseScoreSpread,
  RankingsBoxPlotStats,
  RankingsEntry,
  RankingsKillTimeStats,
  RankingsSuccessRate,
  SpeedrunLeaderboardEntry,
  TimeParseCohortResponse,
  TimeParseSpread,
} from "@/api/typesGenerated"
import { calculateMastery } from "@/pages/ArmoryPage/overview/masteryRenownModel"
import { mockRealm, mockRealmSeed } from "@/pages/Leaderboards/Ratings/mockRealm"
import { MOLTEN_CORE_BOSSES, type MasteryParts, type RatingMetric, type RatingScope } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"

export type HubRole = "dps" | "healing"
export type HubSubject = "characters" | "guilds"

export interface HubPlayer {
  id: string
  name: string
  guild: string
  cls: string
  spec: string
  subSpec?: string
  role: HubRole
  skill: number
}

export interface ThroughputRow {
  player: HubPlayer
  value: number
}

export interface GuildRow {
  guild: string
  value: number
  detail: string
}

export interface SpecSpread {
  cls: string
  spec: string
  /** Set when the spec splits into subspecs; each is its own row. */
  subSpec?: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
}

export interface BossSummary {
  boss: string
  attempts: number
  kills: number
  medianKillMs: number
  best: { guild: string; ms: number }
  /** #1 per rating metric on this boss, for the current class/spec/role. */
  ratings: Record<RatingMetric, RatingLeader | undefined>
  /** Best single-log DPS or HPS on this boss, for the current role. */
  performance?: ThroughputRow
  /** With a class chosen: its best spec's place among every spec on this boss. */
  standing?: SpecStanding
}

/** A spec's place among every spec in the role, ranked by median parse. */
export interface SpecStanding {
  cls: string
  spec: string
  subSpec?: string
  median: number
  rank: number
  of: number
}

/** One spec (or subspec) of the chosen class: the class overview's headline cards. */
export interface Cohort extends SpecStanding {
  /** The role this spec is measured in; a class page lists specs from both. */
  role: HubRole
  characters: number
  best?: ThroughputRow
  peak?: RatingLeader
}

export interface RatingLeader {
  player: HubPlayer
  score: number
}

const DPS_SPECS: [string, string][] = [
  ["WARRIOR", "Fury"],
  ["WARRIOR", "Arms"],
  ["ROGUE", "Combat"],
  ["ROGUE", "Assassination"],
  ["MAGE", "Fire"],
  ["MAGE", "Frost"],
  ["WARLOCK", "Destruction"],
  ["WARLOCK", "Affliction"],
  ["HUNTER", "Marksmanship"],
  ["HUNTER", "Survival"],
  ["SHAMAN", "Enhancement"],
  ["SHAMAN", "Elemental"],
  ["DRUID", "Feral"],
  ["DRUID", "Balance"],
  ["PRIEST", "Shadow"],
  ["PALADIN", "Retribution"],
]
const HEAL_SPECS: [string, string][] = [
  ["PRIEST", "Holy"],
  ["PRIEST", "Discipline"],
  ["DRUID", "Restoration"],
  ["SHAMAN", "Restoration"],
  ["PALADIN", "Holy"],
]

/** Specs split into subspec cohorts by detected talent build. */
const SUB_SPECS: Record<string, string[]> = { "DRUID|Feral": ["Cat", "Bear"] }

export function subSpecsFor(cls: string, spec: string): string[] {
  return SUB_SPECS[`${cls}|${spec}`] ?? []
}

export const HUB_GUILDS = [
  "Cleave",
  "Skull Emoji",
  "I Griefers Inc I",
  "Remnant",
  "The Ashen Banner",
  "Smokey Tokers",
  "ThunderClan Warriors",
  "strawberry fields",
  "Amnesia",
  "Die Gilde",
]
const NAME_A = [
  "Ash",
  "Brin",
  "Cael",
  "Dra",
  "El",
  "Fen",
  "Gor",
  "Hal",
  "Ith",
  "Jor",
  "Kel",
  "Lor",
  "Mor",
  "Nyx",
  "Or",
  "Pyr",
  "Quel",
  "Ryn",
  "Syl",
  "Thal",
  "Ul",
  "Vex",
  "Wyn",
  "Zar",
]
const NAME_B = ["ric", "wen", "dor", "mira", "las", "drin", "gash", "ion", "ka", "ven", "thas", "ra", "nok", "elle", "ius", "vyn"]

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/** The current realm's players: each realm has its own roster. */
const playerCache = new Map<string, HubPlayer[]>()
function realmPlayers(): HubPlayer[] {
  const hit = playerCache.get(mockRealm())
  if (hit) return hit
  const out = buildHubPlayers()
  playerCache.set(mockRealm(), out)
  return out
}

function buildHubPlayers(): HubPlayer[] {
  const rand = mulberry32(11 + mockRealmSeed())
  const used = new Set<string>()
  const out: HubPlayer[] = []
  while (out.length < 220) {
    const name = NAME_A[Math.floor(rand() * NAME_A.length)] + NAME_B[Math.floor(rand() * NAME_B.length)]
    if (used.has(name)) continue
    used.add(name)
    const healer = rand() < 0.25
    const pool = healer ? HEAL_SPECS : DPS_SPECS
    const [cls, spec] = pool[Math.floor(rand() * pool.length)]
    out.push({
      id: `h${out.length}`,
      name,
      guild: HUB_GUILDS[Math.floor(Math.pow(rand(), 1.4) * HUB_GUILDS.length)],
      cls,
      spec,
      subSpec: subSpecsFor(cls, spec)[out.length % 3 === 0 ? 1 : 0],
      role: healer ? "healing" : "dps",
      skill: 0.55 + rand() * 0.45,
    })
  }
  return out
}

function inScope(p: HubPlayer, scope: RatingScope, role: HubRole): boolean {
  return (
    p.role === role &&
    (!scope.cls || p.cls === scope.cls) &&
    (!scope.spec || p.spec === scope.spec) &&
    (!scope.subSpec || p.subSpec === scope.subSpec)
  )
}

/** A per-scope random stream so each boss gets its own (stable) numbers. */
function scopedRand(...parts: (string | undefined)[]) {
  // Every stream is per realm: ratings, runs, and spreads differ between realms.
  return mulberry32(hash([mockRealm(), ...parts].filter(Boolean).join("|")))
}

/** Best DPS or HPS on a boss, or best boss average across the raid. */
export function topThroughput(scope: RatingScope, role: HubRole, limit = 10): ThroughputRow[] {
  const rand = scopedRand("tp", scope.boss, role)
  const base = role === "dps" ? 1250 : 1050
  return realmPlayers()
    .map((player) => ({ player, value: Math.round(base * player.skill + rand() * 260 - (scope.boss ? 0 : 90)) }))
    .filter((r) => inScope(r.player, scope, role))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

/** Distribution of typical parses per spec, best median first. */
export function specSpreads(scope: RatingScope, role: HubRole, limit = 6): SpecSpread[] {
  // Subspecs are ranked as specs of their own.
  const pool = (role === "dps" ? DPS_SPECS : HEAL_SPECS)
    .flatMap(([cls, spec]): [string, string, string?][] => {
      const subs = subSpecsFor(cls, spec)
      return subs.length ? subs.map((sub) => [cls, spec, sub]) : [[cls, spec]]
    })
    .filter(
      ([cls, spec, sub]) => (!scope.cls || cls === scope.cls) && (!scope.spec || spec === scope.spec) && (!scope.subSpec || sub === scope.subSpec),
    )
  return pool
    .map(([cls, spec, subSpec]) => {
      const rand = scopedRand("spread", scope.boss, cls, spec, subSpec)
      const median = 380 + rand() * 210
      const iqr = 30 + rand() * 50
      return {
        cls,
        spec,
        subSpec,
        median: Math.round(median),
        q1: Math.round(median - iqr * (0.4 + rand() * 0.4)),
        q3: Math.round(median + iqr * (0.4 + rand() * 0.4)),
        min: Math.round(median - iqr * (1.6 + rand() * 1.6)),
        max: Math.round(median + iqr * (1.4 + rand() * 1.4)),
      }
    })
    .sort((a, b) => b.median - a.median)
    .slice(0, limit)
}

/** Top five per rating metric for the scope and role. */
export function ratingLeaders(scope: RatingScope, role: HubRole): Record<RatingMetric, RatingLeader[]> {
  const pick = (metric: RatingMetric, spread: number, offset: number) => {
    const rand = scopedRand("rating", metric, scope.boss, role)
    const scored = realmPlayers()
      .filter((p) => inScope(p, scope, role))
      .map((player) => ({
        player,
        score: Math.min(100, player.skill * spread + rand() * offset),
      }))
    if (metric === "peak" && scope.boss) {
      // Boss Peak is a parse: the best kill in each spec (and subspec) cohort is 100 by definition.
      const best = new Map<string, number>()
      const key = (p: HubPlayer) => `${p.cls}|${p.spec}|${p.subSpec ?? ""}`
      for (const s of scored) best.set(key(s.player), Math.max(best.get(key(s.player)) ?? 0, s.score))
      for (const s of scored) s.score = (s.score / best.get(key(s.player))!) * 100
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 5)
  }
  const renownRand = scopedRand("renown", scope.boss, role)
  const renown = realmPlayers()
    .filter((p) => inScope(p, scope, role))
    .map((player) => ({ player, score: Math.round((scope.boss ? 900 : 9000) * player.skill * (0.5 + renownRand())) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
  return { peak: pick("peak", 92, 9), mastery: pick("mastery", 84, 12), renown }
}

/** Fastest full clears for the raid, or fastest kills for a boss. */
export function fastest(scope: RatingScope, instanceName: string): SpeedrunLeaderboardEntry[] {
  const rand = scopedRand("speed", scope.boss)
  const base = scope.boss ? 70_000 + rand() * 110_000 : 31 * 60_000
  return HUB_GUILDS.slice(0, 6)
    .map((guild, i) => ({ guild, ms: Math.round(base * (1 + i * 0.045 + rand() * 0.06)) }))
    .sort((a, b) => a.ms - b.ms)
    .slice(0, 3)
    .map(({ guild, ms }, i): SpeedrunLeaderboardEntry => ({
      instance_id: `${instanceName}-${scope.boss ?? "raid"}-${i}`,
      slug: "",
      difficulty_name: "",
      duration_ms: ms,
      guild_id: `g-${guild}`,
      guild_name: guild,
      guild_logo_url: guildLogo(guild),
      realm_name: mockRealm(),
      start_time: new Date(Date.UTC(2026, 9, 11 + i * 7, 19)).toISOString(),
      completion_time: new Date(Date.UTC(2026, 9, 11 + i * 7, 20)).toISOString(),
      player_count: 30 - (i % 2),
      parser_version: "",
      addon_version: "",
    }))
}

/** Boss order per raid. Mock lists; real ones come from encounter data. */
export const INSTANCE_BOSSES: Record<string, readonly string[]> = {
  "Molten Core": MOLTEN_CORE_BOSSES,
  "Zul'Gurub": [
    "High Priest Venoxis",
    "High Priestess Jeklik",
    "High Priestess Mar'li",
    "Bloodlord Mandokir",
    "Gri'lek",
    "Hazza'rah",
    "Renataki",
    "Wushoolay",
    "High Priest Thekal",
    "Gahz'ranka",
    "High Priestess Arlokk",
    "Jin'do the Hexxer",
    "Hakkar",
  ],
}

/** Bosses a raid can skip and still clear. Shown, but labeled optional. */
export const OPTIONAL_BOSSES: ReadonlySet<string> = new Set([
  "Bloodlord Mandokir",
  // Edge of Madness: one of the four is up at a time, but each is its own boss.
  "Gri'lek",
  "Hazza'rah",
  "Renataki",
  "Wushoolay",
  "Gahz'ranka",
  "Jin'do the Hexxer",
])

export function instanceBosses(instanceName: string): readonly string[] {
  return INSTANCE_BOSSES[instanceName] ?? MOLTEN_CORE_BOSSES
}

/** Fastest total kill time over a set of bosses: summed kill durations, gaps between bosses excluded. */
export function fastestTotal(bosses: readonly string[], allBosses: readonly string[], instanceName: string): SpeedrunLeaderboardEntry[] {
  const summaries = bossSummaries({}, "dps", allBosses).filter((b) => bosses.includes(b.boss))
  const base = summaries.reduce((sum, b) => sum + b.best.ms, 0)
  const rand = scopedRand("total", ...bosses)
  return fastest({}, instanceName).map((e, i) => ({
    ...e,
    instance_id: `${e.instance_id}-set`,
    duration_ms: Math.round(base * (1.04 + i * 0.03 + rand() * 0.02)),
  }))
}

export function bossSummaries(scope: RatingScope = {}, role: HubRole = "dps", bosses: readonly string[] = MOLTEN_CORE_BOSSES): BossSummary[] {
  return bosses.map((boss, i) => {
    const rand = scopedRand("boss", boss)
    const attempts = 900 + Math.round(rand() * 400)
    const last = i === bosses.length - 1
    const difficulty = last ? 0.62 : 0.8 + rand() * 0.18
    const median = (last ? 170_000 : 60_000) + rand() * 90_000
    return {
      boss,
      attempts,
      kills: Math.round(attempts * difficulty),
      medianKillMs: Math.round(median),
      best: { guild: HUB_GUILDS[Math.floor(rand() * 4)], ms: Math.round(median * (0.55 + rand() * 0.1)) },
      ratings: (() => {
        const leaders = ratingLeaders({ ...scope, boss }, role)
        return { peak: leaders.peak[0], mastery: leaders.mastery[0], renown: leaders.renown[0] }
      })(),
      performance: topThroughput({ ...scope, boss }, role, 1)[0],
      standing: scope.cls ? classStanding({ ...scope, boss }, role)[0] : undefined,
    }
  })
}

export function bossSummary(boss: string, bosses: readonly string[] = MOLTEN_CORE_BOSSES): BossSummary {
  return bossSummaries({}, "dps", bosses).find((b) => b.boss === boss)!
}

/** Specs a class plays in a role; empty when the class cannot fill it. */
export function specsFor(cls: string, role: HubRole): string[] {
  return (role === "dps" ? DPS_SPECS : HEAL_SPECS).filter(([c]) => c === cls).map(([, spec]) => spec)
}

/** Guild rows standing in for the character rows when the subject is guilds. */
/** `perBoss`: counts are boss kills (a boss or a combined set), not full clears. */
export function guildRows(
  kind: "clears" | "throughput" | "renown",
  scope: RatingScope,
  role: HubRole,
  limit = 5,
  perBoss = !!scope.boss,
): GuildRow[] {
  const rand = scopedRand("guild", kind, scope.boss, scope.cls, scope.spec, role)
  return HUB_GUILDS.map((guild, i) => {
    const strength = 1 - i * 0.05 + rand() * 0.12
    if (kind === "clears") return { guild, value: Math.round(26 * strength), detail: perBoss ? "kills" : "clears" }
    if (kind === "renown") {
      // Renown rewards staying power: long-running guilds with many clears lead.
      const months = 4 + Math.round(strength * 20 + rand() * 6)
      const since = new Date(Date.UTC(2026, 10 - months, 1)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
      return {
        guild,
        value: Math.round((scope.boss ? 3800 : 42000) * strength),
        detail: `${Math.round(months * 1.6)} ${perBoss ? "kills" : "clears"} · raiding since ${since}`,
      }
    }
    return { guild, value: Math.round((role === "dps" ? 980 : 760) * strength), detail: `${role === "dps" ? "DPS" : "HPS"} avg · top 10` }
  })
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

export function formatClock(ms: number): string {
  // Truncate like the speedrun podium so the same run reads the same everywhere.
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, "0")}`
}

/** Landing-card headline per instance: one leader from each part of the hub. */
export interface InstanceHeadline {
  name: string
  kind: "raid" | "dungeon"
  bosses: number
  kills: number
  /** Top three full clears, fastest first. */
  fastest: { guild: string; ms: number }[]
  renown: { guild: string; value: number }
  /** #1 per rating metric. */
  ratings: Record<RatingMetric, RatingLeader>
  /** Top three single-log DPS. */
  performances: ThroughputRow[]
}

const LANDING_INSTANCES: { name: string; kind: "raid" | "dungeon"; bosses: number; clearMinutes: number; dps: number }[] = [
  { name: "Lower Tower of Karazhan", kind: "raid", bosses: 6, clearMinutes: 48, dps: 1500 },
  { name: "Zul'Gurub", kind: "raid", bosses: 13, clearMinutes: 52, dps: 1350 },
  { name: "Blackwing Lair", kind: "raid", bosses: 8, clearMinutes: 64, dps: 880 },
  { name: "Onyxia's Lair", kind: "raid", bosses: 1, clearMinutes: 4, dps: 1180 },
  { name: "Molten Core", kind: "raid", bosses: 12, clearMinutes: 32, dps: 1450 },
  { name: "Deadmines", kind: "dungeon", bosses: 6, clearMinutes: 18, dps: 55 },
]

export function instanceHeadlines(): InstanceHeadline[] {
  return LANDING_INSTANCES.map((inst) => {
    const rand = scopedRand("landing", inst.name)
    const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]
    const player = () => realmPlayers().filter((p) => p.role === "dps")[Math.floor(rand() * 160)]
    const clear = inst.clearMinutes * 60_000
    const top = Math.round(inst.dps * (0.97 + rand() * 0.06))
    return {
      name: inst.name,
      kind: inst.kind,
      bosses: inst.bosses,
      kills: Math.round(200 + rand() * 4500),
      fastest: [0, 1, 2].map((i) => ({
        guild: HUB_GUILDS[(i + Math.floor(rand() * 5)) % 6],
        ms: Math.round(clear * (0.95 + i * 0.04 + rand() * 0.02)),
      })),
      renown: { guild: pick(HUB_GUILDS.slice(0, 5)), value: Math.round(inst.bosses * 3500 * (0.8 + rand() * 0.4)) },
      ratings: {
        peak: { player: player(), score: 97 + rand() * 3 },
        mastery: { player: player(), score: 90 + rand() * 5 },
        renown: { player: player(), score: Math.round(inst.bosses * 1000 * (0.9 + rand() * 0.3)) },
      },
      performances: [0, 1, 2].map((i) => ({ player: player(), value: Math.round(top * (1 - i * 0.05 - rand() * 0.02)) })),
    }
  })
}

/** Kill-time distribution per boss, in the shape the statistics leaderboard's box plot takes. */
export function killTimeStats(bosses: readonly string[], allBosses: readonly string[]): RankingsKillTimeStats[] {
  // Follow the caller's order (required bosses first, then optional).
  const byName = new Map(bossSummaries({}, "dps", allBosses).map((b) => [b.boss, b]))
  return bosses
    .flatMap((name) => byName.get(name) ?? [])
    .map((b) => {
      const med = b.medianKillMs / 1000
      return {
        encounter_name: b.boss,
        min_secs: Math.round(b.best.ms / 1000),
        q1_secs: Math.round(med * 0.86),
        median_secs: Math.round(med),
        q3_secs: Math.round(med * 1.18),
        max_secs: Math.round(med * 1.9),
        count: b.kills,
      }
    })
}

/** Whole-raid clear durations: first pull to last kill. */
export function clearTimeStats(instanceName: string): RankingsKillTimeStats[] {
  const best = fastest({}, instanceName)[0].duration_ms / 1000
  return [
    {
      encounter_name: "Full clear",
      min_secs: Math.round(best),
      q1_secs: Math.round(best * 1.35),
      median_secs: Math.round(best * 1.6),
      q3_secs: Math.round(best * 2),
      max_secs: Math.round(best * 4.2),
      count: 1840,
    },
  ]
}

export function successRates(bosses: readonly string[], allBosses: readonly string[]): RankingsSuccessRate[] {
  const byName = new Map(bossSummaries({}, "dps", allBosses).map((b) => [b.boss, b]))
  return bosses
    .flatMap((name) => byName.get(name) ?? [])
    .map((b) => ({ encounter_name: b.boss, kills: b.kills, wipes: b.attempts - b.kills, total: b.attempts }))
}

/**
 * Mock guild emblem: a tinted disc with the guild's initial. Every third
 * guild has none, so the table shows both cases.
 */
export function guildLogo(guild: string): string | undefined {
  const h = hash(guild)
  if (h % 3 === 0) return undefined
  const hue = h % 360
  const letter =
    guild
      .replace(/[^A-Za-z]/g, "")
      .charAt(0)
      .toUpperCase() || "?"
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="hsl(${hue} 45% 32%)"/><circle cx="20" cy="20" r="16" fill="none" stroke="hsl(${hue} 60% 60%)" stroke-width="1.5"/><text x="20" y="26" text-anchor="middle" font-family="Georgia,serif" font-size="17" font-weight="700" fill="hsl(${hue} 80% 85%)">${letter}</text></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Top guild runs for the selection: full clears, one boss's kills, or a set's total kill time. */
export function speedruns(
  bosses: readonly string[] | undefined,
  allBosses: readonly string[],
  instanceName: string,
  limit = 10,
): SpeedrunLeaderboardEntry[] {
  const top = !bosses
    ? fastest({}, instanceName)[0].duration_ms
    : bosses.length === 1
      ? fastest({ boss: bosses[0] }, instanceName)[0].duration_ms
      : fastestTotal(bosses, allBosses, instanceName)[0].duration_ms
  const rand = scopedRand("speedruns", instanceName, ...(bosses ?? ["clear"]))
  // Stronger guilds tend to be faster, but each boss reshuffles the order a little.
  const timed = HUB_GUILDS.map((guild, i) => ({ guild, slow: i * 0.035 + rand() * 0.16 })).sort((a, b) => a.slow - b.slow)
  return timed.slice(0, limit).map(({ guild }, i) => ({
    ...fastest({}, instanceName)[0],
    instance_id: `${instanceName}-run-${i}`,
    guild_id: `g-${guild}`,
    guild_name: guild,
    guild_logo_url: guildLogo(guild),
    duration_ms: Math.round(top * (1 + i * 0.035 + rand() * 0.02)),
    player_count: 30 - (i % 3),
    realm_name: mockRealm(),
    completion_time: new Date(Date.UTC(2026, 9, 3 + i * 2, 21)).toISOString(),
  }))
}

/** Every spec in the role on a boss (or across the raid), best median first. */
export function specStanding(boss: string | undefined, role: HubRole): SpecSpread[] {
  return specSpreads({ boss }, role, 99)
}

/** The chosen class's specs and subspecs (or the chosen spec's) with their rank among all of them, best first. */
export function classStanding(scope: RatingScope, role: HubRole): SpecStanding[] {
  const all = specStanding(scope.boss, role)
  return all
    .map((s, i) => ({ cls: s.cls, spec: s.spec, subSpec: s.subSpec, median: s.median, rank: i + 1, of: all.length }))
    .filter((s) => s.cls === scope.cls && (!scope.spec || s.spec === scope.spec))
}

/**
 * Headline cards for a class: one per spec in the role, subspecs standing as
 * specs of their own (Feral (Cat), Feral (Bear), Balance).
 */
export function cohorts(scope: RatingScope, role: HubRole): Cohort[] {
  if (!scope.cls) return []
  // The current role first, then the class's specs in the other role (Restoration on a Druid DPS page).
  const roles: HubRole[] = role === "dps" ? ["dps", "healing"] : ["healing", "dps"]
  return roles.flatMap((r) => cohortsInRole(scope, r))
}

function cohortsInRole(scope: RatingScope, role: HubRole): Cohort[] {
  return classStanding({ boss: scope.boss, cls: scope.cls, spec: scope.spec }, role).map((s) => {
    const sc: RatingScope = { boss: scope.boss, cls: s.cls, spec: s.spec, subSpec: s.subSpec }
    const rand = scopedRand("cohort", scope.boss, s.cls, s.spec, s.subSpec)
    const players = realmPlayers().filter((p) => inScope(p, sc, role)).length
    return {
      ...s,
      role,
      characters: players * 37 + Math.round(rand() * 30),
      best: topThroughput(sc, role, 1)[0],
      peak: ratingLeaders(sc, role).peak[0],
    }
  })
}

/** Every spec's parse spread in the statistics box plot's shape. */
export function boxPlotStats(boss: string | undefined, role: HubRole): RankingsBoxPlotStats[] {
  return specStanding(boss, role).map((s) => {
    const rand = scopedRand("count", boss, s.cls, s.spec, s.subSpec)
    return {
      player_class: s.cls,
      player_spec: s.spec,
      player_sub_spec: s.subSpec,
      min_dps: s.min,
      q1_dps: s.q1,
      median_dps: s.median,
      q3_dps: s.q3,
      max_dps: s.max,
      count: Math.round((boss ? 400 : 4200) * (0.4 + rand())),
    }
  })
}

/** A guild on a rating board: its runs are rated like a player's parses. */
export interface GuildRating {
  guild: string
  logo?: string
  score: number
  /** What the score stands on: the run time for Peak, Form/Floor for Mastery, kills for Renown. */
  detail: string
  /** Ranked Mastery only: Peak, Form, Floor, and the confidence its kills earn. */
  mastery?: MasteryParts
  /** Peak only: the run behind it (summed over a set of bosses) and its date (the latest, for a set). */
  ms?: number
  date?: string
}

/**
 * Guild Peak, Ranked Mastery, and Renown for a selection. A run's parse is its
 * time against rank one (fastest = 100): the clear time for a full clear, the
 * kill time for one boss, and the kill parses averaged over a set, just as a
 * player's raid score averages their bosses.
 */
export function guildRatings(
  bosses: readonly string[] | undefined,
  allBosses: readonly string[],
  instanceName: string,
  limit = 10,
): Record<RatingMetric, GuildRating[]> {
  const parse = (runs: SpeedrunLeaderboardEntry[]) => {
    const r1 = Math.min(...runs.map((r) => r.duration_ms))
    return new Map(
      runs.map((r) => [
        r.guild_name,
        { score: (r1 / r.duration_ms) * 100, ms: r.duration_ms, date: r.completion_time, players: r.player_count, realm: r.realm_name },
      ]),
    )
  }
  const sets = (bosses ?? [undefined]).map((b) => parse(speedruns(b ? [b] : undefined, allBosses, instanceName)))
  const rand = scopedRand("guild-rating", instanceName, ...(bosses ?? ["clear"]))
  const rows = HUB_GUILDS.map((guild) => {
    const parses = sets.map((m) => m.get(guild)!).filter(Boolean)
    const peak = parses.reduce((sum, p) => sum + p.score, 0) / parses.length
    const form = Math.min(peak, peak - 2 - rand() * 9)
    const floor = form - 3 - rand() * 8
    const kills = 6 + Math.floor(rand() * 30)
    return {
      guild,
      logo: guildLogo(guild),
      peak: {
        score: peak,
        detail: parses.length === 1 ? `${parses[0].players} players · ${parses[0].realm}` : `${parses.length} kills summed · ${parses[0].realm}`,
        ms: parses.reduce((sum, p) => sum + p.ms, 0),
        date: new Date(Math.max(...parses.map((p) => Date.parse(p.date)))).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }),
      },
      mastery: (() => {
        // Mastery = 30% Peak + 50% Form + 20% Floor, discounted until five kills, as for players.
        const m = calculateMastery({ peak, form, floor, kills })
        return {
          score: m.rankedMastery,
          detail: `${kills} ${bosses ? "kills" : "clears"}`,
          // Guilds raid weekly, so most clear the five-kill bar; a few newer ones are still short of it.
          mastery: { peak, form, floor, confidence: m.confidence, kills, evidence: kills > 12 ? 1 : (kills % 6) / 5 },
        }
      })(),
      renown: {
        score: Math.round((bosses ? 900 * bosses.length : 14000) * (0.35 + rand())),
        detail: `${kills * (bosses ? 3 : 1)} ${bosses ? "kills" : "clears"} witnessed`,
      },
    }
  })
  const board = (m: RatingMetric) =>
    rows
      .map((r) => ({ guild: r.guild, logo: r.logo, ...r[m] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  return { peak: board("peak"), mastery: board("mastery"), renown: board("renown") }
}

/** One guild's spread of run times (ms): best, quartiles, worst. */
export interface GuildTimeSpread {
  guild: string
  logo?: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  runs: number
}

/**
 * Typical clear (or kill) time per guild, fastest median first: the guild
 * counterpart of a spec's parse spread, and a picture of its consistency.
 */
export function guildTimeSpreads(
  bosses: readonly string[] | undefined,
  allBosses: readonly string[],
  instanceName: string,
  limit = 8,
): GuildTimeSpread[] {
  return speedruns(bosses, allBosses, instanceName, 10)
    .map((r) => {
      const rand = scopedRand("guild-spread", instanceName, r.guild_name, ...(bosses ?? ["clear"]))
      const best = r.duration_ms
      const median = best * (1.04 + rand() * 0.1)
      const q1 = best + (median - best) * (0.45 + rand() * 0.3)
      const q3 = median * (1.02 + rand() * 0.06)
      return {
        guild: r.guild_name,
        logo: r.guild_logo_url,
        min: best,
        q1: Math.round(q1),
        median: Math.round(median),
        q3: Math.round(q3),
        max: Math.round(q3 * (1.04 + rand() * 0.12)),
        runs: 6 + Math.floor(rand() * 20),
      }
    })
    .sort((a, b) => a.median - b.median)
    .slice(0, limit)
}

/** Parse tier floors, as the parsing leaderboard draws them. */
const PARSE_TIERS = [25, 50, 75, 95, 99, 100]
const MOCK_DIFFICULTY = { name: "Normal", players: 40 }
/** The difficulty option the parsing views expect for the mock spreads. */
export const MOCK_SPREAD_DIFFICULTY = { key: "Normal|40", difficultyName: "Normal", maxPlayers: 40, sampleSize: 0 }

/** Every class/spec (subspecs split out) in a role, as [class, spec, subSpec?]. */
function cohortsInRolePool(role: HubRole): [string, string, string?][] {
  return (role === "dps" ? DPS_SPECS : HEAL_SPECS).flatMap(([cls, spec]): [string, string, string?][] => {
    const subs = subSpecsFor(cls, spec)
    return subs.length ? subs.map((sub) => [cls, spec, sub]) : [[cls, spec]]
  })
}

/**
 * Parse spreads in the parsing leaderboard's shape: per boss and spec cohort, the DPS (or HPS) each
 * parse tier takes. Served to the parsing views by the stories' MSW handler.
 */
export function parseSpreads(metric: "dps" | "hps", encounters: readonly string[], cls?: string, spec?: string): ParseScoreSpread[] {
  const role: HubRole = metric === "dps" ? "dps" : "healing"
  return encounters.flatMap((boss) =>
    cohortsInRolePool(role)
      .filter(([c, s]) => (!cls || c === cls) && (!spec || s === spec))
      .map(([c, s, sub]) => {
        const rand = scopedRand("parse", metric, boss, c, s, sub)
        const median = (metric === "dps" ? 520 : 470) + rand() * 260
        const spread = median * (0.35 + rand() * 0.2)
        const at = (floor: number) => Math.round(median - spread + (floor / 100) * spread * 1.9)
        return {
          encounter_name: boss,
          difficulty_name: MOCK_DIFFICULTY.name,
          max_players: MOCK_DIFFICULTY.players,
          player_class: c,
          player_spec: s,
          player_sub_spec: sub,
          sample_size: 40 + Math.floor(rand() * 900),
          status: "ok",
          min: Math.round(median - spread * 1.2),
          median: Math.round(median),
          max: Math.round(median + spread * 1.05),
          cutoffs: PARSE_TIERS.map((floor) => ({ floor, value: at(floor) })),
        }
      }),
  )
}

/**
 * Single-kill DPS/HPS rows in the statistics leaderboard's shape, best first: one boss's kills, or the
 * best kills across the selection's bosses.
 */
export function performanceEntries(
  scope: RatingScope,
  role: HubRole,
  instanceName: string,
  bosses: readonly string[],
  limit = 25,
): (RankingsEntry & { rank: number })[] {
  const encounters = scope.boss ? [scope.boss] : bosses
  return encounters
    .flatMap((boss) =>
      topThroughput({ ...scope, boss }, role, limit).map(({ player, value }) => {
        const rand = scopedRand("perf", boss, player.id)
        const secs = 70 + Math.round(rand() * 160)
        return {
          id: `${boss}-${player.id}`,
          encounter_name: boss,
          instance_name: instanceName,
          player_guid: player.id,
          player_name: player.name,
          player_class: player.cls,
          player_spec: player.spec,
          player_role: role === "dps" ? "damage" : "healer",
          player_level: 60,
          difficulty_name: MOCK_DIFFICULTY.name,
          max_players: MOCK_DIFFICULTY.players,
          sub_spec: player.subSpec,
          realm_id: "r1",
          realm_name: mockRealm(),
          guild_name: player.guild,
          damage_done: role === "dps" ? value * secs : 0,
          healing_done: role === "healing" ? Math.round(value * secs * 0.9) : 0,
          absorbed_done: role === "healing" ? Math.round(value * secs * 0.1) : 0,
          duration_secs: secs,
          dps: role === "dps" ? value : 0,
          hps: role === "healing" ? value : 0,
          log_hashed_slug: `mock-${boss}-${player.id}`,
          killed_at: new Date(Date.UTC(2026, 9, 1) + Math.floor(rand() * 30) * 86_400_000).toISOString(),
        }
      }),
    )
    .sort((a, b) => (role === "dps" ? b.dps - a.dps : b.hps - a.hps))
    .slice(0, limit)
    .map((e, i) => ({ ...e, rank: i + 1 }))
}

/** Kill-time and clear-time parse spreads for an instance (guild parses: faster is better). */
export function timeParseSpreads(instanceName: string, bosses: readonly string[]): TimeParseSpread[] {
  const spread = (kind: TimeParseSpread["kind"], encounter: string | undefined, median: number): TimeParseSpread => {
    const rand = scopedRand("time-spread", instanceName, kind, encounter)
    const range = median * (0.3 + rand() * 0.15)
    return {
      kind,
      encounter_name: encounter,
      difficulty_name: MOCK_DIFFICULTY.name,
      max_players: MOCK_DIFFICULTY.players,
      sample_size: 60 + Math.floor(rand() * 400),
      status: "ok",
      min_ms: Math.round(median - range * 0.8),
      median_ms: Math.round(median),
      max_ms: Math.round(median + range * 1.6),
      // Lower is better: higher tiers take a shorter time.
      cutoffs: PARSE_TIERS.map((floor) => ({ floor, duration_ms: Math.round(median + range * 0.9 - (floor / 100) * range * 1.7) })),
    }
  }
  const summaries = bossSummaries({}, "dps", bosses)
  return [spread("clear_time", undefined, 46 * 60_000), ...summaries.map((b) => spread("boss_kill", b.boss, b.medianKillMs))]
}

/** One kill-time (or clear-time) cohort: every guild's best run, ranked. */
export function timeParseCohort(
  instanceName: string,
  kind: TimeParseSpread["kind"],
  encounter: string,
  bosses: readonly string[],
): TimeParseCohortResponse {
  const runs = speedruns(kind === "clear_time" ? undefined : [encounter], bosses, instanceName, 10)
  const r1 = runs[0]?.duration_ms ?? 1
  return {
    cutoff: new Date(Date.UTC(2026, 10, 2)).toISOString(),
    lookback_days: 60,
    kind,
    instance_name: instanceName,
    encounter_name: kind === "clear_time" ? undefined : encounter,
    difficulty_name: MOCK_DIFFICULTY.name,
    max_players: MOCK_DIFFICULTY.players,
    sample_size: runs.length,
    status: "ok",
    entries: runs.map((r, i) => ({
      rank: i + 1,
      duration_ms: r.duration_ms,
      precise_score: (r1 / r.duration_ms) * 100,
      display_score: Math.round((r1 / r.duration_ms) * 100),
      killed_at: r.completion_time,
      instance_id: r.instance_id,
      guild_id: r.guild_id,
      guild_name: r.guild_name,
    })),
  }
}

/** One live parse cohort: every ranked kill for a spec on a boss, best first. */
export function parseCohort(metric: "dps" | "hps", boss: string, cls: string, spec?: string, subSpec?: string): ParseScoreCohortResponse {
  const spread = parseSpreads(metric, [boss], cls, spec).find((s) => !subSpec || s.player_sub_spec === subSpec)
  const rand = scopedRand("cohort-entries", metric, boss, cls, spec, subSpec)
  const count = 60
  const entries = Array.from({ length: count }, (_, i) => {
    const t = 1 - i / (count - 1)
    const value = spread ? Math.round(spread.min + (spread.max - spread.min) * Math.pow(t, 0.8)) : 0
    const name = realmPlayers()[Math.floor(rand() * realmPlayers().length)].name
    return {
      rank: i + 1,
      sample_size: 1,
      player_guid: `p${i}`,
      player_name: name,
      metric_value: value,
      precise_score: t * 100,
      display_score: Math.round(t * 100),
      status: "ok",
      killed_at: new Date(Date.UTC(2026, 9, 1) + Math.floor(rand() * 30) * 86_400_000).toISOString(),
      run_id: `run-${i}`,
      instance_id: `inst-${i}`,
    }
  })
  return {
    available: true,
    cutoff: new Date(Date.UTC(2026, 10, 2)).toISOString(),
    lookback_days: 60,
    cohort_mode: "spec",
    metric,
    encounter_name: boss,
    difficulty_name: MOCK_DIFFICULTY.name,
    max_players: MOCK_DIFFICULTY.players,
    player_class: cls,
    player_spec: spec,
    player_sub_spec: subSpec,
    sample_size: count,
    status: "ok",
    entries,
  }
}
