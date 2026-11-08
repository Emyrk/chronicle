import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useMyCharacters } from "@/api/queries"
import type { LeaderboardV2PlayerHistory, LeaderboardV2PlayerHistoryGroup, LinkedCharacter } from "@/api/typesGenerated"
import { useAuth } from "@/hooks/useAuth"
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
  | { status: "signed-out" | "loading" | "no-characters" | "error" | "no-kills"; message?: string }
  | { status: "ready" }

function variantLabel(g: LeaderboardV2PlayerHistoryGroup): string {
  return [g.difficulty_name, g.max_players > 0 ? `${g.max_players}-player` : ""].filter(Boolean).join(" ")
}

export function groupKey(g: LeaderboardV2PlayerHistoryGroup): string {
  return [g.instance_name, g.difficulty_name, g.max_players, g.encounter_name, g.player_class, g.player_spec, g.player_sub_spec, g.metric].join("|")
}

export function groupLabel(g: LeaderboardV2PlayerHistoryGroup): string {
  const variant = variantLabel(g)
  const spec = [g.player_sub_spec, g.player_spec, formatClassLabel(g.player_class)].filter(Boolean).join(" ")
  return `${g.encounter_name}${variant ? ` (${variant})` : ""} · ${spec} ${g.metric.toUpperCase()} · ${g.kills.length} ${g.kills.length === 1 ? "kill" : "kills"}`
}

export function datasetFromGroup(character: LinkedCharacter, g: LeaderboardV2PlayerHistoryGroup): RatingDataset {
  const kills = g.kills.map((k) => ({ value: k.value, parse: k.parse, killedAt: k.killed_at }))
  // A benchmark refresh can lag a new kill; never let our own kill exceed it.
  const benchmark = Math.max(g.benchmark, ...kills.map((k) => k.value))
  return {
    key: `${character.realm_id}|${character.character_guid}|${groupKey(g)}`,
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

async function fetchHistory(c: LinkedCharacter): Promise<LeaderboardV2PlayerHistory> {
  const params = new URLSearchParams({ realm: c.realm_id, player: c.character_guid })
  const response = await fetch(`/api/v1/leaderboards-v2/player-history?${params}`, { credentials: "include" })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message || "Could not load your rating history.")
  }
  return response.json() as Promise<LeaderboardV2PlayerHistory>
}

/** Linked characters, the chosen character's boss/cohort groups, and the chosen group as a dataset. */
export function useMyRatingData(enabled: boolean) {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const characters = useMyCharacters({ enabled: enabled && isAuthenticated })
  const [characterKey, setCharacterKey] = useState("")
  const [groupChoice, setGroupChoice] = useState("")

  const list = characters.data ?? []
  const character =
    list.find((c) => `${c.realm_id}|${c.character_guid}` === characterKey) ?? list.find((c) => c.is_primary) ?? list[0]

  const history = useQuery({
    queryKey: ["leaderboards-v2-player-history", character?.realm_id, character?.character_guid],
    queryFn: () => fetchHistory(character!),
    enabled: enabled && !!character,
    staleTime: 60_000,
    retry: false,
  })

  // Most-killed first: that is where the bands are most interesting.
  const groups = [...(history.data?.groups ?? [])].sort((a, b) => b.kills.length - a.kills.length)
  const group = groups.find((g) => groupKey(g) === groupChoice) ?? groups[0]

  let state: MyDataState = { status: "ready" }
  if (!authLoading && !isAuthenticated) state = { status: "signed-out" }
  else if (authLoading || characters.isLoading || history.isLoading) state = { status: "loading" }
  else if (characters.isError || history.isError) state = { status: "error", message: (history.error ?? characters.error)?.message }
  else if (list.length === 0) state = { status: "no-characters" }
  else if (groups.length === 0) state = { status: "no-kills" }

  return {
    state,
    characters: list,
    character,
    selectCharacter: (key: string) => {
      setCharacterKey(key)
      setGroupChoice("")
    },
    groups,
    group,
    selectGroup: setGroupChoice,
    truncated: history.data?.truncated ?? false,
    dataset: state.status === "ready" && character && group ? datasetFromGroup(character, group) : undefined,
  }
}
