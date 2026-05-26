import type { WoWHeroClasses } from "@/api/typesGenerated"

// ── Types ──────────────────────────────────────────────────────────────────

export interface RankingEntry {
  rank: number
  playerName: string
  className: WoWHeroClasses
  playerSpec: string
  playerLevel: number
  realmName: string
  encounterName: string
  difficulty: string   // e.g. "40 Player", "20 Player", "25 Player (Heroic)"
  maxPlayers: number   // e.g. 40, 20, 25
  value: number
  durationMs: number
  guildName: string
  date: string
  instanceId: string
  instanceSlug?: string
}

export interface BossInfo {
  id: string
  name: string
  instanceName: string
  totalKills: number
  isTrash: boolean
}

export interface InstanceInfo {
  name: string
  bosses: BossInfo[]
  totalRecords: number
}

export interface ClassAverage {
  className: WoWHeroClasses
  average: number
  count: number
}

export interface RankingSummary {
  record: { value: number; playerName: string; className: WoWHeroClasses }
  median: number
  totalRecords: number
  classCount: number
}

export interface InstanceSummary {
  instanceName: string
  totalKills: number
  topPlayers: { name: string; realm: string; className: WoWHeroClasses; dps: number }[]
}

// ── Seeded PRNG ────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rng = mulberry32(42)

function randInt(min: number, max: number) {
  return Math.floor(rng() * (max - min + 1)) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]
}

function uuid(): string {
  const hex = "0123456789abcdef"
  let s = ""
  for (let i = 0; i < 32; i++) {
    if (i === 8 || i === 12 || i === 16 || i === 20) s += "-"
    s += hex[Math.floor(rng() * 16)]
  }
  return s
}

// ── Constants ──────────────────────────────────────────────────────────────

const GUILD_NAMES = [
  "Ascendance",
  "Wrath of Elune",
  "APES",
  "Progress",
  "Dreamstate",
  "Salad Bakers",
  "Nightfall",
  "Vis Maior",
  "Grizzly",
  "Vanguard",
  "Rise",
  "Fusion",
  "Tribe",
  "Memento Mori",
  "Calamity",
] as const

const NAMES_BY_CLASS: Record<string, readonly string[]> = {
  WARRIOR: ["Thunderclap", "Swordbane", "Ironforge", "Braveheart", "Steelwall", "Ragefury", "Armsmaster", "Tankadin", "Crushbone", "Berserko"],
  ROGUE: ["Shadowstep", "Blindside", "Venomfang", "Subtlety", "Nightblade", "Ambush", "Eviscera", "Stealthix", "Kidneyshot", "Ghostwalk"],
  MAGE: ["Frostbolt", "Pyroblast", "Arcanova", "Blizzara", "Shatterice", "Ignitious", "Polymorph", "Spellweave", "Crystalis", "Flamecrown"],
  WARLOCK: ["Felfire", "Shadowburn", "Dotsalot", "Afflicted", "Soulsteal", "Demonhost", "Corruptor", "Dreadscar", "Hellscream", "Necrosis"],
  HUNTER: ["Deadshot", "Beastcall", "Hawkeye", "Barrage", "Snipeshot", "Windrunner", "Trapsetter", "Rapidfire", "Volley", "Wildmark"],
  PRIEST: ["Holylight", "Mindblast", "Renewella", "Spiritmend", "Prayerful", "Discipline", "Soulpriest", "Flashheal", "Divinity", "Painweave"],
  DRUID: ["Moonfire", "Swiftclaw", "Lifebloom", "Starfury", "Bearform", "Regrowtha", "Wildgrowth", "Feralstrike", "Naturecall", "Thornskin"],
  PALADIN: ["Lightbring", "Holywrath", "Judgement", "Blessedblade", "Avengerx", "Consecrate", "Devotion", "Redeemer", "Zealotry", "Hammerfal"],
  SHAMAN: ["Earthshock", "Chainlight", "Totemcall", "Stormlash", "Lavaburst", "Windwalker", "Ghostwolf", "Thunderstm", "Purgemaster", "Firenova"],
}

