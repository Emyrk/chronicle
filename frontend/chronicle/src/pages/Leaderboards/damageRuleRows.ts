import type { SpeedrunLevelRangeRequirement, SupportedInstance, SupportedInstanceSpeedrunRules } from "@/api/typesGenerated"
import { compareByRaidProgression } from "@/pages/Logs/utils/instanceProgressionOrder"

export interface RulesetEntry {
  name: string
  instance: SupportedInstance
  speedrunRules?: SupportedInstanceSpeedrunRules
  damageRuleCount: number
  derived: boolean
}

/** Include both DPS rules and speedrun-only instances, including derived zones. */
export function rulesetEntries(instances: readonly SupportedInstance[]): RulesetEntry[] {
  const entries: RulesetEntry[] = []
  for (const instance of instances) {
    const damageRuleCount = Object.keys(instance.damage_by_encounter ?? {}).length
    if (damageRuleCount > 0 || instance.speedrun_rules) {
      entries.push({ name: instance.name, instance, speedrunRules: instance.speedrun_rules, damageRuleCount, derived: false })
    }
    for (const [name, speedrunRules] of Object.entries(instance.derived_speedrun_rules ?? {})) {
      entries.push({ name, instance, speedrunRules, damageRuleCount: 0, derived: true })
    }
  }
  return entries.sort((a, b) => compareByRaidProgression(a.name, b.name, instances))
}

export function damageRuleRows(instance: SupportedInstance) {
  const rules = instance.damage_by_encounter ?? {}
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
    targets: (rules[name].entry_ids ?? []).map((id) => ({
      id,
      name: units.get(id) ?? `Creature ${id}`,
      boss: bossIDs.has(id),
    })),
  }))
}

export function formatLevelRange(range?: SpeedrunLevelRangeRequirement): string {
  if (!range) return "No limit"
  if (range.min_level === range.max_level) return `${range.max_level}`
  if (range.min_level <= 1) return `≤ ${range.max_level}`
  return `${range.min_level}–${range.max_level}`
}
