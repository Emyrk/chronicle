import { useQuery } from "@tanstack/react-query";
import type { AchievementsResponse } from "@/api/typesGenerated";

export const ACHIEVEMENTS_QUERY_KEY = ["achievements"] as const;

/** GET /api/v1/achievements: the catalog, completion rates, and the viewer's progress when signed in. */
export function useAchievements() {
  return useQuery({
    queryKey: ACHIEVEMENTS_QUERY_KEY,
    queryFn: async () => {
      const response = await fetch("/api/v1/achievements");
      if (!response.ok) throw new Error(`Achievements request failed: ${response.status}`);
      return (await response.json()) as AchievementsResponse;
    },
    staleTime: 60 * 1000,
  });
}
