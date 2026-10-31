import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useRankingsClearTimes } from "@/api/rankingsQueries";
import type { SpeedrunLeaderboardEntry, TimeParseScore } from "@/api/typesGenerated";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import { scoredKillParse } from "@/pages/Instance/Overview/encounterKillTimePopulation";
import type { EntityRef } from "./entity";
import { guildAttributes } from "./leaderboardEntities";
import { PULL_LOOKBACK_DAYS, SERVER_STATS_LOOKBACK_DAYS, serverStatsSummary, summarizeClears, useScopeCohorts } from "./scopeCohorts";
import { ScopeBoxPlots, type Scope, type ScopeLane } from "./ScopeBoxPlots";

type RaidPin = Extract<EntityRef, { kind: "raid" }>;

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * A raid against its server, realm and guild: box plots of qualified full-clear times, with the
 * pinned clear marked and its clear-time parse, then the speedrun board's top three. A raid name
 * with no clear (on a leaderboard) has no log to define a realm or guild, so it shows the server.
 */
export function RaidClearBoxPlots({
  raid,
  label,
  color,
  parses,
}: {
  raid: RaidPin;
  label: string;
  color: string;
  parses: Partial<Record<Scope, TimeParseScore>> | null | undefined;
}) {
  const cohorts = useScopeCohorts(raid.logId);
  const serverStats = useRankingsClearTimes(raid.name, `${SERVER_STATS_LOOKBACK_DAYS}d`, !raid.logId);
  const lanes: ScopeLane[] = raid.logId
    ? (["server", "realm", "guild"] as const).map((scope) => ({
        scope,
        loading: cohorts[scope].isLoading,
        summary: cohorts[scope].data ? summarizeClears(cohorts[scope].data.runs) : undefined,
        parse: scoredKillParse(parses?.[scope]),
      }))
    : [{ scope: "server", loading: serverStats.isLoading, summary: serverStatsSummary(serverStats.data), parse: undefined }];
  const lookbackDays = raid.logId ? PULL_LOOKBACK_DAYS : SERVER_STATS_LOOKBACK_DAYS;

  return (
    <div className="space-y-2.5">
      <ScopeBoxPlots
        label={label}
        color={color}
        headerRight={
          raid.clearMs !== undefined ? (
            <span className="font-mono font-semibold tabular-nums">{formatClearDuration(raid.clearMs)}</span>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              {raid.logId ? "No qualified clear" : `Server, last ${lookbackDays} days`}
            </span>
          )
        }
        lanes={lanes}
        marker={raid.clearMs ?? null}
        markerLabel="This clear"
        subject={raid.name}
        unit="clears"
        lookbackDays={lookbackDays}
      />
      <TopSpeedruns instanceName={raid.name} difficultyName={raid.difficultyName} />
    </div>
  );
}

/** The raid's three fastest guilds on the speedrun board. */
function TopSpeedruns({ instanceName, difficultyName }: { instanceName: string; difficultyName?: string }) {
  const board = useQuery<SpeedrunLeaderboardEntry[]>({
    queryKey: ["leaderboard", "speedrun", "top", instanceName, difficultyName],
    queryFn: async () => {
      const params = new URLSearchParams({ instance_name: instanceName, timing: "full" });
      if (difficultyName !== undefined) params.set("difficulty_name", difficultyName);
      const response = await fetch(`/api/v1/rankings/speedrun?${params}`);
      if (!response.ok) throw new Error("Failed to fetch the speedrun board");
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const top = (board.data ?? []).slice(0, 3);
  if (board.isLoading || top.length === 0) return null;
  return (
    <div className="rounded-md bg-white/5 px-2.5 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Fastest clears</div>
      <ol className="space-y-0.5 text-xs">
        {top.map((entry, index) => (
          <li key={entry.instance_id} className="flex items-center gap-2">
            <span aria-hidden="true">{MEDALS[index]}</span>
            <span className="min-w-0 truncate" {...guildAttributes(entry.guild_id, entry.guild_name)}>
              {entry.guild_name || "Unknown guild"}
            </span>
            <Link to={`/instances/${entry.slug || entry.instance_id}`} target="_blank" className="ml-auto font-mono font-semibold tabular-nums hover:underline">
              {formatClearDuration(entry.duration_ms)}
            </Link>
            <span className="w-14 shrink-0 text-right text-[10px] text-muted-foreground">
              {new Date(entry.completion_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
