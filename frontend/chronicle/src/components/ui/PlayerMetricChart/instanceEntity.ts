import { Focus } from "lucide-react"
import type { EntityActionProvider } from "@/components/EntityMenu/EntityMenu"
import { entityAttributes, type EntityRef } from "@/components/EntityMenu/entity"
import type { Instance } from "@/pages/Instance/InstancePage"
import type { PlayerMetricChartData } from "./PlayerMetricChartModel"

/** Build an armory URL for a player GUID, or undefined if not a known player or no realm. */
export function getArmoryUrl(instance: Instance, playerId: string): string | undefined {
  const player = instance.players?.[playerId]
  if (!player || !instance.realm) return undefined
  return `/armory/${encodeURIComponent(instance.realm)}/${encodeURIComponent(playerId)}`
}

/** The player a GUID in this log belongs to, for the entity menu; undefined for pets, NPCs and unknown GUIDs. */
export function instanceCharacterEntity(instance: Pick<Instance, "players" | "realm">, guid: string): EntityRef | undefined {
  const player = instance.players?.[guid]
  if (!player || !instance.realm) return undefined
  return { kind: "character", realm: instance.realm, guid, name: player.name, className: player.class }
}

/**
 * Spread onto the element showing a unit's name so Alt+click opens its entity menu. Empty for
 * pets, NPCs and unknown GUIDs, so it is safe on any unit name.
 */
export function instanceEntityAttributes(
  instance: Pick<Instance, "players" | "realm">,
  guid: string | undefined,
): Partial<ReturnType<typeof entityAttributes>> {
  const entity = guid ? instanceCharacterEntity(instance, guid) : undefined
  return entity ? entityAttributes(entity) : {}
}

/** The log's guild, for the entity menu. */
export function instanceGuildEntity(instance: Pick<Instance, "guild">): EntityRef | undefined {
  return instance.guild ? { kind: "guild", id: instance.guild.id, name: instance.guild.name } : undefined
}

/** The character a meter row stands for, for its entity menu; pets and NPCs have none. */
export function instanceRowEntity(instance: Instance): (row: PlayerMetricChartData) => EntityRef | undefined {
  return (row) => {
    const player = instance.players?.[row.playerID]
    if (!player || !instance.realm) return undefined
    return { kind: "character", realm: instance.realm, guid: row.playerID, name: row.playerName, className: row.className }
  }
}

/** The "Focus" entry meter panels add to a player's entity menu. */
export function focusPlayerActions(onFocus: (playerId: string) => void): EntityActionProvider {
  return (entity) =>
    entity.kind === "character"
      ? [{ id: "focus", label: `Focus ${entity.name}`, icon: Focus, onSelect: () => onFocus(entity.guid) }]
      : []
}
