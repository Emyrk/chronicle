import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useArmoryPlayer, useArmorySearch, useSupportedInstanceProgressionBosses } from "@/api/queries"
import type { ArmorySearchResult, LeaderboardV2PlayerHistory, LeaderboardV2PlayerHistoryGroup } from "@/api/typesGenerated"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { formatClassLabel } from "@/pages/ArmoryPage/characterDisplay"
import { cohortKey, rateBoss, type BossRating } from "@/pages/ArmoryPage/overview/careerRatingsModel"
import type { RatingsLink } from "./ratingsLink"

/** Everything the interactive example needs, for the example player or real data. */
export interface RatingDataset {
  key: string
  bossName: string
  cohortLabel: string
  unit: "DPS" | "HPS"
  kills: { value: number; parse?: number; killedAt?: string }[]
  benchmark: number
  award: number
  /** Kills of this boss counted for Renown, across every spec and metric. */
  renownKills: number
  example: boolean
}

export type MyDataState =
  | { status: "choose-character" | "loading" | "error" | "no-kills"; message?: string }
  | { status: "ready" }

function variantLabel(g: LeaderboardV2PlayerHistoryGroup): string {
  return [g.difficulty_name, g.max_players > 0 ? `${g.max_players}-player` : ""].filter(Boolean).join(" ")
}

export function groupKey(g: LeaderboardV2PlayerHistoryGroup): string {
  return [g.instance_name, g.difficulty_name, g.max_players, g.encounter_name, g.player_class, g.player_spec, g.player_sub_spec, g.metric].join("|")
}

/** A raid is an instance variant: difficulty and raid size are separate boards. */
export function raidKey(g: LeaderboardV2PlayerHistoryGroup): string {
  return [g.instance_name, g.difficulty_name, g.max_players].join("|")
}

export interface MyRaid {
  key: string
  label: string
  kills: number
}

function killWord(n: number): string {
  return `${n} ${n === 1 ? "kill" : "kills"}`
}

export function raidLabel(raid: MyRaid): string {
  return `${raid.label} · ${killWord(raid.kills)}`
}

function specLabel(g: LeaderboardV2PlayerHistoryGroup): string {
  return [g.player_sub_spec, g.player_spec, formatClassLabel(g.player_class)].filter(Boolean).join(" ")
}

const RAID_SCOPE = "raid:"

/** Every boss of a raid for one spec and metric, the unit the Armory rates. */
export interface RaidScope {
  key: string
  label: string
  cohort: string
  metric: string
  kills: number
}

export function raidScopeKey(cohort: string, metric: string): string {
  return `${RAID_SCOPE}${cohort}|${metric}`
}

export function raidScopeLabel(scope: RaidScope): string {
  return `${scope.label} · ${scope.metric.toUpperCase()} · ${killWord(scope.kills)}`
}

export interface RaidBoss extends BossRating {
  /** The boss's group for the scope's metric, to drill into; undefined without kills. */
  groupKey?: string
  /** The scope metric's kill values, chronological. */
  values: number[]
}

export interface RaidView {
  scope: RaidScope
  raidLabel: string
  unit: "DPS" | "HPS"
  bosses: RaidBoss[]
  peak: number
  mastery: number
  renown: number
}

/**
 * Rates every boss of the raid for one spec and metric, the way the Armory
 * does: bosses without kills count as zero and Renown counts the spec's kills
 * for either metric.
 */
export function buildRaidView(
  raid: MyRaid,
  groups: LeaderboardV2PlayerHistoryGroup[],
  scope: RaidScope,
  progressionBosses: string[] = [],
): RaidView {
  const byBoss = new Map<string, LeaderboardV2PlayerHistoryGroup[]>()
  for (const g of groups) {
    if (cohortKey(g) !== scope.cohort) continue
    byBoss.set(g.encounter_name, [...(byBoss.get(g.encounter_name) ?? []), g])
  }
  const names = [...progressionBosses, ...[...byBoss.keys()].filter((n) => !progressionBosses.includes(n)).sort()]
  const bosses = names.map((name): RaidBoss => {
    const all = byBoss.get(name) ?? []
    const metricGroup = all.find((g) => g.metric === scope.metric)
    return {
      ...rateBoss(name, metricGroup, all),
      groupKey: metricGroup && groupKey(metricGroup),
      values: metricGroup?.kills.map((k) => k.value) ?? [],
    }
  })
  const avg = (pick: (b: RaidBoss) => number) => (bosses.length === 0 ? 0 : bosses.reduce((s, b) => s + pick(b), 0) / bosses.length)
  return {
    scope,
    raidLabel: raid.label,
    unit: scope.metric === "hps" ? "HPS" : "DPS",
    bosses,
    peak: avg((b) => b.peak),
    mastery: avg((b) => b.mastery),
    renown: bosses.reduce((s, b) => s + b.renown, 0),
  }
}

export function datasetFromGroup(character: Pick<ArmorySearchResult, "realm_id" | "id">, g: LeaderboardV2PlayerHistoryGroup): RatingDataset {
  const kills = g.kills.map((k) => ({ value: k.value, parse: k.parse, killedAt: k.killed_at }))
  // A benchmark refresh can lag a new kill; never let our own kill exceed it.
  const benchmark = Math.max(g.benchmark, ...kills.map((k) => k.value))
  return {
    key: `${character.realm_id}|${character.id}|${groupKey(g)}`,
    bossName: g.encounter_name,
    cohortLabel: [g.player_sub_spec, g.player_spec, formatClassLabel(g.player_class)].filter(Boolean).join(" "),
    unit: g.metric === "hps" ? "HPS" : "DPS",
    kills,
    benchmark,
    award: g.renown_award,
    renownKills: g.renown_kills,
    example: false,
  }
}

