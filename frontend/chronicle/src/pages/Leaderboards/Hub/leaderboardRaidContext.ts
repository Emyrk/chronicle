import type { EntityRaidContext } from "@/components/EntityMenu/entityMenuContext"
import { selectedBosses, type EncounterSelection } from "./encounterSelection"

/** Raid population exposed to the global compare tray by the leaderboard hub. */
export function leaderboardRaidContext(
  instanceName: string,
  selection: EncounterSelection,
  bosses: readonly string[],
  presetBosses: readonly string[],
  cohort?: { difficultyName?: string; maxPlayers?: number },
): EntityRaidContext {
  return {
    instanceName,
    label: `${instanceName} leaderboards`,
    difficultyName: cohort?.difficultyName,
    maxPlayers: cohort?.maxPlayers,
    bossNames: selectedBosses(selection, presetBosses.length ? presetBosses : bosses).filter((name) => name !== "Trash"),
  }
}
