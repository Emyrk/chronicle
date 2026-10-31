import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import type {
  RankingsInstanceSummary,
  RankingsEncounterSummary,
  RankingsLeaderboardResponse,
  RankingsBoxPlotStats,
  RankingsKillTimeStats,
  RankingsSuccessRate,
  KillTimeLeaderboardResponse,
  InstanceParsesResponse,
  ParseScoreCohortBucketsResponse,
  ParseScoreCohortResponse,
  ParseScoreSpreadsResponse,
  TimeParseSpreadsResponse,
  TimeParseCohortBucketsResponse,
  TimeParseCohortKind,
  TimeParseCohortResponse,
  CharacterParseHistoryResponse,
  CharacterPerformanceResponse,
  CharacterEncounterStatsResponse,
  RankingsFilterClass,
} from "./typesGenerated";

const RANKINGS_STALE_TIME = 5 * 60 * 1000; // 5 minutes

class RankingsAPIError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "RankingsAPIError";
    this.status = status;
  }
}

async function fetchJSON<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new RankingsAPIError(`Rankings API error: ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}

/**
 * Retry policy for rankings queries: client errors (4xx — missing endpoint,
 * bad GUID) are fatal and never retried; anything else gets the default
 * three attempts.
 */
function retryUnlessClientError(failureCount: number, error: unknown): boolean {
  if (error instanceof RankingsAPIError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 3;
}

/**
 * A character's deduped parse history (last 60 days) plus their overall
 * score, for one metric.
 */
export function useCharacterParses(playerGuid?: string, metric: "dps" | "hps" = "dps") {
  return useQuery({
    queryKey: ["rankings", "character-parses", playerGuid, metric],
    queryFn: () =>
      fetchJSON<CharacterParseHistoryResponse>(
        `/api/v1/rankings/characters/${encodeURIComponent(playerGuid!)}/parses?metric=${metric}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    enabled: !!playerGuid,
    retry: retryUnlessClientError,
  });
}

export interface CharacterPerformanceParams {
  playerGuid?: string;
  realmID?: string;
  instanceName?: string;
  encounterNames: string[];
  difficultyName?: string;
  maxPlayers?: number;
  metric: "dps" | "hps";
}

