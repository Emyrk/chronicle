/* eslint-disable react-refresh/only-export-components -- Provider and hook are intentionally colocated. */
import { createContext, useContext, useMemo } from "react";
import { useSession } from "@/api/queries";
import { useInstanceCosmetics } from "@/api/characterCosmetics";
import type {
  CharacterCosmeticsDisplayMode,
  InstanceCosmeticsResponse,
} from "@/api/typesGenerated";
import {
  COSMETIC_CSS,
  combineCosmetics,
  selectionFromAPI,
} from "./PlayerCosmetics";
import type { PlayerMetricChartData, PlayerRowCosmetic } from "./PlayerMetricChartModel";

const PlayerCosmeticsContext = createContext<ReadonlyMap<string, PlayerRowCosmetic>>(new Map());

export function mapInstancePlayerCosmetics(
  players: InstanceCosmeticsResponse["players"] | undefined,
  mode: CharacterCosmeticsDisplayMode,
): ReadonlyMap<string, PlayerRowCosmetic> {
  const mapped = new Map<string, PlayerRowCosmetic>();
  if (!players || mode === "disabled") return mapped;

  for (const [guid, selection] of Object.entries(players)) {
    mapped.set(guid, combineCosmetics(selectionFromAPI(selection), mode));
  }
  return mapped;
}

export function mergePlayerCosmetics(
  data: PlayerMetricChartData[],
  cosmetics: ReadonlyMap<string, PlayerRowCosmetic>,
): PlayerMetricChartData[] {
  if (cosmetics.size === 0) return data;
  return data.map((player) => {
    if (player.cosmetic) return player;
    const cosmetic = cosmetics.get(player.playerID);
    return cosmetic ? { ...player, cosmetic } : player;
  });
}

export function PlayerCosmeticsProvider({
  instanceId,
  children,
}: {
  instanceId: string;
  children: React.ReactNode;
}) {
  const { data: session } = useSession();
  const mode = session?.preferences.character_cosmetics ?? "enabled";
  const { data } = useInstanceCosmetics(instanceId, mode !== "disabled");
  const cosmetics = useMemo(
    () => mapInstancePlayerCosmetics(data?.players, mode),
    [data?.players, mode],
  );

  return (
    <PlayerCosmeticsContext.Provider value={cosmetics}>
      {mode !== "disabled" ? <style data-player-cosmetics>{COSMETIC_CSS}</style> : null}
      {children}
    </PlayerCosmeticsContext.Provider>
  );
}

export function usePlayerCosmetics(): ReadonlyMap<string, PlayerRowCosmetic> {
  return useContext(PlayerCosmeticsContext);
}
