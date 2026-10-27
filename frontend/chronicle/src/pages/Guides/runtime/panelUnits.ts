/** Unit facts a Lua panel can look up with Chronicle.GetUnit. Built by the host from data already loaded with the instance. */
export type PanelUnit = Readonly<{
  guid: string
  name: string
  /** True for player characters; pets, summons and NPCs are false. */
  player: boolean
  /** Upper-case class token such as "WARRIOR" (players only). */
  class?: string
  /** Upper-case race token such as "ORC" (players only). */
  race?: string
  level?: number
  /** GUID of the controlling player for pets and summons. */
  owner?: string
  /** Creature entry ID for NPCs, pets and summons. */
  entry?: number
}>

export type PanelUnits = Readonly<Record<string, PanelUnit>>

type PlayerSource = { name: string; class?: string; race?: string; level?: number }
type UnitSource = { name?: string; owner?: string | { toString(): string }; entry?: number }

export function buildPanelUnits(players: Readonly<Record<string, PlayerSource>> | null | undefined,
  units: Readonly<Record<string, UnitSource>> | null | undefined): PanelUnits {
  const result: Record<string, PanelUnit> = Object.create(null)
  for (const [guid, unit] of Object.entries(units ?? {})) {
    result[guid] = {
      guid, name: unit.name || guid, player: false,
      ...(unit.owner ? { owner: String(unit.owner) } : {}),
      ...(unit.entry ? { entry: unit.entry } : {}),
    }
  }
  for (const [guid, player] of Object.entries(players ?? {})) {
    result[guid] = {
      guid, name: player.name, player: true,
      ...(player.class ? { class: player.class.toUpperCase() } : {}),
      ...(player.race ? { race: player.race.toUpperCase() } : {}),
      ...(player.level ? { level: player.level } : {}),
    }
  }
  return result
}
