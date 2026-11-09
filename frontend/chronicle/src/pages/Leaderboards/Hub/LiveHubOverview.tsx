import { useQuery } from "@tanstack/react-query";
import type { SpeedrunLeaderboardEntry } from "@/api/typesGenerated";
import {
  useRankingsKillTimeLeaderboard,
  useRankingsKillTimes,
  useRankingsLeaderboard,
  useRankingsStats,
  useRankingsSuccessRates,
} from "@/api/rankingsQueries";
import type { HubSummary } from "./hubSummaryAdapter";
import { Overview, type HubLiveTabContext } from "./LeaderboardHub";
import { liveOverviewData } from "./liveOverviewData";
import { fetchResolvedHubRatings, hubJSON } from "./resolvedHubAdapter";

export interface LiveHubOverviewProps {
  context: HubLiveTabContext;
  /** The page's summary: the overview reuses it while the scope matches its request. */
  summary: HubSummary;
  /** Performance and statistics endpoints filter by realm name; ratings by realm ID. */
  realmName?: string;
  realmIDs: readonly string[];
  /** Configured raid roster; excludes historical non-boss encounters. */
  bosses: readonly string[];
}

/** The Storybook Overview, fed from the published summary and the shared rankings queries. */
export function LiveHubOverview({
  context,
  summary: pageSummary,
  realmName,
  realmIDs,
  bosses,
}: LiveHubOverviewProps) {
  const { instanceName, scope, role, subject } = context;
  const metric = role === "healing" ? "hps" : "dps";
  const raids = pageSummary.instances.filter(
    (row) => row.category === "raid" && row.instance_name === instanceName,
  );
  const cohort = pageSummary.selected_cohort ?? undefined;
  // Trash is a Performances encounter; the overview's boards are boss boards.
  const chosen = context.selection.kind === "bosses" ? context.selection.bosses.filter((name) => name !== "Trash") : [];
  const request = {
    instanceName,
    encounters: chosen,
    cohort: cohort
      ? { difficulty: cohort.difficulty_name, maxPlayers: cohort.max_players }
      : undefined,
    performance: metric,
    cls: scope.cls,
    spec: scope.spec,
    subSpec: scope.subSpec,
    realmIDs,
  } as const;
  const exact = cohort
    ? {
        difficulty_names: cohort.difficulty_name,
        max_players: cohort.max_players,
        exact_cohort: true,
      }
    : undefined;
  const characters = subject === "characters";
  const ratings = useQuery({
    queryKey: ["hub-overview-ratings", request],
    queryFn: () => fetchResolvedHubRatings(request, pageSummary),
    enabled: !!cohort && realmIDs.length <= 1,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const pickedNames = (chosen.length ? chosen : bosses).join(",") || undefined;
  const performance = useRankingsLeaderboard(
    {
      instance_names: instanceName,
      encounter_names: pickedNames,
      difficulty_names: cohort?.difficulty_name,
      max_players: cohort?.max_players,
      exact_cohort: !!cohort,
      class: scope.cls,
      spec: scope.spec,
      sub_spec: scope.subSpec,
      metric,
      realm_names: realmName,
      limit: 5,
    },
    !!cohort && characters,
    { retry: false },
  );
  const speedruns = useQuery<SpeedrunLeaderboardEntry[]>({
    queryKey: ["hub-overview-speedruns", instanceName, realmName, cohort?.difficulty_name, cohort?.max_players],
    queryFn: () => {
      const query = new URLSearchParams({
        instance_name: instanceName,
        difficulty_name: cohort!.difficulty_name,
        instance_max_players: String(cohort!.max_players),
        timing: "full",
      });
      if (realmName) query.append("realm_name", realmName);
      return hubJSON<SpeedrunLeaderboardEntry[]>(`/api/v1/rankings/speedrun?${query}`);
    },
    enabled: !!cohort && !scope.boss,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  // Shared with the Statistics tab's queries, so switching tabs reuses them.
  const statsParams = {
    instance_names: instanceName,
    encounter_names: scope.boss,
    realm_names: realmName,
    ...exact,
  };
  // Spec spreads only appear on character boards; Guilds mode never draws them.
  const stats = useRankingsStats({ ...statsParams, metric }, !!exact && characters, { retry: false });
  const offRoleStats = useRankingsStats(
    { ...statsParams, metric: metric === "dps" ? "hps" : "dps" },
    !!exact && characters && !!scope.cls,
    { retry: false },
  );
  // Kill counts and times are not realm-filtered, and kill times mix raid sizes; only show them where that cannot mislead.
  const instanceWide = !realmName && raids.length === 1;
  const successRates = useRankingsSuccessRates(
    instanceName,
    undefined,
    cohort
      ? {
          difficulty_names: cohort.difficulty_name,
          max_players: cohort.max_players,
          exact_cohort: true,
        }
      : undefined,
    !realmName && !!cohort,
  );
  const killTimes = useRankingsKillTimes(instanceName, undefined, instanceWide);
  const bossKills = useRankingsKillTimeLeaderboard(
    { instance_name: instanceName, encounter_name: scope.boss, limit: 8 },
    instanceWide && !!scope.boss,
  );

  if (!raids.length)
    return (
      <p
        role="status"
        className="rounded-xl border bg-card p-8 text-sm text-muted-foreground"
      >
        No published raid data for {instanceName} yet.
      </p>
    );
  const summary: HubSummary = {
    ...pageSummary,
    ratings: {
      raid: ratings.data ?? pageSummary.ratings.raid,
      bosses: pageSummary.ratings.bosses,
    },
    performances: performance.data?.entries ?? [],
    speedruns: speedruns.data?.slice(0, 5) ?? [],
  };
  const data = liveOverviewData({
    summary,
    bosses,
    scope,
    role,
    subject,
    stats: exact ? stats.data : undefined,
    offRoleStats: exact && scope.cls ? offRoleStats.data : undefined,
    successRates: !realmName && cohort ? successRates.data : undefined,
    killTimes: instanceWide ? killTimes.data : undefined,
    bossKills:
      instanceWide && scope.boss ? bossKills.data?.entries : undefined,
    unfiltered: !realmName && !scope.cls,
    sections: {
      ratings: { pending: ratings.isPending, error: ratings.isError },
      performances: { pending: performance.isPending, error: performance.isError },
      speedruns: scope.boss
        ? { pending: bossKills.isPending, error: bossKills.isError }
        : { pending: speedruns.isPending, error: speedruns.isError },
      statistics: { pending: stats.isPending && !!exact && characters, error: stats.isError },
      bosses: {
        pending: successRates.isPending || killTimes.isPending,
        error: successRates.isError || killTimes.isError,
      },
    },
  });

  return (
    <Overview
      {...context.overview}
      data={data}
      instanceName={instanceName}
      scope={scope}
      role={role}
      subject={subject}
      onScope={context.onScope}
      onTab={context.onTab}
      onRatings={context.onRatings}
      onStatistics={context.onStatistics}
      onRole={context.onRole}
    />
  );
}