export function playerHistoryURL(character: Pick<ArmorySearchResult, "realm_id" | "id">): string {
  const params = new URLSearchParams({ realm: character.realm_id, player: character.id })
  return `/api/v1/leaderboards-v2/player-history?${params}`
}

async function fetchHistory(c: ArmorySearchResult): Promise<LeaderboardV2PlayerHistory> {
  const response = await fetch(playerHistoryURL(c), { credentials: "include" })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message || "Could not load this character's rating history.")
  }
  return response.json() as Promise<LeaderboardV2PlayerHistory>
}

/**
 * Armory character search, the chosen character's boss/cohort groups, and the
 * chosen group as a dataset or the chosen raid scope as a raid view. A deep
 * link preselects its character, raid, and spec.
 */
export function useMyRatingData(enabled: boolean, link?: RatingsLink) {
  const [searchQuery, setSearchQuery] = useState("")
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 250)
  const search = useArmorySearch({ q: debouncedSearch }, { enabled: enabled && debouncedSearch.length >= 2 })
  const linked = useArmoryPlayer(enabled ? link?.realm : undefined, link?.player)
  const { data: progressionBosses } = useSupportedInstanceProgressionBosses()
  const [chosen, setCharacter] = useState<ArmorySearchResult>()
  const character = chosen ?? linked.data
  const [raidChoice, setRaidChoice] = useState(link?.raid ?? "")
  const [scopeChoice, setScopeChoice] = useState(link?.spec !== undefined && link.metric ? raidScopeKey(link.spec, link.metric) : "")
  /** Encounter name; empty for the whole raid. */
  const [bossChoice, setBossChoice] = useState(link?.boss ?? "")

  const history = useQuery({
    queryKey: ["leaderboards-v2-player-history", character?.realm_id, character?.id],
    queryFn: () => fetchHistory(character!),
    enabled: enabled && !!character,
    staleTime: 60_000,
    retry: false,
  })

  // Most-killed first, for raids and bosses: that is where the bands are most interesting.
  const allGroups = history.data?.groups ?? []
  const raidMap = new Map<string, MyRaid>()
  for (const g of allGroups) {
    const key = raidKey(g)
    const raid = raidMap.get(key) ?? { key, label: [g.instance_name, variantLabel(g)].filter(Boolean).join(" "), kills: 0 }
    raid.kills += g.kills.length
    raidMap.set(key, raid)
  }
  const raids = [...raidMap.values()].sort((a, b) => b.kills - a.kills)
  const raid = raids.find((r) => r.key === raidChoice) ?? raids[0]
  const groups = allGroups.filter((g) => raidKey(g) === raid?.key).sort((a, b) => b.kills.length - a.kills.length)

  const scopeMap = new Map<string, RaidScope>()
  for (const g of groups) {
    const key = raidScopeKey(cohortKey(g), g.metric)
    const scope = scopeMap.get(key) ?? { key, label: specLabel(g), cohort: cohortKey(g), metric: g.metric, kills: 0 }
    scope.kills += g.kills.length
    scopeMap.set(key, scope)
  }
  const scopes = [...scopeMap.values()].sort((a, b) => b.kills - a.kills)
  const scope = scopes.find((s) => s.key === scopeChoice) ?? scopes[0]
  // Each kill group belongs to one spec and metric, so the scope and boss name identify it.
  const group = scope && bossChoice
    ? groups.find((g) => raidScopeKey(cohortKey(g), g.metric) === scope.key && g.encounter_name === bossChoice)
    : undefined
  const raidView =
    raid && scope ? buildRaidView(raid, groups, scope, [...(progressionBosses?.get(groups[0].instance_name) ?? [])]) : undefined

  let state: MyDataState = { status: "ready" }
  if (!character) state = linked.isLoading ? { status: "loading" } : linked.isError ? { status: "error", message: "Could not find that Armory character." } : { status: "choose-character" }
  else if (history.isLoading) state = { status: "loading" }
  else if (history.isError) state = { status: "error", message: history.error.message }
  else if (groups.length === 0) state = { status: "no-kills" }

  return {
    state,
    searchQuery,
    setSearchQuery,
    search,
    searchResults: search.data?.players ?? [],
    character,
    selectCharacter: (next: ArmorySearchResult | undefined) => {
      setCharacter(next)
      setSearchQuery("")
      setRaidChoice("")
      setScopeChoice("")
      setBossChoice("")
    },
    raids,
    raid,
    selectRaid: (key: string) => {
      setRaidChoice(key)
      setScopeChoice("")
      setBossChoice("")
    },
    group,
    scopes,
    scope,
    selectScope: setScopeChoice,
    /** The whole raid when no boss is chosen. */
    raidView,
    /** Pass an empty name for all bosses. */
    selectBoss: setBossChoice,
    truncated: history.data?.truncated ?? false,
    dataset: state.status === "ready" && character && group ? datasetFromGroup(character, group) : undefined,
  }
}
