import { Focus } from "lucide-react"
import type { EntityActionProvider } from "@/components/EntityMenu/EntityMenu"
import type { EntityRef } from "@/components/EntityMenu/entity"
import type { Instance } from "@/pages/Instance/InstancePage"
import type { PlayerMetricChartData } from "./PlayerMetricChartModel"

/** Build an armory URL for a player GUID, or undefined if not a known player or no realm. */
export function getArmoryUrl(instance: Instance, playerId: string): string | undefined {
  const player = instance.players?.[playerId]
  if (!player || !instance.realm) return undefined
  return `/armory/${encodeURIComponent(instance.realm)}/${encodeURIComponent(playerId)}`
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
