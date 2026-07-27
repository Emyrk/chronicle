import { useQuery } from "@tanstack/react-query";
import type {
  RankingsInstanceSummary,
  RankingsEncounterSummary,
  RankingsLeaderboardResponse,
  RankingsBoxPlotStats,
  RankingsKillTimeStats,
  RankingsSuccessRate,
  KillTimeLeaderboardResponse,
  InstanceParsesResponse,
  SnapshotSummary,
  CohortDebugResponse,
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
  difficulty_names?: string;
  realm_names?: string;
  period?: string;
  class?: string;
  spec?: string;
  role?: string;
  hide_unknowns?: boolean;
  metric?: "dps" | "hps";
  max_players?: number;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.instance_names) searchParams.set("instance_names", params.instance_names);
  if (params.encounter_names) searchParams.set("encounter_names", params.encounter_names);
  if (params.difficulty_names) searchParams.set("difficulty_names", params.difficulty_names);
  if (params.realm_names) searchParams.set("realm_names", params.realm_names);
  if (params.period) searchParams.set("period", params.period);
  if (params.class) searchParams.set("class", params.class);
  if (params.spec) searchParams.set("spec", params.spec);
  if (params.role) searchParams.set("role", params.role);
  if (params.hide_unknowns) searchParams.set("hide_unknowns", "true");
  if (params.metric && params.metric !== "dps") searchParams.set("metric", params.metric);
  if (params.max_players) searchParams.set("max_players", String(params.max_players));
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
  difficulty_names?: string;
  realm_names?: string;
  period?: string;
  role?: string;
  metric?: "dps" | "hps";
  group_by_class?: boolean;
  max_players?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params.instance_names) searchParams.set("instance_names", params.instance_names);
  if (params.encounter_names) searchParams.set("encounter_names", params.encounter_names);
  if (params.difficulty_names) searchParams.set("difficulty_names", params.difficulty_names);
  if (params.realm_names) searchParams.set("realm_names", params.realm_names);
  if (params.period) searchParams.set("period", params.period);
  if (params.role) searchParams.set("role", params.role);
  if (params.metric && params.metric !== "dps") searchParams.set("metric", params.metric);
  if (params.group_by_class) searchParams.set("group_by_class", "true");
  if (params.max_players) searchParams.set("max_players", String(params.max_players));
  const qs = searchParams.toString();

  return useQuery({
    queryKey: ["rankings", "stats", params],
    queryFn: () =>
      fetchJSON<RankingsBoxPlotStats[]>(`/api/v1/rankings/stats${qs ? `?${qs}` : ""}`),
    staleTime: RANKINGS_STALE_TIME,
  });
}

export function useRankingsRealms() {
  return useQuery({
    queryKey: ["rankings", "realms"],
    queryFn: () => fetchJSON<string[]>("/api/v1/rankings/realms"),
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

export function useRankingsSuccessRates(
  instanceName: string,
  period?: string,
  opts?: { difficulty_names?: string; max_players?: number },
) {
  const searchParams = new URLSearchParams();
  searchParams.set("instance_name", instanceName);
  if (period) searchParams.set("period", period);
  if (opts?.difficulty_names) searchParams.set("difficulty_names", opts.difficulty_names);
  if (opts?.max_players) searchParams.set("max_players", String(opts.max_players));

  return useQuery({
    queryKey: ["rankings", "success-rates", instanceName, period, opts],
    queryFn: () =>
      fetchJSON<RankingsSuccessRate[]>(
        `/api/v1/rankings/success-rates?${searchParams.toString()}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    enabled: !!instanceName,
  });
}
export function useRankingsKillTimeLeaderboard(params: {
  instance_name: string;
  encounter_name?: string;
  period?: string;
  limit?: number;
  offset?: number;
}) {
  const searchParams = new URLSearchParams();
  searchParams.set("instance_name", params.instance_name);
  if (params.encounter_name) searchParams.set("encounter_name", params.encounter_name);
  if (params.period) searchParams.set("period", params.period);
  if (params.limit != null) searchParams.set("limit", String(params.limit));
  if (params.offset != null) searchParams.set("offset", String(params.offset));

  return useQuery({
    queryKey: ["rankings", "kill-time-leaderboard", params],
    queryFn: () =>
      fetchJSON<KillTimeLeaderboardResponse>(
        `/api/v1/rankings/kill-time-leaderboard?${searchParams.toString()}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    enabled: !!params.instance_name,
  });
}

export function useSnapshotsList() {
  return useQuery({
    queryKey: ["rankings", "snapshots"],
    queryFn: () => fetchJSON<SnapshotSummary[]>("/api/v1/rankings/snapshots"),
    staleTime: RANKINGS_STALE_TIME,
  });
}

export function useSnapshotCohort(params: {
  snapshotId: string;
  encounter_name?: string;
  class?: string;
  spec?: string;
  difficulty?: string;
  max_players?: number;
  metric?: "dps" | "hps";
}) {
  const searchParams = new URLSearchParams();
  if (params.encounter_name) searchParams.set("encounter_name", params.encounter_name);
  if (params.class) searchParams.set("class", params.class);
  if (params.spec) searchParams.set("spec", params.spec);
  if (params.difficulty !== undefined) searchParams.set("difficulty", params.difficulty);
  if (params.max_players !== undefined) searchParams.set("max_players", String(params.max_players));
  if (params.metric && params.metric !== "dps") searchParams.set("metric", params.metric);
  const qs = searchParams.toString();

  return useQuery({
    queryKey: ["rankings", "snapshot-cohort", params],
    queryFn: () =>
      fetchJSON<CohortDebugResponse>(
        `/api/v1/rankings/snapshots/${params.snapshotId}/cohort${qs ? `?${qs}` : ""}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    // With no encounter/class selected the endpoint returns a buckets-only
    // response, which the cohort viewer uses to populate its dropdowns.
    enabled: !!params.snapshotId,
  });
}

export function useInstanceParses(params: {
  instanceId: string;
  encounterNames?: string[];
  metric?: "dps" | "hps";
  period?: string;
  timeframe?: "historical" | "current";
  /** Skip fetching entirely when the caller knows parses won't be shown. */
  enabled?: boolean;
}) {
  const searchParams = new URLSearchParams();
  // Sort encounter names for stable query key.
  const sortedEncounters = params.encounterNames
    ? [...params.encounterNames].sort()
    : undefined;
  if (sortedEncounters?.length) {
    searchParams.set("encounter_names", sortedEncounters.join(","));
  }
  if (params.metric && params.metric !== "dps") searchParams.set("metric", params.metric);
  if (params.period) searchParams.set("period", params.period);
  if (params.timeframe && params.timeframe !== "historical") {
    searchParams.set("timeframe", params.timeframe);
  }
  const qs = searchParams.toString();

  return useQuery({
    queryKey: [
      "rankings",
      "instance-parses",
      params.instanceId,
      sortedEncounters,
      params.metric ?? "dps",
      params.period ?? "all",
      params.timeframe ?? "historical",
    ],
    queryFn: () =>
      fetchJSON<InstanceParsesResponse>(
        `/api/v1/rankings/instances/${params.instanceId}/parses${qs ? `?${qs}` : ""}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    enabled: !!params.instanceId && (params.enabled ?? true),
  });
}

