import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useArmorySearch } from "@/api/queries"
import type { ArmorySearchResult, LeaderboardV2PlayerHistory, LeaderboardV2PlayerHistoryGroup } from "@/api/typesGenerated"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { formatClassLabel } from "@/pages/ArmoryPage/characterDisplay"

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

/** Within one raid, the boss name, spec, and metric identify the option. */
export function groupLabel(g: LeaderboardV2PlayerHistoryGroup): string {
  const spec = [g.player_sub_spec, g.player_spec, formatClassLabel(g.player_class)].filter(Boolean).join(" ")
  return `${g.encounter_name} · ${spec} ${g.metric.toUpperCase()} · ${killWord(g.kills.length)}`
}

export function datasetFromGroup(character: ArmorySearchResult, g: LeaderboardV2PlayerHistoryGroup): RatingDataset {
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

/** Armory character search, the chosen character's boss/cohort groups, and the chosen group as a dataset. */
export function useMyRatingData(enabled: boolean) {
  const [searchQuery, setSearchQuery] = useState("")
  const debouncedSearch = useDebouncedValue(searchQuery.trim(), 250)
  const search = useArmorySearch({ q: debouncedSearch }, { enabled: enabled && debouncedSearch.length >= 2 })
  const [character, setCharacter] = useState<ArmorySearchResult>()
  const [raidChoice, setRaidChoice] = useState("")
  const [groupChoice, setGroupChoice] = useState("")

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
  const group = groups.find((g) => groupKey(g) === groupChoice) ?? groups[0]

  let state: MyDataState = { status: "ready" }
  if (!character) state = { status: "choose-character" }
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
      setGroupChoice("")
    },
    raids,
    raid,
    selectRaid: (key: string) => {
      setRaidChoice(key)
      setGroupChoice("")
    },
    groups,
    group,
    selectGroup: setGroupChoice,
    truncated: history.data?.truncated ?? false,
    dataset: state.status === "ready" && character && group ? datasetFromGroup(character, group) : undefined,
  }
}
