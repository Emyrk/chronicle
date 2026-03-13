import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { CharacterHeader } from "./CharacterHeader";
import { GearDisplay } from "./GearDisplay";

async function fetchArmoryPlayer(realm: string, player: string): Promise<ArmoryPlayer> {
  const response = await fetch(`/api/v1/armory/${encodeURIComponent(realm)}/${encodeURIComponent(player)}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch player: ${response.status}`);
  }
  return response.json();
}

/**
 * WoW-style character armory page.
 *
 * Route: /armory/:realmName/:playerIdentifier
 * The playerIdentifier can be either a player name or a GUID.
 */
export function ArmoryPage() {
  const { realmName, playerIdentifier } = useParams<{
    realmName: string;
    playerIdentifier: string;
  }>();

  const { data: player, isLoading, error } = useQuery({
    queryKey: ["armory", realmName, playerIdentifier],
    queryFn: () => fetchArmoryPlayer(realmName!, playerIdentifier!),
    enabled: !!realmName && !!playerIdentifier,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-500">Loading character…</div>
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-500">
          Character not found: {realmName}/{playerIdentifier}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      <CharacterHeader player={player} realmName={realmName!} />

      <div className="mt-6">
        <GearDisplay gear={player.gear} />
      </div>
    </div>
  );
}
