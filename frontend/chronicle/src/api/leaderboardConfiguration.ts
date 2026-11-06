import { useQuery } from "@tanstack/react-query";
import type { LeaderboardConfiguration } from "./typesGenerated";

export function useLeaderboardConfiguration() {
  return useQuery({
    queryKey: ["leaderboard-configuration"],
    queryFn: async (): Promise<LeaderboardConfiguration> => {
      const response = await fetch("/api/v1/leaderboard-configuration");
      if (!response.ok)
        throw new Error(
          "Unable to load leaderboard configuration. Please try again.",
        );
      return response.json();
    },
  });
}
