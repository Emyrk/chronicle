import type {
  SpeedrunLevelRangeRequirement,
  SupportedInstance,
  SupportedInstanceDamageRule,
  SupportedInstanceRenownRule,
  SupportedInstanceSpeedrunRules,
} from "@/api/typesGenerated"
import { compareByRaidProgression } from "@/pages/Logs/utils/instanceProgressionOrder"

export interface RulesetEntry {
  name: string
  instance: SupportedInstance
  speedrunRules?: SupportedInstanceSpeedrunRules
  renownRules?: readonly SupportedInstanceRenownRule[]
  damageRuleCount: number
  derived: boolean
}

interface FrontendDamageRule {
  mode: string
  entry_ids: number[]
  note: string
}

/**
 * Encounter rules implemented as custom backend trackers rather than
 * damage_by_encounter metadata. Keep in sync with the rankings package
 * (see dpstracker_assembly_of_iron.go).
 */
const FRONTEND_DAMAGE_RULES: Record<string, Record<string, FrontendDamageRule>> = {
  Ulduar: {
    "Assembly of Iron": {
      mode: "phase-kill",
      // Steelbreaker, Runemaster Molgeim, Stormcaller Brundir (10-man IDs; 25-man share names).
      entry_ids: [32867, 32927, 32857],
      note: "Each phase only counts damage to the council member who dies. Survivors heal to full, so damage to them that phase is excluded. On a wipe, all remaining damage counts.",
    },
  },
}

const FALLBACK_UNIT_NAMES: Record<number, string> = {
  32857: "Stormcaller Brundir",
  32867: "Steelbreaker",
  32927: "Runemaster Molgeim",
}

function encounterRules(instance: SupportedInstance): Record<string, SupportedInstanceDamageRule & { note?: string }> {
  return { ...(instance.damage_by_encounter ?? {}), ...(FRONTEND_DAMAGE_RULES[instance.name] ?? {}) }
}

/** Include DPS, speedrun, and Renown rules, including derived zones. */
export function rulesetEntries(instances: readonly SupportedInstance[]): RulesetEntry[] {
  const entries: RulesetEntry[] = []
  for (const instance of instances) {
    const damageRuleCount = Object.keys(encounterRules(instance)).length
    if (damageRuleCount > 0 || instance.speedrun_rules || instance.renown_rules?.length) {
      entries.push({
        name: instance.name,
        instance,
        speedrunRules: instance.speedrun_rules,
        renownRules: instance.renown_rules,
        damageRuleCount,
        derived: false,
      })
    }
    const derivedNames = new Set([
      ...Object.keys(instance.derived_speedrun_rules ?? {}),
      ...Object.keys(instance.derived_renown_rules ?? {}),
    ])
    for (const name of derivedNames) {
      entries.push({
        name,
        instance,
        speedrunRules: instance.derived_speedrun_rules?.[name],
        renownRules: instance.derived_renown_rules?.[name],
        damageRuleCount: 0,
        derived: true,
      })
    }
  }
  return entries.sort((a, b) => compareByRaidProgression(a.name, b.name, instances))
}

/**
 * "window": DPS is divided by the time from the first listed target engaging to
 * the last one dying. "full": the whole encounter is used. Mirrors
 * rankings.DurationTargets/RankingWindow, which reuse the damage target rule;
 * Assembly of Iron keeps the full fight.
 */
export type RankedTime = "window" | "full"

function rankedTimeFor(mode: string): RankedTime {
  return mode === "entries" || mode === "boss-only" ? "window" : "full"
}

export function damageRuleRows(instance: SupportedInstance) {
  const rules = encounterRules(instance)
  const order = instance.progression_bosses ?? []
  const names = Object.keys(rules).sort((a, b) => {
    const aIndex = order.indexOf(a)
    const bIndex = order.indexOf(b)
    return (aIndex < 0 ? Infinity : aIndex) - (bIndex < 0 ? Infinity : bIndex) || a.localeCompare(b)
  })
  const units = new Map(
    [...(instance.bosses ?? []), ...(instance.trash ?? [])].map((unit) => [unit.entry_id, unit.name]),
  )
  const bossIDs = new Set((instance.bosses ?? []).map((unit) => unit.entry_id))
  return names.map((name) => ({
    name,
    mode: rules[name].mode,
    note: rules[name].note,
    rankedTime: rankedTimeFor(rules[name].mode),
    targets: (rules[name].entry_ids ?? []).map((id) => ({
      id,
      name: units.get(id) ?? FALLBACK_UNIT_NAMES[id] ?? `Creature ${id}`,
      boss: bossIDs.has(id) || id in FALLBACK_UNIT_NAMES,
    })),
  }))
}

export function renownRuleRows(entry: RulesetEntry): readonly SupportedInstanceRenownRule[] {
  const order = entry.derived ? [] : (entry.instance.progression_bosses ?? [])
  return [...(entry.renownRules ?? [])].sort((a, b) => {
    const aIndex = order.indexOf(a.encounter_name)
    const bIndex = order.indexOf(b.encounter_name)
    return (aIndex < 0 ? Infinity : aIndex) - (bIndex < 0 ? Infinity : bIndex)
      || a.encounter_name.localeCompare(b.encounter_name)
  })
}

export function formatLevelRange(range?: SpeedrunLevelRangeRequirement): string {
  if (!range) return "No limit"
  if (range.min_level === range.max_level) return `${range.max_level}`
  if (range.min_level <= 1) return `≤ ${range.max_level}`
  return `${range.min_level}–${range.max_level}`
}