const DPS_CLASSES: WoWHeroClasses[] = [
  "WARRIOR", "ROGUE", "MAGE", "WARLOCK", "HUNTER",
  "PRIEST", "DRUID", "PALADIN", "SHAMAN",
]

export const SPEC_BY_CLASS: Record<string, readonly string[]> = {
  WARRIOR: ["Arms", "Fury", "Protection"],
  ROGUE: ["Assassination", "Combat", "Subtlety"],
  MAGE: ["Arcane", "Fire", "Frost"],
  WARLOCK: ["Affliction", "Demonology", "Destruction"],
  HUNTER: ["Beast Mastery", "Marksmanship", "Survival"],
  PRIEST: ["Discipline", "Holy", "Shadow"],
  DRUID: ["Balance", "Feral", "Restoration"],
  PALADIN: ["Holy", "Protection", "Retribution"],
  SHAMAN: ["Elemental", "Enhancement", "Restoration"],
}

export const REALM_NAMES = ["Ambershire", "Tel'Abim", "Nordanaar"] as const

// DPS ranges per class [min, max]
const DPS_RANGES: Record<string, [number, number]> = {
  WARRIOR: [500, 1200],
  ROGUE: [500, 1100],
  MAGE: [400, 1000],
  WARLOCK: [300, 800],
  HUNTER: [400, 900],
  PRIEST: [200, 500],
  DRUID: [300, 600],
  PALADIN: [250, 550],
  SHAMAN: [300, 700],
}

// Class weight distribution — more warriors/rogues/mages
const CLASS_WEIGHTS: [WoWHeroClasses, number][] = [
  ["WARRIOR", 18],
  ["ROGUE", 14],
  ["MAGE", 14],
  ["WARLOCK", 10],
  ["HUNTER", 12],
  ["PRIEST", 10],
  ["DRUID", 6],
  ["PALADIN", 8],
  ["SHAMAN", 8],
]

function weightedClass(): WoWHeroClasses {
  const total = CLASS_WEIGHTS.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [cls, w] of CLASS_WEIGHTS) {
    r -= w
    if (r <= 0) return cls
  }
  return "WARRIOR"
}

// ── Instance / Boss Data ───────────────────────────────────────────────────

// Difficulty options per instance (for mock generation)
const DIFFICULTIES_BY_INSTANCE: Record<string, { label: string; maxPlayers: number }[]> = {
  "Molten Core": [
    { label: "20 Player", maxPlayers: 20 },
    { label: "40 Player", maxPlayers: 40 },
  ],
  "Blackwing Lair": [
    { label: "20 Player", maxPlayers: 20 },
    { label: "40 Player", maxPlayers: 40 },
  ],
  "Ahn'Qiraj": [
    { label: "20 Player", maxPlayers: 20 },
    { label: "40 Player", maxPlayers: 40 },
  ],
  "Naxxramas": [
    { label: "10 Player", maxPlayers: 10 },
    { label: "25 Player", maxPlayers: 25 },
    { label: "25 Player (Heroic)", maxPlayers: 25 },
  ],
}

const INSTANCES_RAW: { name: string; bosses: string[] }[] = [
  {
    name: "Molten Core",
    bosses: [
      "Lucifron", "Magmadar", "Gehennas", "Garr", "Baron Geddon",
      "Shazzrah", "Golemagg", "Sulfuron Harbinger", "Majordomo Executus", "Ragnaros",
    ],
  },
  {
    name: "Blackwing Lair",
    bosses: [
      "Razorgore", "Vaelastrasz", "Broodlord Lashlayer", "Firemaw",
      "Ebonroc", "Flamegor", "Chromaggus", "Nefarian",
    ],
  },
  {
    name: "Ahn'Qiraj",
    bosses: [
      "The Prophet Skeram", "Bug Trio", "Battleguard Sartura", "Fankriss",
      "Viscidus", "Princess Huhuran", "Twin Emperors", "Ouro", "C'Thun",
    ],
  },
  {
    name: "Naxxramas",
    bosses: [
      "Anub'Rekhan", "Grand Widow Faerlina", "Maexxna",
      "Noth the Plaguebringer", "Patchwerk", "Grobbulus",
      "Gluth", "Thaddius", "Sapphiron", "Kel'Thuzad",
    ],
  },
]

