import { Focus } from "lucide-react"
import type { EntityActionProvider } from "@/components/EntityMenu/EntityMenu"
import { entityAttributes, type EntityRef } from "@/components/EntityMenu/entity"
import type { FavoritePlayer } from "@/api/typesGenerated"
import type { Instance } from "@/pages/Instance/InstancePage"
import type { PlayerMetricChartData } from "./PlayerMetricChartModel"

/** Build an armory URL for a player GUID, or undefined if not a known player or no realm. */
export function getArmoryUrl(instance: Pick<Instance, "players" | "realm">, playerId: string): string | undefined {
  const player = instance.players?.[playerId]
  const realm = player?.realm_id ?? instance.realm
  if (!player || !realm) return undefined
  return `/armory/${encodeURIComponent(realm)}/${encodeURIComponent(playerId)}`
}

/** The player a GUID in this log belongs to, for the entity menu; undefined for pets, NPCs and unknown GUIDs. */
export function instanceCharacterEntity(instance: Pick<Instance, "players" | "realm">, guid: string): EntityRef | undefined {
  const player = instance.players?.[guid]
  const realm = player?.realm_id ?? instance.realm
  if (!player || !realm) return undefined
  return { kind: "character", realm, guid, name: player.name, className: player.class }
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
    const entity = instanceCharacterEntity(instance, row.playerID)
    return entity ? { ...entity, name: row.playerName, className: row.className } : undefined
  }
}

/** The "Focus" entry meter panels add to a player's entity menu. */
export function focusPlayerActions(onFocus: (playerId: string) => void): EntityActionProvider {
  return (entity) =>
    entity.kind === "character"
      ? [{ id: "focus", label: `Focus ${entity.name}`, icon: Focus, onSelect: () => onFocus(entity.guid) }]
      : []
}

/** Match favorites by GUID and home realm; older instance responses carry only a realm name. */
export function isInstancePlayerFavorite(
  instance: Pick<Instance, "players" | "realm">,
  guid: string,
  favorites: readonly Pick<FavoritePlayer, "id" | "realm_id" | "realm_name">[],
): boolean {
  const player = instance.players?.[guid]
  const realm = player?.realm_id ?? instance.realm
  if (!player || !realm) return false
  return favorites.some((favorite) => favorite.id === guid && (
    favorite.realm_id === realm || (player.realm_id == null && favorite.realm_name.toLowerCase() === realm.toLowerCase())
  ))
}
