import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useRankingsClearTimes } from "@/api/rankingsQueries";
import type { SpeedrunLeaderboardEntry, TimeParseScore } from "@/api/typesGenerated";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import { scoredKillParse } from "@/pages/Instance/Overview/encounterKillTimePopulation";
import type { EntityRef } from "./entity";
import { guildAttributes } from "./leaderboardEntities";
import { PULL_LOOKBACK_DAYS, SERVER_STATS_LOOKBACK_DAYS, serverStatsSummary, summarizeClears, useScopeCohorts } from "./scopeCohorts";
import { ScopeBoxPlots, type BoxMarker, type Scope, type ScopeLane } from "./ScopeBoxPlots";

type RaidPin = Extract<EntityRef, { kind: "raid" }>;

const MEDALS = ["🥇", "🥈", "🥉"];

/** One pinned raid in a group, with its tray color and its log's clear-time parses. */
export interface RaidGroupMember {
  raid: RaidPin;
  color: string;
  parses: Partial<Record<Scope, TimeParseScore>> | null | undefined;
}

/**
 * One raid (and difficulty) against its server, realm and guild: box plots of qualified full-clear
 * times with every pinned clear of it marked and its clear-time parse, then the speedrun board's
 * top three once. A raid name with no clear (on a leaderboard) has no log to define a realm or
 * guild, so a group without any log shows the server's clears.
 */
export function RaidClearBoxPlots({ members }: { members: RaidGroupMember[] }) {
  const [first] = members;
  // Clears of the same raid share the cohort; the first one from a log defines the realm and guild.
  const anchor = members.find((member) => member.raid.logId)?.raid;
  const cohorts = useScopeCohorts(anchor?.logId);
  const serverStats = useRankingsClearTimes(first.raid.name, `${SERVER_STATS_LOOKBACK_DAYS}d`, !anchor);
  const lanes: ScopeLane[] = anchor
    ? (["server", "realm", "guild"] as const).map((scope) => ({
        scope,
        loading: cohorts[scope].isLoading,
        summary: cohorts[scope].data ? summarizeClears(cohorts[scope].data.runs) : undefined,
      }))
    : [{ scope: "server", loading: serverStats.isLoading, summary: serverStatsSummary(serverStats.data) }];
  const lookbackDays = anchor ? PULL_LOOKBACK_DAYS : SERVER_STATS_LOOKBACK_DAYS;
  const markers: BoxMarker[] = members.flatMap(({ raid, color, parses }) =>
    raid.clearMs === undefined
      ? []
      : [
          {
            key: raid.id,
            value: raid.clearMs,
            color,
            label: clearLabel(raid),
            parses: { server: scoredKillParse(parses?.server), realm: scoredKillParse(parses?.realm), guild: scoredKillParse(parses?.guild) },
          },
        ],
  );
  const title = [first.raid.name, first.raid.difficultyName].filter(Boolean).join(" · ");
  const single = members.length === 1;

  return (
    <div className="space-y-2.5">
      <ScopeBoxPlots
        label={single ? [title, first.raid.guildName ? `<${first.raid.guildName}>` : ""].filter(Boolean).join(" · ") : title}
        color={single ? first.color : "var(--color-violet-400)"}
        headerRight={
          single && first.raid.clearMs !== undefined ? (
            <span className="font-mono font-semibold tabular-nums">{formatClearDuration(first.raid.clearMs)}</span>
          ) : single ? (
            <span className="text-[10px] text-muted-foreground">
              {first.raid.logId ? "No qualified clear" : `Server, last ${lookbackDays} days`}
            </span>
          ) : (
            <span className="text-[10px] text-muted-foreground">{markers.length} clears</span>
          )
        }
        legend={
          single ? undefined : (
            <ul className="space-y-0.5 text-[11px]">
              {members.map(({ raid, color }) => (
                <li key={raid.id} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                  <span className="truncate text-muted-foreground">{clearLabel(raid)}</span>
                  <span className="ml-auto shrink-0 font-mono tabular-nums">
                    {raid.clearMs !== undefined ? formatClearDuration(raid.clearMs) : raid.logId ? "no clear" : "server"}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
        lanes={lanes}
        markers={markers}
        subject={first.raid.name}
        unit="clears"
        lookbackDays={lookbackDays}
      />
      <TopSpeedruns instanceName={first.raid.name} difficultyName={first.raid.difficultyName} />
    </div>
  );
}

/** Which clear a dot is: its guild and night, e.g. "<Once Upon> · Oct 28". */
function clearLabel(raid: RaidPin): string {
  const parts = [
    raid.guildName ? `<${raid.guildName}>` : "",
    raid.startTime ? new Date(raid.startTime).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : raid.logId ? "This clear" : "Across the server";
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