function characterPerformanceQuery(params: CharacterPerformanceParams) {
  const searchParams = new URLSearchParams();
  if (params.realmID) searchParams.set("realm_id", params.realmID);
  if (params.instanceName) searchParams.set("instance_name", params.instanceName);
  if (params.encounterNames.length > 0) searchParams.set("encounter_names", params.encounterNames.join(","));
  if (params.difficultyName) searchParams.set("difficulty_name", params.difficultyName);
  if (params.maxPlayers) searchParams.set("max_players", String(params.maxPlayers));
  searchParams.set("metric", params.metric);

  return {
    queryKey: ["rankings", "character-performance", params] as const,
    queryFn: () =>
      fetchJSON<CharacterPerformanceResponse>(
        `/api/v1/rankings/characters/${encodeURIComponent(params.playerGuid!)}/performance?${searchParams.toString()}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    enabled: !!params.playerGuid && !!params.instanceName && params.encounterNames.length > 0,
    retry: retryUnlessClientError,
  };
}

/** Canonical runs aggregated across a selected set of boss encounters. */
export function useCharacterPerformance(params: CharacterPerformanceParams) {
  return useQuery(characterPerformanceQuery(params));
}

/** Canonical runs for a dynamic list of characters. */
export function useCharacterPerformances(params: readonly CharacterPerformanceParams[]) {
  return useQueries({ queries: params.map(characterPerformanceQuery) });
}

/** Per-encounter kill aggregates for a character across all recorded logs. */
export function useCharacterEncounters(playerGuid?: string, realmID?: string, enabled = true) {
  return useQuery({
    queryKey: ["rankings", "character-encounters", playerGuid, realmID],
    queryFn: () => {
      const searchParams = new URLSearchParams();
      if (realmID) searchParams.set("realm_id", realmID);
      const query = searchParams.size > 0 ? `?${searchParams.toString()}` : "";
      return fetchJSON<CharacterEncounterStatsResponse>(
        `/api/v1/rankings/characters/${encodeURIComponent(playerGuid!)}/encounters${query}`,
      );
    },
    staleTime: RANKINGS_STALE_TIME,
    enabled: enabled && !!playerGuid,
    retry: retryUnlessClientError,
  });
}

export function useRankingsInstances(enabled = true) {
  return useQuery({
    queryKey: ["rankings", "instances"],
    queryFn: () => fetchJSON<RankingsInstanceSummary[]>("/api/v1/rankings/instances"),
    staleTime: RANKINGS_STALE_TIME,
    enabled,
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

export function useRankingsFilters(instanceName?: string) {
  const searchParams = new URLSearchParams();
  if (instanceName) searchParams.set("instance_names", instanceName);
  const qs = searchParams.toString();
  return useQuery({
    queryKey: ["rankings", "filters", instanceName],
    queryFn: () => fetchJSON<RankingsFilterClass[]>(`/api/v1/rankings/filters${qs ? `?${qs}` : ""}`),
    staleTime: RANKINGS_STALE_TIME,
  });
}

export function useRankingsLeaderboard(params: {
  instance_names?: string;
  encounter_names?: string;
  encounter_set?: string;
  difficulty_names?: string;
  realm_names?: string;
  period?: string;
  class?: string;
  spec?: string;
  sub_spec?: string;
  role?: string;
  hide_unknowns?: boolean;
  metric?: "dps" | "hps";
  max_players?: number;
  limit?: number;
  offset?: number;
}, enabled = true) {
  const searchParams = new URLSearchParams();
  if (params.instance_names) searchParams.set("instance_names", params.instance_names);
  if (params.encounter_names) searchParams.set("encounter_names", params.encounter_names);
  if (params.encounter_set !== undefined) searchParams.set("encounter_set", params.encounter_set);
  if (params.difficulty_names) searchParams.set("difficulty_names", params.difficulty_names);
  if (params.realm_names) searchParams.set("realm_names", params.realm_names);
  if (params.period) searchParams.set("period", params.period);
  if (params.class) searchParams.set("class", params.class);
  if (params.spec) searchParams.set("spec", params.spec);
  if (params.sub_spec) searchParams.set("sub_spec", params.sub_spec);
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
    enabled,
  });
}

export function useRankingsStats(params: {
  instance_names?: string;
  encounter_names?: string;
  encounter_set?: string;
  difficulty_names?: string;
  realm_names?: string;
  period?: string;
  role?: string;
  metric?: "dps" | "hps";
  group_by_class?: boolean;
  max_players?: number;
}, enabled = true) {
  const searchParams = new URLSearchParams();
  if (params.instance_names) searchParams.set("instance_names", params.instance_names);
  if (params.encounter_names) searchParams.set("encounter_names", params.encounter_names);
  if (params.encounter_set !== undefined) searchParams.set("encounter_set", params.encounter_set);
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
    enabled,
  });
}

export function useRankingsRealms() {
  return useQuery({
    queryKey: ["rankings", "realms"],
    queryFn: () => fetchJSON<string[]>("/api/v1/rankings/realms"),
    staleTime: RANKINGS_STALE_TIME,
  });
}

export function useRankingsKillTimes(instanceName: string, period?: string, enabled = true) {
  const searchParams = new URLSearchParams();
  searchParams.set("instance_name", instanceName);
  if (period) searchParams.set("period", period);

  return useQuery({
    queryKey: ["rankings", "kill-times", instanceName, period],
    queryFn: () =>
      fetchJSON<RankingsKillTimeStats[]>(`/api/v1/rankings/kill-times?${searchParams.toString()}`),
    staleTime: RANKINGS_STALE_TIME,
    enabled: enabled && !!instanceName,
  });
}

/** Box plot stats on qualified full clears; empty when there are none. */
export function useRankingsClearTimes(instanceName: string, period?: string, enabled = true) {
  const searchParams = new URLSearchParams();
  searchParams.set("instance_name", instanceName);
  if (period) searchParams.set("period", period);

  return useQuery({
    queryKey: ["rankings", "clear-times", instanceName, period],
    queryFn: () =>
      fetchJSON<RankingsKillTimeStats[]>(`/api/v1/rankings/clear-times?${searchParams.toString()}`),
    staleTime: RANKINGS_STALE_TIME,
    enabled: enabled && !!instanceName,
  });
}

export function useRankingsSuccessRates(
  instanceName: string,
  period?: string,
  opts?: { difficulty_names?: string; max_players?: number },
  enabled = true,
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
    enabled: enabled && !!instanceName,
  });
}
export function useRankingsKillTimeLeaderboard(params: {
  instance_name: string;
  encounter_name?: string;
  period?: string;
  limit?: number;
  offset?: number;
}, enabled = true) {
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
    enabled: enabled && !!params.instance_name,
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


export type TimeParseCohortPeriod = "30d" | "60d" | "90d" | "180d" | "all";

export function useParseScoreCohortBuckets(
  date: string,
  period: TimeParseCohortPeriod,
  metric: "dps" | "hps",
) {
  const searchParams = new URLSearchParams({ date, period, metric });

  return useQuery({
    queryKey: ["rankings", "parse-score-cohort-buckets", date, period, metric],
    queryFn: () =>
      fetchJSON<ParseScoreCohortBucketsResponse>(
        `/api/v1/rankings/parse-score-cohorts/buckets?${searchParams.toString()}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    enabled: !!date,
  });
}

/**
 * Parse spreads (tier cutoffs per exact cohort) for public parse pages.
 * Always the live 60-day window ending today.
 */