/** Get distinct difficulty labels from actual ranking entries for an instance. */
export function getInstanceDifficulties(instanceName: string): string[] {
  const entries = getAllEntries(instanceName)
  const seen = new Set<string>()
  for (const e of entries) {
    if (e.difficulty) seen.add(e.difficulty)
  }
  return [...seen].sort()
}

// ── Generate entries for a single boss ─────────────────────────────────────

function generateBossEntries(
  encounterName: string,
  instanceName: string,
): RankingEntry[] {
  const difficulties = DIFFICULTIES_BY_INSTANCE[instanceName] ?? [{ label: "", maxPlayers: 0 }]
  const count = randInt(50, 80)
  const baseDuration = randInt(60, 300)
  const entries: RankingEntry[] = []

  for (let i = 0; i < count; i++) {
    const cls = weightedClass()
    const names = NAMES_BY_CLASS[cls] ?? NAMES_BY_CLASS.WARRIOR
    const specs = SPEC_BY_CLASS[cls] ?? ["Unknown"]
    const dpsRange = DPS_RANGES[cls] ?? [300, 700]
    const dps = randInt(dpsRange[0], dpsRange[1])
    const dur = baseDuration + randInt(-30, 60)
    const durationMs = Math.max(dur, 30) * 1000
    const daysAgo = randInt(0, 89)
    const date = new Date(Date.now() - daysAgo * 86400000)
    const diff = pick(difficulties)

    entries.push({
      rank: 0, // filled later
      playerName: pick(names) + randInt(1, 99),
      className: cls,
      playerSpec: pick(specs),
      playerLevel: 60,
      realmName: pick(REALM_NAMES),
      encounterName,
      difficulty: diff.label,
      maxPlayers: diff.maxPlayers,
      value: dps,
      durationMs,
      guildName: pick(GUILD_NAMES),
      date: date.toISOString(),
      instanceId: uuid(),
    })
  }

  // Sort descending by value, assign ranks
  entries.sort((a, b) => b.value - a.value)
  entries.forEach((e, i) => {
    e.rank = i + 1
  })

  return entries
}

// ── Exported data ──────────────────────────────────────────────────────────

// Build boss id → entries map and instance info
const bossEntries = new Map<string, RankingEntry[]>()
const bossInfoMap = new Map<string, BossInfo>()

