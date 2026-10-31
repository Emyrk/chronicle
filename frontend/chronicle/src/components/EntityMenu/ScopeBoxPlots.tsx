import type { ReactNode } from "react";
import type { TimeParseScore } from "@/api/typesGenerated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import type { EncounterKillTimeSummary } from "@/pages/Instance/Overview/encounterKillTimePopulation";
import { parseHexColor } from "@/pages/Instance/parseColors";

export type Scope = "server" | "realm" | "guild";

const SCOPE_LABEL: Record<Scope, string> = { server: "Server", realm: "Realm", guild: "Guild" };

export interface ScopeLane {
  scope: Scope;
  loading: boolean;
  summary: EncounterKillTimeSummary | undefined;
}

/** One run marked on the box plots, e.g. a pull or a clear, with its time parse in each scope. */
export interface BoxMarker {
  key: string;
  value: number;
  color: string;
  /** What the run is, e.g. "This pull" or "<Once Upon> · Oct 28". */
  label: string;
  parses?: Partial<Record<Scope, TimeParseScore | undefined>>;
}

/**
 * Box plots of times (boss kills or full clears) for the server, realm and guild on one axis, with
 * one or more runs marked and their parses in each scope. Hovering a row spells out its numbers.
 */
export function ScopeBoxPlots({
  label,
  color,
  headerRight,
  legend,
  lanes,
  markers,
  subject,
  unit,
  lookbackDays,
}: {
  label: string;
  color: string;
  headerRight: ReactNode;
  /** Shown under the header, e.g. which dot is which when several runs are marked. */
  legend?: ReactNode;
  lanes: ScopeLane[];
  markers: BoxMarker[];
  /** What is being timed, e.g. the boss or raid name. */
  subject: string;
  /** Plural noun for the sample, e.g. "kills" or "clears". */
  unit: string;
  lookbackDays: number;
}) {
  // One axis for all three scopes so they line up; whiskers set the ends.
  const ends = lanes.flatMap((lane) => (lane.summary ? [lane.summary.min, lane.summary.max] : []));
  ends.push(...markers.map((marker) => marker.value));
  const low = ends.length > 0 ? Math.min(...ends) : 0;
  const high = ends.length > 0 ? Math.max(...ends) : 1;
  const pad = (high - low) * 0.04 || 1000;
  const position = (ms: number) => `${((ms - (low - pad)) / (high - low + pad * 2)) * 100}%`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-1.5 text-xs">
        <span className="h-2 w-2 shrink-0 self-center rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        <span className="truncate font-medium">{label}</span>
        <span className="ml-auto shrink-0">{headerRight}</span>
      </div>
      {legend}
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
                      {lane.loading ? "Loading…" : `No ${SCOPE_LABEL[lane.scope].toLowerCase()} ${unit}`}
                    </span>
                  )}
                  {lane.summary &&
                    markers.map((marker) => (
                      <div
                        key={marker.key}
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-popover"
                        style={{ left: position(marker.value), backgroundColor: marker.color }}
                      />
                    ))}
                </div>
                <span
                  className="flex min-w-7 shrink-0 justify-end gap-1.5 font-mono text-xs font-bold tabular-nums"
                  data-kill-parse={lane.scope}
                >
                  {markers.length === 0 || markers.every((marker) => !marker.parses?.[lane.scope]) ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    markers.map((marker) => {
                      const parse = marker.parses?.[lane.scope];
                      return (
                        <span
                          key={marker.key}
                          className={cn(!parse && "text-muted-foreground", markers.length > 1 && "border-b-2")}
                          style={{ color: parse ? parseHexColor(parse.display_score) : undefined, borderColor: markers.length > 1 ? marker.color : undefined }}
                        >
                          {parse ? parse.display_score : "—"}
                        </span>
                      );
                    })
                  )}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6} className="w-64 p-0">
              <LaneTooltip lane={lane} subject={subject} unit={unit} lookbackDays={lookbackDays} markers={markers} />
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

/** A scope's times spelled out, with where each marked run lands and its parse. */
function LaneTooltip({
  lane,
  subject,
  unit,
  lookbackDays,
  markers,
}: {
  lane: ScopeLane;
  subject: string;
  unit: string;
  lookbackDays: number;
  markers: BoxMarker[];
}) {
  const { scope, summary, loading } = lane;
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
          {SCOPE_LABEL[scope]} · {subject}
        </span>
        {summary && (
          <span className="shrink-0 text-[10px] text-zinc-400">
            {summary.count} {unit} · {lookbackDays}d
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
          {loading ? "Loading…" : `No ${SCOPE_LABEL[scope].toLowerCase()} ${unit} of ${subject} in the last ${lookbackDays} days.`}
        </p>
      )}
      {markers.map((marker) => {
        const delta = summary ? marker.value - summary.median : null;
        const parse = marker.parses?.[scope];
        return (
          <div key={marker.key} className="space-y-1 border-t border-white/10 px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: marker.color }} aria-hidden="true" />
              <span className="truncate text-zinc-400">{marker.label}</span>
              <span className="ml-auto font-mono font-semibold tabular-nums">{formatClearDuration(marker.value)}</span>
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
        );
      })}
    </div>
  );
}
