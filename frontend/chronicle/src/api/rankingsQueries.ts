import { useQuery } from "@tanstack/react-query";
import type {
  RankingsInstanceSummary,
  RankingsEncounterSummary,
  RankingsLeaderboardResponse,
  RankingsBoxPlotStats,
  RankingsKillTimeStats,
  RankingsSuccessRate,
} from "./typesGenerated";

const RANKINGS_STALE_TIME = 5 * 60 * 1000; // 5 minutes

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Rankings API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function useRankingsInstances() {
  return useQuery({
    queryKey: ["rankings", "instances"],
    queryFn: () => fetchJSON<RankingsInstanceSummary[]>("/api/v1/rankings/instances"),
    staleTime: RANKINGS_STALE_TIME,
  });
}

export function useRankingsEncounters(instanceName: string) {
  return useQuery({
    queryKey: ["rankings", "encounters", instanceName],
    queryFn: () =>
      fetchJSON<RankingsEncounterSummary[]>(
        `/api/v1/rankings/encounters?instance_name=${encodeURIComponent(instanceName)}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    enabled: !!instanceName,
  });
}

export function useRankingsLeaderboard(params: {
  instance_names?: string;
  encounter_names?: string;
  period?: string;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.instance_names) searchParams.set("instance_names", params.instance_names);
  if (params.encounter_names) searchParams.set("encounter_names", params.encounter_names);
  if (params.period) searchParams.set("period", params.period);
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  if (params.offset != null) searchParams.set("offset", String(params.offset));
  const qs = searchParams.toString();

  return useQuery({
    queryKey: ["rankings", "leaderboard", params],
    queryFn: () =>
      fetchJSON<RankingsLeaderboardResponse>(`/api/v1/rankings/leaderboard${qs ? `?${qs}` : ""}`),
    staleTime: RANKINGS_STALE_TIME,
  });
}

export function useRankingsStats(params: {
  instance_names?: string;
  encounter_names?: string;
  period?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params.instance_names) searchParams.set("instance_names", params.instance_names);
  if (params.encounter_names) searchParams.set("encounter_names", params.encounter_names);
  if (params.period) searchParams.set("period", params.period);
  const qs = searchParams.toString();

  return useQuery({
    queryKey: ["rankings", "stats", params],
    queryFn: () =>
      fetchJSON<RankingsBoxPlotStats[]>(`/api/v1/rankings/stats${qs ? `?${qs}` : ""}`),
    staleTime: RANKINGS_STALE_TIME,
  });
}

export function useRankingsKillTimes(instanceName: string, period?: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("instance_name", instanceName);
  if (period) searchParams.set("period", period);

  return useQuery({
    queryKey: ["rankings", "kill-times", instanceName, period],
    queryFn: () =>
      fetchJSON<RankingsKillTimeStats[]>(`/api/v1/rankings/kill-times?${searchParams.toString()}`),
    staleTime: RANKINGS_STALE_TIME,
    enabled: !!instanceName,
  });
}

export function useRankingsSuccessRates(instanceName: string, period?: string) {
  const searchParams = new URLSearchParams();
  searchParams.set("instance_name", instanceName);
  if (period) searchParams.set("period", period);

  return useQuery({
    queryKey: ["rankings", "success-rates", instanceName, period],
    queryFn: () =>
      fetchJSON<RankingsSuccessRate[]>(
        `/api/v1/rankings/success-rates?${searchParams.toString()}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    enabled: !!instanceName,
  });
}
