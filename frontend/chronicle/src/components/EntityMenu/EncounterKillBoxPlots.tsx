import { useRankingsKillTimes } from "@/api/rankingsQueries";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import { scoredKillParse, summarizeEncounterKillTimes, type ScopedKillParses } from "@/pages/Instance/Overview/encounterKillTimePopulation";
import type { EntityRef } from "./entity";
import { PULL_LOOKBACK_DAYS, SERVER_STATS_LOOKBACK_DAYS, serverStatsSummary, useScopeCohorts } from "./scopeCohorts";
import { ScopeBoxPlots, type ScopeLane } from "./ScopeBoxPlots";

type EncounterPin = Extract<EntityRef, { kind: "encounter" }>;

/**
 * One boss pull against its server, realm and guild: a box plot of each scope's kill times (the
 * same raid, size and difficulty over the last 60 days, fastest kill per run), with this pull
 * marked and its kill-time parse in that scope. A boss without a pull (a name on a leaderboard)
 * has no log to define a realm or guild, so it shows the server's kills alone.
 */
export function EncounterKillBoxPlots({
  encounter,
  label,
  color,
  parses,
}: {
  encounter: EncounterPin;
  label: string;
  color: string;
  parses: ScopedKillParses | undefined;
}) {
  const logId = encounter.logId;
  const cohorts = useScopeCohorts(logId);
  const serverStats = useRankingsKillTimes(encounter.instanceName, `${SERVER_STATS_LOOKBACK_DAYS}d`, !logId);
  const lanes: ScopeLane[] = logId
    ? (["server", "realm", "guild"] as const).map((scope) => ({
        scope,
        loading: cohorts[scope].isLoading,
        summary: cohorts[scope].data ? summarizeEncounterKillTimes(cohorts[scope].data.runs).get(encounter.name) : undefined,
      }))
    : [{ scope: "server", loading: serverStats.isLoading, summary: serverStatsSummary(serverStats.data, encounter.name) }];
  const killed = encounter.killType === "clean" || encounter.killType === "partial";
  const lookbackDays = logId ? PULL_LOOKBACK_DAYS : SERVER_STATS_LOOKBACK_DAYS;

  return (
    <ScopeBoxPlots
      label={label}
      color={color}
      headerRight={
        encounter.durationMs !== undefined ? (
          <span className="font-mono font-semibold tabular-nums">
            {killed ? formatClearDuration(encounter.durationMs) : `${encounter.killType === "wipe" ? "Wipe" : "Reset"} ${formatClearDuration(encounter.durationMs)}`}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">Server, last {lookbackDays} days</span>
        )
      }
      lanes={lanes}
      markers={
        killed && encounter.durationMs !== undefined
          ? [
              {
                key: encounter.id,
                value: encounter.durationMs,
                color,
                label: "This pull",
                parses: { server: scoredKillParse(parses?.server), realm: scoredKillParse(parses?.realm), guild: scoredKillParse(parses?.guild) },
              },
            ]
          : []
      }
      subject={encounter.name}
      unit="kills"
      lookbackDays={lookbackDays}
    />
  );
}
