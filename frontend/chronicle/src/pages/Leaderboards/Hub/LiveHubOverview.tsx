import {
  useRankingsKillTimeLeaderboard,
  useRankingsKillTimes,
  useRankingsStats,
  useRankingsSuccessRates,
} from "@/api/rankingsQueries";
import { useHubSummary, type HubSummary } from "./hubSummaryAdapter";
import { Overview, type HubLiveTabContext } from "./LeaderboardHub";
import { liveOverviewData } from "./liveOverviewData";

export interface LiveHubOverviewProps {
  context: HubLiveTabContext;
  /** The page's summary: the overview reuses it while the scope matches its request. */
  summary: HubSummary;
  /** Encounter included in the page summary's request. */
  requestedEncounter?: string;
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
  requestedEncounter,
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
  // The page summary answers the default scope; any other scope is its own CDN-cacheable summary URL.
  const changedScope =
    role !== "dps" ||
    !!scope.cls ||
    !!scope.spec ||
    !!scope.subSpec ||
    (scope.boss ?? undefined) !== (requestedEncounter ?? undefined);
  const refreshed = useHubSummary(
    {
      instanceName,
      encounterName: scope.boss,
      cohort: cohort
        ? { difficulty: cohort.difficulty_name, maxPlayers: cohort.max_players }
        : undefined,
      performance: metric,
      cls: scope.cls,
      spec: scope.spec,
      subSpec: scope.subSpec,
      realmIDs,
    },
    changedScope,
  );
  const summary = changedScope ? refreshed.data : pageSummary;
  const exact = cohort
    ? {
        difficulty_names: cohort.difficulty_name,
        max_players: cohort.max_players || undefined,
        exact_cohort: true,
      }
    : undefined;
  // Shared with the Statistics tab's queries, so switching tabs reuses them.
  const statsParams = {
    instance_names: instanceName,
    encounter_names: scope.boss,
    realm_names: realmName,
    ...exact,
  };
  // Spec spreads only appear on character boards; Guilds mode never draws them.
  const characters = subject === "characters";
  const stats = useRankingsStats({ ...statsParams, metric }, !!exact && characters);
  const offRoleStats = useRankingsStats(
    { ...statsParams, metric: metric === "dps" ? "hps" : "dps" },
    !!exact && characters && !!scope.cls,
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
  if (changedScope && refreshed.isError)
    return (
      <p
        role="alert"
        className="rounded-xl border bg-card p-8 text-sm text-muted-foreground"
      >
        Could not load the raid overview.
      </p>
    );
  const data = summary
    ? liveOverviewData({
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
        pending: stats.isPending && !!exact && characters,
      })
    : { pending: true };

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