export const INSTANCES: InstanceInfo[] = INSTANCES_RAW.map((inst) => {
  let totalRecords = 0
  const bosses: BossInfo[] = inst.bosses.map((bossName) => {
    const id = `${inst.name}::${bossName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const entries = generateBossEntries(bossName, inst.name)
    bossEntries.set(id, entries)
    const kills = entries.length
    totalRecords += kills
    const info: BossInfo = { id, name: bossName, instanceName: inst.name, totalKills: kills, isTrash: false }
    bossInfoMap.set(id, info)
    return info
  })

  // Add a "Trash" pseudo-encounter per instance (aggregated non-boss damage)
  const trashId = `${inst.name}::trash`.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  const trashEntries = generateBossEntries("Trash", inst.name)
  // Trash DPS tends to be lower — scale down
  for (const e of trashEntries) {
    e.value = Math.round(e.value * 0.7)
  }
  trashEntries.sort((a, b) => b.value - a.value)
  trashEntries.forEach((e, i) => { e.rank = i + 1 })
  bossEntries.set(trashId, trashEntries)
  totalRecords += trashEntries.length
  const trashInfo: BossInfo = { id: trashId, name: "Trash", instanceName: inst.name, totalKills: trashEntries.length, isTrash: true }
  bossInfoMap.set(trashId, trashInfo)
  bosses.push(trashInfo)

  return { name: inst.name, bosses, totalRecords }
})

export function getBossInfo(bossId: string): BossInfo | undefined {
  return bossInfoMap.get(bossId)
}

export function getRankings(bossId: string): RankingEntry[] {
  return bossEntries.get(bossId) ?? []
}

export function getClassAverages(entries: RankingEntry[]): ClassAverage[] {
  const map = new Map<WoWHeroClasses, { total: number; count: number }>()
  for (const e of entries) {
    const cur = map.get(e.className) ?? { total: 0, count: 0 }
    cur.total += e.value
    cur.count++
    map.set(e.className, cur)
  }
  const result: ClassAverage[] = []
  for (const [className, { total, count }] of map) {
    result.push({ className, average: Math.round(total / count), count })
  }
  result.sort((a, b) => b.average - a.average)
  return result
}

export function getRankingSummary(entries: RankingEntry[]): RankingSummary {
  if (entries.length === 0) {
    return {
      record: { value: 0, playerName: "—", className: "UNKNOWN" },
      median: 0,
      totalRecords: 0,
      classCount: 0,
    }
  }
  const sorted = [...entries].sort((a, b) => b.value - a.value)
  const top = sorted[0]
  const mid = Math.floor(sorted.length / 2)
  const median = sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1].value + sorted[mid].value) / 2)
    : sorted[mid].value
  const classes = new Set(entries.map((e) => e.className))
  return {
    record: { value: top.value, playerName: top.playerName, className: top.className },
    median,
    totalRecords: entries.length,
    classCount: classes.size,
  }
}

// ── Aggregate queries ──────────────────────────────────────────────────────

/** Return all DPS entries, optionally filtered to bosses in a specific instance. */
export function getAllEntries(instanceName?: string): RankingEntry[] {
  const result: RankingEntry[] = []
  for (const inst of INSTANCES) {
    if (instanceName && inst.name !== instanceName) continue
    for (const boss of inst.bosses) {
      const entries = bossEntries.get(boss.id)
      if (entries) result.push(...entries)
    }
  }
  return result
}

/** Get top N entries for a boss (already sorted desc by value). */
export function getTopEntries(bossId: string, n = 5): RankingEntry[] {
  return (bossEntries.get(bossId) ?? []).slice(0, n)
}

/** Look up InstanceInfo by name. */
export function getInstanceByName(name: string): InstanceInfo | undefined {
  return INSTANCES.find((i) => i.name === name)
}

export interface BoxPlotStats {
  className: WoWHeroClasses
  specName?: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  count: number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function computeBoxPlotStats(entries: RankingEntry[]): BoxPlotStats[] {
  const byClass = new Map<WoWHeroClasses, number[]>()
  for (const e of entries) {
    let arr = byClass.get(e.className)
    if (!arr) {
      arr = []
      byClass.set(e.className, arr)
    }
    arr.push(e.value)
  }

  const result: BoxPlotStats[] = []
  for (const [className, values] of byClass) {
    values.sort((a, b) => a - b)
    result.push({
      className,
      min: values[0],
      q1: Math.round(percentile(values, 25)),
      median: Math.round(percentile(values, 50)),
      q3: Math.round(percentile(values, 75)),
      max: values[values.length - 1],
      count: values.length,
    })
  }

  // Sort by median descending
  result.sort((a, b) => b.median - a.median)
  return result
}

export const INSTANCE_NAMES = INSTANCES_RAW.map((i) => i.name)

// ── Display helpers ────────────────────────────────────────────────────────

export const CLASS_DISPLAY: Record<string, string> = {
  WARRIOR: "Warrior",
  ROGUE: "Rogue",
  MAGE: "Mage",
  WARLOCK: "Warlock",
  HUNTER: "Hunter",
  PRIEST: "Priest",
  DRUID: "Druid",
  PALADIN: "Paladin",
  SHAMAN: "Shaman",
  DEATHKNIGHT: "Death Knight",
  UNKNOWN: "Unknown",
}

export const CLASS_CSS_VAR: Record<string, string> = {
  WARRIOR: "var(--color-class-warrior)",
  ROGUE: "var(--color-class-rogue)",
  MAGE: "var(--color-class-mage)",
  WARLOCK: "var(--color-class-warlock)",
  HUNTER: "var(--color-class-hunter)",
  PRIEST: "var(--color-class-priest)",
  DRUID: "var(--color-class-druid)",
  PALADIN: "var(--color-class-paladin)",
  SHAMAN: "var(--color-class-shaman)",
  DEATHKNIGHT: "var(--color-class-deathknight)",
  UNKNOWN: "var(--color-class-unknown)",
}

export function computeBoxPlotStatsBySpec(entries: RankingEntry[]): BoxPlotStats[] {
  const byKey = new Map<string, { className: WoWHeroClasses; specName: string; values: number[] }>()
  for (const e of entries) {
    const key = `${e.className}::${e.playerSpec}`
    let bucket = byKey.get(key)
    if (!bucket) {
      bucket = { className: e.className, specName: e.playerSpec, values: [] }
      byKey.set(key, bucket)
    }
    bucket.values.push(e.value)
  }

  const result: BoxPlotStats[] = []
  for (const { className, specName, values } of byKey.values()) {
    values.sort((a, b) => a - b)
    result.push({
      className,
      specName,
      min: values[0],
      q1: Math.round(percentile(values, 25)),
      median: Math.round(percentile(values, 50)),
      q3: Math.round(percentile(values, 75)),
      max: values[values.length - 1],
      count: values.length,
    })
  }
  result.sort((a, b) => b.median - a.median)
  return result
}

/** Return encounter (boss) names for a given instance. */
export function getEncounterNames(instanceName: string): string[] {
  const inst = INSTANCES.find((i) => i.name === instanceName)
  if (!inst) return []
  return inst.bosses.map((b) => b.name)
}

/** Return summaries for all instances (for landing page cards). */
export function getInstanceSummaries(): InstanceSummary[] {
  return INSTANCES.map((inst) => {
    // Gather all entries for instance, sorted by DPS desc
    const allEntries = getAllEntries(inst.name)
    const sorted = [...allEntries].sort((a, b) => b.value - a.value)
    const topPlayers = sorted.slice(0, 3).map((e) => ({
      name: e.playerName,
      realm: e.realmName,
      className: e.className,
      dps: e.value,
    }))
    return {
      instanceName: inst.name,
      totalKills: inst.totalRecords,
      topPlayers,
    }
  })
}

export const ALL_DPS_CLASSES = DPS_CLASSES

// ── Kill Time Data ─────────────────────────────────────────────────────────

export interface KillTimeStats {
  encounterName: string
  min: number       // seconds
  q1: number
  median: number
  q3: number
  max: number
  count: number
}

/** Generate kill time box plot stats for each boss in an instance. */
export function getKillTimeStats(instanceName: string): KillTimeStats[] {
  const inst = INSTANCES.find((i) => i.name === instanceName)
  if (!inst) return []

  return inst.bosses
    .filter((b) => !b.isTrash)
    .map((boss) => {
      const entries = bossEntries.get(boss.id) ?? []
      // Use durationMs from entries as kill times
      const times = entries.map((e) => e.durationMs / 1000).sort((a, b) => a - b)
      if (times.length === 0) return null
      return {
        encounterName: boss.name,
        min: Math.round(times[0]),
        q1: Math.round(percentile(times, 25)),
        median: Math.round(percentile(times, 50)),
        q3: Math.round(percentile(times, 75)),
        max: Math.round(times[times.length - 1]),
        count: times.length,
      }
    })
    .filter((s): s is KillTimeStats => s !== null)
}

// ── Success Rate Data ──────────────────────────────────────────────────────

export interface EncounterSuccessRate {
  encounterName: string
  kills: number
  wipes: number
  total: number
  successPct: number
}

/** Generate success rate per boss for an instance. */
export function getSuccessRates(instanceName: string): EncounterSuccessRate[] {
  const inst = INSTANCES.find((i) => i.name === instanceName)
  if (!inst) return []

  return inst.bosses
    .filter((b) => !b.isTrash)
    .map((boss) => {
      const entries = bossEntries.get(boss.id) ?? []
      const kills = entries.length
      // Simulate wipes: harder bosses have more wipes
      const bossIdx = inst.bosses.filter((b) => !b.isTrash).indexOf(boss)
      const wipeRate = 0.05 + (bossIdx / inst.bosses.length) * 0.35 // 5-40% wipe rate, later bosses harder
      const wipes = Math.round(kills * (wipeRate / (1 - wipeRate)))
      const total = kills + wipes
      return {
        encounterName: boss.name,
        kills,
        wipes,
        total,
        successPct: total > 0 ? Math.round((kills / total) * 100) : 0,
      }
    })
}
