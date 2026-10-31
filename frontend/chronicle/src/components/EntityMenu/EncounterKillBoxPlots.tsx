import { cn } from "@/lib/utils";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import { scoredKillParse, summarizeEncounterKillTimes, type ScopedKillParses } from "@/pages/Instance/Overview/encounterKillTimePopulation";
import { useSpeedrunPopulation } from "@/pages/Instance/Overview/overviewQueries";
import { parseHexColor } from "@/pages/Instance/parseColors";
import type { EntityRef } from "./entity";

type EncounterPin = Extract<EntityRef, { kind: "encounter" }>;
type Scope = "server" | "realm" | "guild";

/** Matches the kill-time parses, so a pull's score and its place in the box describe the same kills. */
export const ENCOUNTER_LOOKBACK_DAYS = 60;

const SCOPE_LABEL: Record<Scope, string> = { server: "Server", realm: "Realm", guild: "Guild" };

/**
 * One boss pull against its server, realm and guild: a box plot of each scope's kill times (the
 * same raid, size and difficulty over the last 60 days, fastest kill per run), with this pull
 * marked and its kill-time parse in that scope.
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
  const cohort = (scope: Scope) => ({ kind: "cohort" as const, scope, anchorInstanceId: encounter.logId, lookbackDays: ENCOUNTER_LOOKBACK_DAYS });
  const server = useSpeedrunPopulation(cohort("server"));
  const realm = useSpeedrunPopulation(cohort("realm"));
  const guild = useSpeedrunPopulation(cohort("guild"));
  const lanes = (
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
  }));
  const killed = encounter.killType === "clean" || encounter.killType === "partial";
  const marker = killed ? encounter.durationMs : null;

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
        <span className="ml-auto shrink-0 font-mono font-semibold tabular-nums">
          {killed ? formatClearDuration(encounter.durationMs) : `${encounter.killType === "wipe" ? "Wipe" : "Reset"} ${formatClearDuration(encounter.durationMs)}`}
        </span>
      </div>
      <div className="space-y-1">
        {lanes.map((lane) => (
          <div key={lane.scope} className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{SCOPE_LABEL[lane.scope]}</span>
            <div className="relative h-4 min-w-0 flex-1" title={lane.summary ? boxTitle(lane.summary) : undefined}>
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
              title={lane.parse ? `Kill-time parse: rank ${lane.parse.rank} of ${lane.parse.sample_size} kills` : "No parse"}
            >
              {lane.parse ? lane.parse.display_score : "—"}
            </span>
          </div>
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

function boxTitle(summary: { min: number; q1: number; median: number; q3: number; max: number; count: number }): string {
  return [
    `Fastest ${formatClearDuration(summary.min)}`,
    `Middle half ${formatClearDuration(summary.q1)}–${formatClearDuration(summary.q3)}`,
    `Median ${formatClearDuration(summary.median)}`,
    `Slowest ${formatClearDuration(summary.max)}`,
    `${summary.count} kills`,
  ].join(" · ");
}
