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
  /** The marked run's time parse in this scope. */
  parse: TimeParseScore | undefined;
}

/**
 * Box plots of times (boss kills or full clears) for the server, realm and guild on one axis, with
 * a run marked and its parse in each scope. Hovering a row spells out its numbers.
 */
export function ScopeBoxPlots({
  label,
  color,
  headerRight,
  lanes,
  marker,
  markerLabel,
  subject,
  unit,
  lookbackDays,
}: {
  label: string;
  color: string;
  headerRight: ReactNode;
  lanes: ScopeLane[];
  /** The marked run's time; null for none (a wipe, or a raid or boss with no particular run). */
  marker: number | null;
  /** What the marked run is, e.g. "This pull". */
  markerLabel: string;
  /** What is being timed, e.g. the boss or raid name. */
  subject: string;
  /** Plural noun for the sample, e.g. "kills" or "clears". */
  unit: string;
  lookbackDays: number;
}) {
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
        <span className="ml-auto shrink-0">{headerRight}</span>
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
                      {lane.loading ? "Loading…" : `No ${SCOPE_LABEL[lane.scope].toLowerCase()} ${unit}`}
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
                lane={lane}
                subject={subject}
                unit={unit}
                lookbackDays={lookbackDays}
                marker={marker}
                markerLabel={markerLabel}
                markerColor={color}
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

/** A scope's times spelled out, with where the marked run lands and its parse. */
function LaneTooltip({
  lane,
  subject,
  unit,
  lookbackDays,
  marker,
  markerLabel,
  markerColor,
}: {
  lane: ScopeLane;
  subject: string;
  unit: string;
  lookbackDays: number;
  marker: number | null;
  markerLabel: string;
  markerColor: string;
}) {
  const { scope, summary, loading, parse } = lane;
  const delta = summary && marker !== null ? marker - summary.median : null;
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
      {marker !== null && (
        <div className="space-y-1 border-t border-white/10 px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: markerColor }} aria-hidden="true" />
            <span className="text-zinc-400">{markerLabel}</span>
            <span className="ml-auto font-mono font-semibold tabular-nums">{formatClearDuration(marker)}</span>
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
