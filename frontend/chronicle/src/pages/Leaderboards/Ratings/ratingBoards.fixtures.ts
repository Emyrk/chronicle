import { calculateMastery } from "@/pages/ArmoryPage/overview/masteryRenownModel"
import { mockRealm, mockRealmSeed } from "./mockRealm"

/**
 * Display-only mock data for the rating leaderboard design. Names, guilds, and
 * scores are generated from a fixed seed. These are not real players or ratings.
 */

export type RatingMetric = "peak" | "mastery" | "renown"
export const RATING_METRICS: RatingMetric[] = ["peak", "mastery", "renown"]
export type RatingPeriod = "180d" | "all"

export interface RatingEntry {
  id: string
  name: string
  /** Published character identity for the site-wide Alt+click entity menu. */
  realm?: string
  guid?: string
  guild?: string
  cls: string
  spec: string
  /** Generated build label for the visual sub-spec drill-down; not player data. */
  subSpec: string
  score: number
  detail: string
  /** Peak only: the DPS/HPS behind the score (a boss kill's, or duration-weighted across bosses). */
  raw?: number
  rawMetric?: "DPS" | "HPS"
  durationMs?: number
  bossCounts?: readonly { encounter_name: string; count: number }[]
  /** Ranked Mastery entries: the parts it is built from. Across a raid, Peak/Form/Floor average every boss. */
  mastery?: MasteryParts
  /** Published boss-score components; absent for raid aggregate projections. */
  publishedMastery?: { peak?: number; form?: number; floor?: number; eligibleKills?: number }
}

export interface MasteryParts {
  peak: number
  form: number
  floor: number
  /** 0–1, from the number of kills behind the estimate. */
  confidence: number
  kills: number
  /**
   * 0–1: how much of the five-kill evidence that ends the ranking discount is in. On a boss, its kills
   * out of five; across a raid, every boss's (capped) kills out of five per boss, a missed boss adding 0.
   */
  evidence: number
}

/** Where a board sits in the drill-down: raid → boss → class → spec. */
export interface RatingScope {
  boss?: string
  cls?: string
  spec?: string
  /** Talent-build cohort inside a spec, e.g. Feral (Cat) vs Feral (Bear). */
  subSpec?: string
}

export type ScopeKind = "raid" | "boss" | "class" | "spec"

export interface RatingBoardData {
  id: string
  kind: ScopeKind
  scope: RatingScope
  title: string
  subtitle: string
  /** Number of ranked characters before any display limit. */
  total: number
  entries: RatingEntry[]
}

export const MOLTEN_CORE_BOSSES = [
  "Incindis",
  "Lucifron",
  "Magmadar",
  "Gehennas",
  "Garr",
  "Shazzrah",
  "Baron Geddon",
  "Golemagg the Incinerator",
  "Sorcerer-Thane Thaurissan",
  "Sulfuron Harbinger",
  "Majordomo Executus",
  "Ragnaros",
] as const

