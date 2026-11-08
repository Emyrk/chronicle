import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { LeaderboardConfiguration } from "./typesGenerated";

/** tenant is a slug or ID; only honored on the root site. */
export function useLeaderboardConfiguration(tenant?: string) {
  return useQuery({
    queryKey: ["leaderboard-configuration", tenant ?? ""],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<LeaderboardConfiguration> => {
      const params = tenant ? `?${new URLSearchParams({ tenant })}` : "";
      const response = await fetch(
        `/api/v1/leaderboard-configuration${params}`,
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.message ||
            "Unable to load leaderboard configuration. Please try again.",
        );
      }
      return response.json();
    },
  });
}
