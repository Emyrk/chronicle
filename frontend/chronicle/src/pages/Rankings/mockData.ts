import type { WoWHeroClasses } from "@/api/typesGenerated"

// ── Types ──────────────────────────────────────────────────────────────────

export type MetricType =
  | "dps"
  | "hps"
  | "damage_done"
  | "healing_done"
  | "dispels"
  | "interrupts"

export interface RankingEntry {
  rank: number
  playerName: string
  className: WoWHeroClasses
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

const HEALER_CLASSES: WoWHeroClasses[] = ["PRIEST", "DRUID", "PALADIN", "SHAMAN"]

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

const HPS_RANGES: Record<string, [number, number]> = {
  PRIEST: [500, 1200],
  DRUID: [450, 1100],
  PALADIN: [400, 1000],
  SHAMAN: [400, 950],
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

// ── Generate entries for a single boss ─────────────────────────────────────

function generateBossEntries(): RankingEntry[] {
  const count = randInt(50, 80)
  const baseDuration = randInt(60, 300)
  const entries: RankingEntry[] = []

  for (let i = 0; i < count; i++) {
    const cls = weightedClass()
    const names = NAMES_BY_CLASS[cls] ?? NAMES_BY_CLASS.WARRIOR
    const dpsRange = DPS_RANGES[cls] ?? [300, 700]
    const dps = randInt(dpsRange[0], dpsRange[1])
    const dur = baseDuration + randInt(-30, 60)
    const durationMs = Math.max(dur, 30) * 1000
    const daysAgo = randInt(0, 89)
    const date = new Date(Date.now() - daysAgo * 86400000)

    entries.push({
      rank: 0, // filled later
      playerName: pick(names) + randInt(1, 99),
      className: cls,
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

  // Also pre-generate healer / dispel / interrupt variants keyed on player
  return entries
}

// ── Build full dataset ─────────────────────────────────────────────────────

type BossDataset = {
  dps: RankingEntry[]
  hps: RankingEntry[]
  damage_done: RankingEntry[]
  healing_done: RankingEntry[]
  dispels: RankingEntry[]
  interrupts: RankingEntry[]
}

function generateBossDataset(): BossDataset {
  const dpsEntries = generateBossEntries()

  // HPS: only healers
  const hpsEntries: RankingEntry[] = []
  const hpsCount = randInt(20, 35)
  for (let i = 0; i < hpsCount; i++) {
    const cls = pick(HEALER_CLASSES)
    const names = NAMES_BY_CLASS[cls] ?? NAMES_BY_CLASS.PRIEST
    const hpsRange = HPS_RANGES[cls] ?? [400, 900]
    const dur = randInt(60, 300)
    const daysAgo = randInt(0, 89)
    hpsEntries.push({
      rank: 0,
      playerName: pick(names) + randInt(1, 99),
      className: cls,
      value: randInt(hpsRange[0], hpsRange[1]),
      durationMs: dur * 1000,
      guildName: pick(GUILD_NAMES),
      date: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      instanceId: uuid(),
    })
  }
  hpsEntries.sort((a, b) => b.value - a.value)
  hpsEntries.forEach((e, i) => { e.rank = i + 1 })

  // Damage done = DPS * duration / 1000
  const damageEntries = dpsEntries.map((e) => ({
    ...e,
    rank: 0,
    value: Math.round(e.value * (e.durationMs / 1000)),
  }))
  damageEntries.sort((a, b) => b.value - a.value)
  damageEntries.forEach((e, i) => { e.rank = i + 1 })

  // Healing done
  const healingEntries = hpsEntries.map((e) => ({
    ...e,
    rank: 0,
    value: Math.round(e.value * (e.durationMs / 1000)),
  }))
  healingEntries.sort((a, b) => b.value - a.value)
  healingEntries.forEach((e, i) => { e.rank = i + 1 })

  // Dispels — all classes can dispel something
  const dispelEntries: RankingEntry[] = []
  const dispelCount = randInt(25, 45)
  for (let i = 0; i < dispelCount; i++) {
    const cls = weightedClass()
    const names = NAMES_BY_CLASS[cls] ?? NAMES_BY_CLASS.WARRIOR
    const daysAgo = randInt(0, 89)
    dispelEntries.push({
      rank: 0,
      playerName: pick(names) + randInt(1, 99),
      className: cls,
      value: randInt(5, 45),
      durationMs: randInt(60, 300) * 1000,
      guildName: pick(GUILD_NAMES),
      date: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      instanceId: uuid(),
    })
  }
  dispelEntries.sort((a, b) => b.value - a.value)
  dispelEntries.forEach((e, i) => { e.rank = i + 1 })

  // Interrupts
  const interruptEntries: RankingEntry[] = []
  const intCount = randInt(20, 35)
  for (let i = 0; i < intCount; i++) {
    const cls = weightedClass()
    const names = NAMES_BY_CLASS[cls] ?? NAMES_BY_CLASS.WARRIOR
    const daysAgo = randInt(0, 89)
    interruptEntries.push({
      rank: 0,
      playerName: pick(names) + randInt(1, 99),
      className: cls,
      value: randInt(3, 25),
      durationMs: randInt(60, 300) * 1000,
      guildName: pick(GUILD_NAMES),
      date: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      instanceId: uuid(),
    })
  }
  interruptEntries.sort((a, b) => b.value - a.value)
  interruptEntries.forEach((e, i) => { e.rank = i + 1 })

  return {
    dps: dpsEntries,
    hps: hpsEntries,
    damage_done: damageEntries,
    healing_done: healingEntries,
    dispels: dispelEntries,
    interrupts: interruptEntries,
  }
}

// ── Exported data ──────────────────────────────────────────────────────────

// Build boss id → dataset map and instance info
const bossDatasets = new Map<string, BossDataset>()
const bossInfoMap = new Map<string, BossInfo>()

export const INSTANCES: InstanceInfo[] = INSTANCES_RAW.map((inst) => {
  let totalRecords = 0
  const bosses: BossInfo[] = inst.bosses.map((bossName) => {
    const id = `${inst.name}::${bossName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const dataset = generateBossDataset()
    bossDatasets.set(id, dataset)
    const kills = dataset.dps.length
    totalRecords += kills
    const info: BossInfo = { id, name: bossName, instanceName: inst.name, totalKills: kills }
    bossInfoMap.set(id, info)
    return info
  })
  return { name: inst.name, bosses, totalRecords }
})

export function getBossInfo(bossId: string): BossInfo | undefined {
  return bossInfoMap.get(bossId)
}

export function getRankings(bossId: string, metric: MetricType): RankingEntry[] {
  return bossDatasets.get(bossId)?.[metric] ?? []
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

export const METRIC_LABELS: Record<MetricType, string> = {
  dps: "DPS",
  hps: "HPS",
  damage_done: "Damage Done",
  healing_done: "Healing Done",
  dispels: "Dispels",
  interrupts: "Interrupts",
}

export const ALL_DPS_CLASSES = DPS_CLASSES
