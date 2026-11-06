import { useQuery } from "@tanstack/react-query";
import type {
  LeaderboardV2Cohort,
  LeaderboardV2Response,
} from "./typesGenerated";

async function get<T>(params: string): Promise<T> {
  const response = await fetch(`/api/v1/leaderboards-v2?${params}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message || "Unable to load leaderboard preview");
  }
  return response.json();
}
export function useLeaderboardV2Cohorts(params: string, enabled: boolean) {
  return useQuery({
    queryKey: ["leaderboards-v2", "cohorts", params],
    queryFn: () =>
      get<readonly LeaderboardV2Cohort[]>(`${params}&view=cohorts`),
    enabled,
  });
}
export function useLeaderboardV2(params: string) {
  return useQuery({
    queryKey: ["leaderboards-v2", params],
    queryFn: () => get<LeaderboardV2Response>(params),
    retry: false,
  });
}
