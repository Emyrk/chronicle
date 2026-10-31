import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import {
  scoredKillParse,
  summarizeEncounterKillTimes,
  type EncounterKillTimeSummary,
  type ScopedKillParses,
} from "@/pages/Instance/Overview/encounterKillTimePopulation";
import { useRankingsKillTimes } from "@/api/rankingsQueries";
import type { RankingsKillTimeStats } from "@/api/typesGenerated";
import { useSpeedrunPopulation } from "@/pages/Instance/Overview/overviewQueries";
import { parseHexColor } from "@/pages/Instance/parseColors";
import type { EntityRef } from "./entity";

type EncounterPin = Extract<EntityRef, { kind: "encounter" }>;
type Scope = "server" | "realm" | "guild";

/** Matches the kill-time parses, so a pull's score and its place in the box describe the same kills. */
const PULL_LOOKBACK_DAYS = 60;
/** A boss without a pull uses the server's kill-time stats, which come in 7, 30 or 90 days. */
const BOSS_LOOKBACK_DAYS = 90;

const SCOPE_LABEL: Record<Scope, string> = { server: "Server", realm: "Realm", guild: "Guild" };

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
  const cohort = (scope: Scope) =>
    logId ? { kind: "cohort" as const, scope, anchorInstanceId: logId, lookbackDays: PULL_LOOKBACK_DAYS } : undefined;
  const server = useSpeedrunPopulation(cohort("server"));
  const realm = useSpeedrunPopulation(cohort("realm"));
  const guild = useSpeedrunPopulation(cohort("guild"));
  const serverStats = useRankingsKillTimes(encounter.instanceName, `${BOSS_LOOKBACK_DAYS}d`, !logId);
  const lookbackDays = logId ? PULL_LOOKBACK_DAYS : BOSS_LOOKBACK_DAYS;
  const lanes = logId
    ? (
        [
          ["server", server],
          ["realm", realm],
          ["guild", guild],
        ] as const
      ).map(([scope, query]) => ({
        scope,
        loading: query.isLoading,
        summary: query.data ? summarizeEncounterKillTimes(query.data.runs).get(encounter.name) : undefined,
        parse: scoredKillParse(parses?.[scope]),
      }))
    : [{ scope: "server" as const, loading: serverStats.isLoading, summary: bossSummary(serverStats.data, encounter.name), parse: undefined }];
  const killed = encounter.killType === "clean" || encounter.killType === "partial";
  const marker = killed && encounter.durationMs !== undefined ? encounter.durationMs : null;

  // One axis for all three scopes so they line up; whiskers set the ends.
  const ends = lanes.flatMap((lane) => (lane.summary ? [lane.summary.min, lane.summary.max] : []));
  if (marker !== null) ends.push(marker);
  const low = ends.length > 0 ? Math.min(...ends) : 0;
  const high = ends.length > 0 ? Math.max(...ends) : 1;
  const pad = (high - low) * 0.04 || 1000;
  const position = (ms: number) => `${((ms - (low - pad)) / (high - low + pad * 2)) * 100}%`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1.5 text-xs">
        <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        <span className="truncate font-medium">{label}</span>
        {encounter.durationMs !== undefined ? (
          <span className="ml-auto shrink-0 font-mono font-semibold tabular-nums">
            {killed ? formatClearDuration(encounter.durationMs) : `${encounter.killType === "wipe" ? "Wipe" : "Reset"} ${formatClearDuration(encounter.durationMs)}`}
          </span>
        ) : (
          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">Server, last {lookbackDays} days</span>
        )}
      </div>
      <div className="space-y-1">
        {lanes.map((lane) => (
          <Tooltip key={lane.scope}>
            <TooltipTrigger asChild>
              <div className="flex cursor-default items-center gap-2 rounded-sm hover:bg-white/5" data-kill-lane={lane.scope}>
                <span className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{SCOPE_LABEL[lane.scope]}</span>
                <div className="relative h-4 min-w-0 flex-1" data-kill-box={lane.summary ? "" : undefined}>
                  {lane.summary ? (
                    <>
                      <div
                        className="absolute top-1/2 h-px -translate-y-1/2 bg-white/35"
                        style={{ left: position(lane.summary.min), right: `calc(100% - ${position(lane.summary.max)})` }}
                      />
                      <div
                        className="absolute inset-y-0.5 rounded-sm border border-white/40 bg-white/10"
                        style={{ left: position(lane.summary.q1), right: `calc(100% - ${position(lane.summary.q3)})` }}
                      />
                      <div className="absolute inset-y-0.5 w-0.5 -translate-x-1/2 bg-white/80" style={{ left: position(lane.summary.median) }} />
                    </>
                  ) : (
                    <span className="absolute inset-0 flex items-center text-[10px] text-muted-foreground">
                      {lane.loading ? "Loading…" : `No ${SCOPE_LABEL[lane.scope].toLowerCase()} kills`}
                    </span>
                  )}
                  {marker !== null && lane.summary && (
                    <div
                      className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-popover"
                      style={{ left: position(marker), backgroundColor: color }}
                    />
                  )}
                </div>
                <span
                  className={cn("w-7 shrink-0 text-right font-mono text-xs font-bold tabular-nums", !lane.parse && "text-muted-foreground")}
                  style={lane.parse ? { color: parseHexColor(lane.parse.display_score) } : undefined}
                  data-kill-parse={lane.scope}
                >
                  {lane.parse ? lane.parse.display_score : "—"}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="w-60 p-0">
                <LaneTooltip
                  scope={lane.scope}
                  encounterName={encounter.name}
                  summary={lane.summary}
                  loading={lane.loading}
                  pullMs={marker}
                  pullColor={color}
                  parse={lane.parse}
                  lookbackDays={lookbackDays}
                />
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      {ends.length > 0 && (
        <div className="flex justify-between pl-12 pr-9 text-[10px] tabular-nums text-muted-foreground">
          <span>{formatClearDuration(low)}</span>
          <span>{formatClearDuration(high)}</span>
        </div>
      )}
    </div>
  );
}

/** A scope's kill times spelled out, with where the pull lands and its parse. */
function LaneTooltip({
  scope,
  encounterName,
  summary,
  loading,
  pullMs,
  pullColor,
  parse,
  lookbackDays,
}: {
  lookbackDays: number;
  scope: Scope;
  encounterName: string;
  summary: EncounterKillTimeSummary | undefined;
  loading: boolean;
  pullMs: number | null;
  pullColor: string;
  parse: ReturnType<typeof scoredKillParse>;
}) {
  const delta = summary && pullMs !== null ? pullMs - summary.median : null;
  const stats: [string, string][] = summary
    ? [
        ["Fastest", formatClearDuration(summary.min)],
        ["Middle half", `${formatClearDuration(summary.q1)} – ${formatClearDuration(summary.q3)}`],
        ["Median", formatClearDuration(summary.median)],
        ["Slowest", formatClearDuration(summary.max)],
      ]
    : [];
  return (
    <div className="text-xs">
      <div className="flex items-baseline justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="font-semibold">
          {SCOPE_LABEL[scope]} · {encounterName}
        </span>
        {summary && (
          <span className="shrink-0 text-[10px] text-zinc-400">
            {summary.count} kills · {lookbackDays}d
          </span>
        )}
      </div>
      {summary ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 py-2">
          {stats.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-zinc-400">{label}</dt>
              <dd className="text-right font-mono tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="px-3 py-2 text-zinc-400">
          {loading ? "Loading…" : `No ${SCOPE_LABEL[scope].toLowerCase()} kills of ${encounterName} in the last ${lookbackDays} days.`}
        </p>
      )}
      {pullMs !== null && (
        <div className="space-y-1 border-t border-white/10 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pullColor }} aria-hidden="true" />
            <span className="text-zinc-400">This pull</span>
            <span className="ml-auto font-mono font-semibold tabular-nums">{formatClearDuration(pullMs)}</span>
          </div>
          {delta !== null && (
            <div className={cn("text-right", delta <= 0 ? "text-emerald-400" : "text-rose-400")}>
              {delta === 0 ? "Right on the median" : `${formatClearDuration(Math.abs(delta))} ${delta < 0 ? "faster" : "slower"} than the median`}
            </div>
          )}
          {parse && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-zinc-400">Parse</span>
              <span className="font-mono font-bold tabular-nums" style={{ color: parseHexColor(parse.display_score) }}>
                {parse.display_score}
              </span>
              <span className="ml-auto text-[10px] text-zinc-400">
                rank {parse.rank} of {parse.sample_size}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The server's kill-time stats for one boss (seconds) as a box plot summary (milliseconds). */
function bossSummary(stats: readonly RankingsKillTimeStats[] | undefined, encounterName: string): EncounterKillTimeSummary | undefined {
  const row = stats?.find((item) => item.encounter_name === encounterName);
  if (!row || row.count === 0) return undefined;
  const ms = (secs: number) => Math.round(secs * 1000);
  return { count: row.count, min: ms(row.min_secs), q1: ms(row.q1_secs), median: ms(row.median_secs), q3: ms(row.q3_secs), max: ms(row.max_secs), values: [] };
}
