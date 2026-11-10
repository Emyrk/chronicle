import { useLeaderboardConfiguration } from "@/api/leaderboardConfiguration"
import type { LeaderboardConfigurationRow, SupportedInstanceRenownRule } from "@/api/typesGenerated"

type Row = LeaderboardConfigurationRow

/** "" is the default (non-variant) award column. */
export function variantKey(row: Pick<Row, "difficulty_name" | "max_players">) {
  return `${row.difficulty_name}/${row.max_players}`
}

export function awardFor(rows: readonly Row[], boss: string, variant: string) {
  if (!variant) return rows.find((r) => r.kind === "boss" && r.encounter_name === boss)
  return rows.find((r) => r.kind === "boss_variant" && r.encounter_name === boss && variantKey(r) === variant)
}

/** The Renown each boss kill awards in one award column: the default, or one difficulty/size. */
export interface RenownAwards {
  /** Empty for the default column. */
  difficulty_name: string
  max_players: number
  rules: SupportedInstanceRenownRule[]
}

/**
 * Per-kill Renown an instance grants, from the resolved leaderboard configuration.
 * One entry per award column with points; a variant that awards exactly the
 * default is folded into it. Bosses without a configured award are left out.
 */
export function instanceRenownAwards(rows: readonly Row[], instance: string): RenownAwards[] {
  const own = rows.filter((r) => r.instance_name === instance)
  const bosses = own.filter((r) => r.kind === "boss")
  const columns = [{ difficulty_name: "", max_players: 0 }, ...own.filter((r) => r.kind === "variant")]
  const out: RenownAwards[] = []
  for (const column of columns) {
    const key = column.difficulty_name ? variantKey(column) : ""
    const rules = bosses.flatMap((boss) => {
      const award = awardFor(own, boss.encounter_name, key)
      return award?.has_points ? [{ encounter_name: boss.encounter_name, points: award.points }] : []
    })
    if (!rules.length) continue
    const same = out[0] && !out[0].difficulty_name && sameRules(out[0].rules, rules)
    if (!same) out.push({ difficulty_name: column.difficulty_name, max_players: column.max_players, rules })
  }
  return out
}

/** Renown awards by instance name, for every configured instance with any award. */
export function renownAwardsByInstance(rows: readonly Row[]): Map<string, RenownAwards[]> {
  const out = new Map<string, RenownAwards[]>()
  for (const row of rows) {
    if (row.kind !== "instance") continue
    const awards = instanceRenownAwards(rows, row.instance_name)
    if (awards.length) out.set(row.instance_name, awards)
  }
  return out
}

/** The award column for one difficulty/size, falling back to the default. */
export function awardsForCohort(awards: readonly RenownAwards[] | undefined, difficulty: string, maxPlayers: number) {
  return awards?.find((a) => a.difficulty_name === difficulty && a.max_players === maxPlayers)
    ?? awards?.find((a) => !a.difficulty_name)
}

export function sumRenown(rules: readonly SupportedInstanceRenownRule[]) {
  return rules.reduce((sum, rule) => sum + rule.points, 0)
}

export function formatRenown(points: number) {
  return points.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

/** "10 Player" already names the size; otherwise append it. */
export function awardsLabel(awards: Pick<RenownAwards, "difficulty_name" | "max_players">) {
  if (!awards.difficulty_name) return "Default"
  return awards.difficulty_name.includes(String(awards.max_players))
    ? awards.difficulty_name
    : `${awards.difficulty_name} · ${awards.max_players}p`
}

function sameRules(a: readonly SupportedInstanceRenownRule[], b: readonly SupportedInstanceRenownRule[]) {
  return a.length === b.length && a.every((rule, i) => rule.encounter_name === b[i].encounter_name && rule.points === b[i].points)
}

/** Renown awards for the site's tenant. Empty until the configuration loads, or if it fails. */
export function useRenownAwards() {
  const { data } = useLeaderboardConfiguration()
  return renownAwardsByInstance(data?.rows ?? [])
}
