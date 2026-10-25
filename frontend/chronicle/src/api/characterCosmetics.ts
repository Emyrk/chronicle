import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CosmeticSelection, Preferences, Session } from "./typesGenerated";

/** Mirrors the generated API contract so this frontend change can build independently. */
export type CharacterCosmeticsDisplayMode = "enabled" | "limited" | "disabled";

/** Mirrors the compact instance cosmetics API response. */
export interface InstanceCosmeticsResponse {
  readonly players: Record<string, CosmeticSelection>;
}

export type CharacterCosmeticsPreferences = Preferences & {
  readonly character_cosmetics?: CharacterCosmeticsDisplayMode;
};

export type SessionWithCharacterCosmetics = Omit<Session, "preferences"> & {
  readonly preferences: CharacterCosmeticsPreferences;
};

export function useInstanceCosmetics(instanceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["instanceCosmetics", instanceId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/raidlogs/instances/${instanceId}/cosmetics`);
      if (!response.ok) throw new Error("Failed to fetch instance cosmetics");
      return response.json() as Promise<InstanceCosmeticsResponse>;
    },
    enabled: enabled && instanceId.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}

export function useUpdateCharacterCosmeticsPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (characterCosmetics: CharacterCosmeticsDisplayMode) => {
      const response = await fetch("/api/v1/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ character_cosmetics: characterCosmetics }),
      });
      if (!response.ok) throw new Error("Failed to update character cosmetics preference");
      return response.json() as Promise<CharacterCosmeticsPreferences>;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData<SessionWithCharacterCosmetics | null>(["session"], (session) => (
        session ? { ...session, preferences } : session
      ));
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
}