export function useParseScoreSpreads(params: {
  metric: "dps" | "hps";
  encounterNames: readonly string[];
  playerClass?: string;
  playerSpec?: string;
}, enabled = true) {
  const searchParams = new URLSearchParams({ metric: params.metric, period: "60d" });
  for (const name of params.encounterNames) searchParams.append("encounter_name", name);
  if (params.playerClass) searchParams.set("class", params.playerClass);
  if (params.playerSpec) searchParams.set("spec", params.playerSpec);

  return useQuery({
    queryKey: ["rankings", "parse-score-spreads", params],
    queryFn: () =>
      fetchJSON<ParseScoreSpreadsResponse>(
        `/api/v1/rankings/parse-score-cohorts/spreads?${searchParams.toString()}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    placeholderData: keepPreviousData,
    enabled: enabled && params.encounterNames.length > 0,
  });
}

export function useParseScoreCohort(params: {
  date: string;
  period: TimeParseCohortPeriod;
  metric: "dps" | "hps";
  encounterName: string;
  playerClass: string;
  playerSpec: string;
  playerSubSpec: string;
  difficulty: string;
  maxPlayers: number | undefined;
  cohortMode: string;
}) {
  const searchParams = new URLSearchParams({
    date: params.date,
    period: params.period,
    metric: params.metric,
    encounter_name: params.encounterName,
    class: params.playerClass,
    difficulty: params.difficulty,
    max_players: String(params.maxPlayers ?? ""),
  });
  if (params.playerSpec) searchParams.set("spec", params.playerSpec);
  if (params.playerSubSpec) searchParams.set("sub_spec", params.playerSubSpec);

  return useQuery({
    queryKey: ["rankings", "parse-score-cohort", params],
    queryFn: () =>
      fetchJSON<ParseScoreCohortResponse>(
        `/api/v1/rankings/parse-score-cohorts/cohort?${searchParams.toString()}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    placeholderData: keepPreviousData,
    enabled:
      !!params.date &&
      !!params.encounterName &&
      !!params.playerClass &&
      params.maxPlayers !== undefined &&
      (params.cohortMode !== "spec" || !!params.playerSpec),
  });
}

export function useTimeParseCohortBuckets(date: string, period: TimeParseCohortPeriod) {
  const searchParams = new URLSearchParams({ date, period });

  return useQuery({
    queryKey: ["rankings", "time-parse-cohort-buckets", date, period],
    queryFn: () =>
      fetchJSON<TimeParseCohortBucketsResponse>(
        `/api/v1/rankings/time-parse-cohorts/buckets?${searchParams.toString()}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    enabled: !!date,
  });
}

/**
 * Kill-time and clear-time parse spreads for one instance. Always the live
 * 60-day window ending today.
 */
function timeParseSpreadsQuery(instanceName: string, enabled = true) {
  const searchParams = new URLSearchParams({ instance_name: instanceName, period: "60d" });
  return {
    queryKey: ["rankings", "time-parse-spreads", instanceName],
    queryFn: () =>
      fetchJSON<TimeParseSpreadsResponse>(
        `/api/v1/rankings/time-parse-cohorts/spreads?${searchParams.toString()}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    enabled: enabled && !!instanceName,
  };
}

export function useTimeParseSpreads(instanceName: string, enabled = true) {
  return useQuery(timeParseSpreadsQuery(instanceName, enabled));
}

/** Kill-time spreads for several raids, e.g. encounters from different instances in the compare tray. */
export function useTimeParseSpreadsForInstances(instanceNames: readonly string[]) {
  return useQueries({ queries: instanceNames.map((instanceName) => timeParseSpreadsQuery(instanceName)) });
}

export function useTimeParseCohort(params: {
  date: string;
  period: TimeParseCohortPeriod;
  kind: TimeParseCohortKind;
  instanceName: string;
  encounterName: string;
  difficulty: string;
  maxPlayers: number | undefined;
}) {
  const searchParams = new URLSearchParams({
    date: params.date,
    period: params.period,
    kind: params.kind,
    instance_name: params.instanceName,
    difficulty: params.difficulty,
    max_players: String(params.maxPlayers ?? ""),
  });
  if (params.kind === "boss_kill") searchParams.set("encounter_name", params.encounterName);

  return useQuery({
    queryKey: ["rankings", "time-parse-cohort", params],
    queryFn: () =>
      fetchJSON<TimeParseCohortResponse>(
        `/api/v1/rankings/time-parse-cohorts/cohort?${searchParams.toString()}`,
      ),
    staleTime: RANKINGS_STALE_TIME,
    placeholderData: keepPreviousData,
    enabled:
      !!params.date &&
      !!params.instanceName &&
      params.maxPlayers !== undefined &&
      (params.kind === "clear_time" || !!params.encounterName),
  });
}
