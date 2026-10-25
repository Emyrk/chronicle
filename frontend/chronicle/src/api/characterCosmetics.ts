import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CharacterCosmeticsDisplayMode,
  InstanceCosmeticsResponse,
  Preferences,
  Session,
} from "./typesGenerated";

export type { CharacterCosmeticsDisplayMode } from "./typesGenerated";

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
      return response.json() as Promise<Preferences>;
    },
    onSuccess: (preferences) => {
      queryClient.setQueryData<Session | null>(["session"], (session) => (
        session ? { ...session, preferences } : session
      ));
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });
}
