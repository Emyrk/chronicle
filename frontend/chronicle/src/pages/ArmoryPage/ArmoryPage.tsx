import { useParams } from "react-router-dom";
import { CharacterHeader } from "./CharacterHeader";
import { GearDisplay } from "./GearDisplay";
import { MOCK_PLAYER } from "./mockData";

/**
 * WoW-style character armory page.
 *
 * Route: /armory/:realmName/:playerIdentifier
 *
 * TODO: Replace mock data with API fetch once /api/v1/armory endpoint exists.
 * The playerIdentifier can be either a player name or a GUID.
 */
export function ArmoryPage() {
  const { realmName, playerIdentifier } = useParams<{
    realmName: string;
    playerIdentifier: string;
  }>();

  // TODO: Replace with useQuery fetch from /api/v1/armory/{realmName}/{playerIdentifier}
  const player = MOCK_PLAYER;
  const _isLoading = false;
  const _error = null;

  // Placeholder for when API is wired up
  void realmName;
  void playerIdentifier;

  if (_isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-500">Loading character…</div>
      </div>
    );
  }

  if (_error || !player) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-zinc-500">
          Character not found: {realmName}/{playerIdentifier}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl py-8 px-4">
      <CharacterHeader player={player} />

      <div className="mt-6">
        <GearDisplay gear={player.gear} />
      </div>
    </div>
  );
}