const SPECS: [string, string][] = [
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
const GUILDS = ["Ember Oath", "Ashen Vigil", "Molten Crown", "Sulfuron Rising", "Last Light", "Iron Rook", undefined]

/** Small deterministic PRNG so stories and screenshots stay stable. */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface MockPlayer {
  id: string
  name: string
  guild?: string
  cls: string
  spec: string
  subSpec: string
  skill: number
  activity: number
}

interface MockBossResult {
  peak: number
  form: number
  floor: number
  dps: number
  mastery: number
  kills: number
  confidence: number
  renown: number
}

function buildPlayers(rand: () => number): MockPlayer[] {
  const used = new Set<string>()
  const players: MockPlayer[] = []
  while (players.length < 160) {
    const name = NAME_A[Math.floor(rand() * NAME_A.length)] + NAME_B[Math.floor(rand() * NAME_B.length)]
    if (used.has(name)) continue
    used.add(name)
    const [cls, spec] = SPECS[Math.floor(rand() * SPECS.length)]
    players.push({
      id: name.toLowerCase(),
      name,
      guild: GUILDS[Math.floor(rand() * GUILDS.length)],
      cls,
      spec,
      subSpec: players.length % 2 === 0 ? "Variant A" : "Variant B",
      skill: 0.62 + rand() * 0.36,
      activity: rand(),
    })
  }
  return players
}

function bossResult(player: MockPlayer, rand: () => number, period: RatingPeriod): MockBossResult | null {
  // Less active players skip some bosses entirely.
  if (rand() > 0.35 + player.activity * 0.65) return null
  const scale = period === "all" ? 2.4 : 1
  const kills = Math.max(1, Math.round((1 + player.activity * 15 * rand()) * scale))
  const peak = Math.min(100, player.skill * 100 + (rand() - 0.6) * 8)
  const form = Math.max(0, peak - 2 - rand() * 9)
  const floor = Math.max(0, form - 4 - rand() * 14)
  const m = calculateMastery({ peak, form, floor, kills })
  const repetition = 1 - Math.exp(-Math.max(0, kills - 1) / 6)
  return {
    peak,
    form,
    floor,
    dps: Math.round(900 + peak * 14 + rand() * 60),
    mastery: m.rankedMastery,
    kills,
    confidence: m.confidence,
    renown: Math.round(50 + 50 * repetition),
  }
}

interface MockRatings {
  players: Map<string, MockPlayer>
  byBoss: Map<string, Map<string, MockBossResult>>
}

const cache = new Map<string, MockRatings>()

/** Ratings are per realm: each realm has its own players and results. */
function mockRatings(period: RatingPeriod): MockRatings {
  const key = `${mockRealm()}|${period}`
  const hit = cache.get(key)
  if (hit) return hit
  const rand = mulberry32((period === "180d" ? 1337 : 4242) + mockRealmSeed())
  const players = buildPlayers(mulberry32(7 + mockRealmSeed()))
  const byBoss = new Map<string, Map<string, MockBossResult>>()
  for (const boss of MOLTEN_CORE_BOSSES) {
    const results = new Map<string, MockBossResult>()
    for (const p of players) {
      const r = bossResult(p, rand, period)
      if (r) results.set(p.id, r)
    }
    byBoss.set(boss, results)
  }
  const out = { players: new Map(players.map((p) => [p.id, p])), byBoss }
  cache.set(key, out)
  return out
}

function entryFor(p: MockPlayer, score: number, detail: string, mastery?: MasteryParts): RatingEntry {
  return { id: p.id, name: p.name, guild: p.guild, cls: p.cls, spec: p.spec, subSpec: p.subSpec, score, detail, mastery }
}

function bossEntries(data: MockRatings, boss: string, metric: RatingMetric): RatingEntry[] {
  const results = data.byBoss.get(boss)!
  return [...results.entries()].map(([id, r]) => {
    const p = data.players.get(id)!
    switch (metric) {
      case "peak":
        return entryFor(p, r.peak, `${r.dps.toLocaleString()} DPS`)
      case "mastery":
        return entryFor(p, r.mastery, `${r.kills} kills · ${Math.round(r.confidence * 100)}% conf.`, {
          peak: r.peak,
          form: r.form,
          floor: r.floor,
          confidence: r.confidence,
          kills: r.kills,
          evidence: Math.min(r.kills, 5) / 5,
        })
      case "renown":
        return entryFor(p, r.renown, `${r.kills} kills`)
    }
  })
}

function raidEntries(data: MockRatings, metric: RatingMetric): RatingEntry[] {
  const totalBosses = MOLTEN_CORE_BOSSES.length
  return [...data.players.values()].flatMap((p) => {
    const results = MOLTEN_CORE_BOSSES.map((b) => data.byBoss.get(b)!.get(p.id)).filter((r) => r !== undefined)
    if (results.length === 0) return []
    const covered = results.length
    if (metric === "renown") {
      const kills = results.reduce((s, r) => s + r.kills, 0)
      const clears = covered === totalBosses ? Math.min(...results.map((r) => r.kills)) : 0
      const score = results.reduce((s, r) => s + r.renown, 0) + clears * 250
      return [entryFor(p, score, `${kills} kills · ${clears} clears`)]
    }
    // Peak and Mastery need full-raid coverage; missing bosses count as 0.
    const sum = results.reduce((s, r) => s + (metric === "peak" ? r.peak : r.mastery), 0)
    const kills = results.reduce((s, r) => s + r.kills, 0)
    const detail = metric === "peak" ? `${covered}/${totalBosses} bosses` : `${covered}/${totalBosses} bosses · ${kills} kills`
    const avg = (pick: (r: MockBossResult) => number) => results.reduce((s, r) => s + pick(r), 0) / totalBosses
    const parts =
      metric === "mastery"
        ? {
            peak: avg((r) => r.peak),
            form: avg((r) => r.form),
            floor: avg((r) => r.floor),
            confidence: results.reduce((s, r) => s + r.confidence, 0) / covered,
            kills,
            evidence: results.reduce((s, r) => s + Math.min(r.kills, 5), 0) / (5 * totalBosses),
          }
        : undefined
    return [entryFor(p, sum / totalBosses, detail, parts)]
  })
}

export const CLASS_ORDER = ["WARRIOR", "ROGUE", "MAGE", "WARLOCK", "HUNTER", "SHAMAN", "DRUID", "PRIEST", "PALADIN"]

export function scopeKind(scope: RatingScope): ScopeKind {
  if (scope.spec) return "spec"
  if (scope.cls) return "class"
  if (scope.boss) return "boss"
  return "raid"
}

/** Every ranked entry in a scope, best first. Ties keep insertion order (prod: earliest log wins). */
export function scopeEntries(metric: RatingMetric, period: RatingPeriod, scope: RatingScope): RatingEntry[] {
  const data = mockRatings(period)
  const all = scope.boss ? bossEntries(data, scope.boss, metric) : raidEntries(data, metric)
  return all.filter((e) => (!scope.cls || e.cls === scope.cls) && (!scope.spec || e.spec === scope.spec)).sort((a, b) => b.score - a.score)
}

export function scopeBoard(metric: RatingMetric, period: RatingPeriod, scope: RatingScope, limit = 25): RatingBoardData {
  const kind = scopeKind(scope)
  // Peak shows the throughput behind it; the mock derives one from the score.
  const entries = scopeEntries(metric, period, scope).map((e) => (metric === "peak" ? { ...e, raw: Math.round(12 * e.score + 150) } : e))
  const title = kind === "spec" ? scope.spec! : kind === "class" ? scope.cls! : kind === "boss" ? scope.boss! : "Molten Core"
  return {
    id: [scope.boss, scope.cls, scope.spec].filter(Boolean).join("/") || "raid",
    kind,
    scope,
    title,
    subtitle: kind === "raid" ? `All 12 bosses · ${entries.length} ranked` : `${entries.length} ranked`,
    total: entries.length,
    entries: entries.slice(0, limit),
  }
}

/** The boards that surround a scope: bosses around the raid, classes around a boss, specs around a class. */
export function childScopes(scope: RatingScope): RatingScope[] {
  switch (scopeKind(scope)) {
    case "raid":
      return MOLTEN_CORE_BOSSES.map((boss) => ({ boss }))
    case "boss":
      return CLASS_ORDER.map((cls) => ({ boss: scope.boss, cls }))
    case "class":
      return SPECS.filter(([cls]) => cls === scope.cls).map(([cls, spec]) => ({ boss: scope.boss, cls, spec }))
    case "spec":
      return []
  }
}
