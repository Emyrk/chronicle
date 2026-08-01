import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { formatClearDuration } from "@/pages/GuildPage/panels/clearTimeUtils";
import { parseBgColor, parseBorderColor, parseColor } from "../parseColors";
import type { PopulationSelection } from "./populationSelectionState";
import { useSpeedrunPopulation } from "./overviewQueries";
import {
  averageKillTimePercentile,
  buildEncounterKillTimeComparisonRows,
  summarizeEncounterKillTimes,
  type EncounterKillTimeSummary,
} from "./encounterKillTimePopulation";

function formatDelta(deltaMs: number): string {
  const sign = deltaMs > 0 ? "+" : deltaMs < 0 ? "-" : "";
  return `${sign}${formatClearDuration(Math.abs(deltaMs))}`;
}

const AXIS_MIN_PERCENT = -100;
const AXIS_MAX_PERCENT = 100;
const AXIS_TICKS = [-100, -50, 0, 50, 100];

function relativeToMedian(value: number, median: number): number {
  return ((value - median) / median) * 100;
}

function Distribution({
  summary,
  primaryDurationMs,
}: {
  summary: EncounterKillTimeSummary;
  primaryDurationMs: number | null;
}) {
  const positionForRelative = (relative: number) => {
    const clamped = Math.min(AXIS_MAX_PERCENT, Math.max(AXIS_MIN_PERCENT, relative));
    return `${((clamped - AXIS_MIN_PERCENT) / (AXIS_MAX_PERCENT - AXIS_MIN_PERCENT)) * 100}%`;
  };
  const position = (value: number) => positionForRelative(relativeToMedian(value, summary.median));
  const primaryRelative = primaryDurationMs === null
    ? null
    : relativeToMedian(primaryDurationMs, summary.median);
  const primaryBeyondAxis = primaryRelative !== null
    && (primaryRelative < AXIS_MIN_PERCENT || primaryRelative > AXIS_MAX_PERCENT);

  return (
    <div className="relative h-7 w-full min-w-0">
      {AXIS_TICKS.map((tick) => (
        <div
          key={tick}
          className={cn(
            "absolute inset-y-0 w-px bg-border/25",
            tick === 0 && "bg-muted-foreground/35",
          )}
          style={{ left: positionForRelative(tick) }}
        />
      ))}
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/60" />
      {summary.count > 1 ? (
        <>
          <div
            className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/35"
            style={{ left: position(summary.min), width: `calc(${position(summary.max)} - ${position(summary.min)})` }}
          />
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm border border-muted-foreground/30 bg-muted-foreground/45"
            style={{ left: position(summary.q1), width: `calc(${position(summary.q3)} - ${position(summary.q1)})` }}
          />
        </>
      ) : null}
      <div className="absolute top-0.5 bottom-0.5 w-0.5 bg-muted-foreground/70" style={{ left: position(summary.median) }} />
      {primaryRelative === null ? null : primaryBeyondAxis ? (
        <div
          className={cn(
            "absolute top-1/2 -translate-y-1/2 font-mono text-sm font-bold tracking-[-0.2em] text-primary drop-shadow-[0_0_4px_color-mix(in_oklab,var(--primary)_55%,transparent)]",
            primaryRelative < AXIS_MIN_PERCENT ? "left-0" : "right-0",
          )}
        >
          {primaryRelative < AXIS_MIN_PERCENT ? "‹‹‹" : "›››"}
        </div>
      ) : (
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-primary-foreground/70 bg-primary shadow-[0_0_0_2px_rgba(0,0,0,0.85),0_0_5px_color-mix(in_oklab,var(--primary)_55%,transparent)]"
          style={{ left: position(primaryDurationMs as number) }}
        />
      )}
    </div>
  );
}

function parseBadgeClasses(percentile: number | null): string {
  return cn(
    "rounded border px-1 py-0.5 text-center font-mono text-[10px] font-bold",
    percentile === null && "border-zinc-400/30 bg-zinc-400/10 text-zinc-500",
    percentile !== null && parseColor(percentile),
    percentile !== null && parseBgColor(percentile),
    percentile !== null && parseBorderColor(percentile),
  );
}

function EncounterRowTooltip({
  children,
  content,
  missing = false,
}: {
  children: ReactNode;
  content: ReactNode;
  missing?: boolean;
}) {
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "grid cursor-default grid-cols-[2.5rem_minmax(6rem,9rem)_minmax(7rem,1fr)_2.75rem_2.75rem_3rem] items-center gap-2 border-b border-border/30 px-1 py-2 last:border-b-0 hover:bg-muted/20",
            missing && "bg-muted/5 text-muted-foreground hover:bg-muted/15",
          )}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setCursor({
              x: event.clientX - rect.left,
              y: event.clientY - rect.top,
            });
          }}
        >
          {children}
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="start"
        alignOffset={cursor.x + 8}
        sideOffset={10 - cursor.y}
        collisionPadding={8}
        hideArrow
        className="w-60 rounded-lg border border-white/10 bg-popover p-3 text-foreground shadow-lg"
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function TimeStatLine({
  label,
  value,
  description,
  highlight = false,
}: {
  label: string;
  value: string;
  description?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={highlight ? "font-semibold text-foreground" : "text-foreground"}>
        {label}
        {description && <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">{description}</span>}
      </span>
      <span className={cn("shrink-0 font-mono font-medium", highlight && "font-semibold text-white")}>
        {value}
      </span>
    </div>
  );
}

export function EncounterKillTimesPanel({
  primary,
  comparison,
}: {
  primary: PopulationSelection;
  comparison?: PopulationSelection;
}) {
  const primaryQuery = useSpeedrunPopulation(primary);
  const comparisonQuery = useSpeedrunPopulation(comparison);
  const primarySummaries = summarizeEncounterKillTimes(primaryQuery.data?.runs ?? []);
  const comparisonSummaries = summarizeEncounterKillTimes(comparisonQuery.data?.runs ?? []);
  const rows = buildEncounterKillTimeComparisonRows(primarySummaries, comparisonSummaries);
  const averageParse = averageKillTimePercentile(rows.map((row) => row.percentile));
  const killedBossCount = rows.filter((row) => row.primarySummary !== null).length;
  const availableParseCount = rows.filter((row) => row.percentile !== null).length;
  const incompleteAverage = killedBossCount < rows.length;
  const specificRaidComparison = comparison?.kind === "instance";
  const loading = primaryQuery.isLoading || comparisonQuery.isLoading;
  const error = primaryQuery.error ?? comparisonQuery.error;

  return (
    <Card className="overflow-hidden border-border/80 bg-card/75 shadow-sm">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Encounter breakdown</h2>
            <p className="mt-0.5 text-[11px] leading-none text-muted-foreground">
              {specificRaidComparison ? "Kill time vs comparison raid" : "Kill time vs comparison median"}
            </p>
          </div>
          {(averageParse !== null || incompleteAverage) && (
            <span
              className={cn(
                "flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px]",
                averageParse === null && "border-zinc-400/30 bg-zinc-400/10",
                averageParse !== null && parseBgColor(averageParse),
                averageParse !== null && parseBorderColor(averageParse),
              )}
              title={incompleteAverage
                ? `Incomplete average: ${killedBossCount} of ${rows.length} comparable bosses killed. Missing bosses are excluded; ${availableParseCount} encounter parses are available.`
                : `Arithmetic mean of ${availableParseCount} encounter parse scores`}
            >
              <span className={cn("text-muted-foreground", incompleteAverage && "text-amber-400/90")}>
                {incompleteAverage ? "Incomplete Avg" : "Avg Parse"}
              </span>
              <span className={cn(
                "font-mono font-bold",
                averageParse === null ? "text-zinc-500" : parseColor(averageParse),
              )}>
                {averageParse ?? "—"}
              </span>
              {incompleteAverage && (
                <span className="border-l border-current/20 pl-1.5 font-mono text-muted-foreground">
                  {killedBossCount}/{rows.length}
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5 text-foreground/90">
            <span className="size-2 rotate-45 border border-primary-foreground/70 bg-primary shadow-[0_0_4px_color-mix(in_oklab,var(--primary)_55%,transparent)]" />
            Your time
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-sm bg-muted-foreground/45" />
            {specificRaidComparison ? "Comparison time" : "Comparison spread"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-mono font-bold tracking-[-0.2em] text-primary">›››</span>
            Beyond axis
          </span>
        </div>
      </div>

      {!comparison ? (
        <div className="flex h-28 items-center justify-center px-5 text-sm text-muted-foreground">
          Choose a comparison population to compare encounter kill times.
        </div>
      ) : loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading encounter kill times
        </div>
      ) : error ? (
        <div className="flex h-28 items-center justify-center px-5 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load encounter kill times"}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-28 items-center justify-center px-5 text-sm text-muted-foreground">
          No comparable clean boss kills were found.
        </div>
      ) : (
        <TooltipProvider>
          <div className="px-5 pb-3 pt-1.5">
            <div className="grid grid-cols-[2.5rem_minmax(6rem,9rem)_minmax(7rem,1fr)_2.75rem_2.75rem_3rem] items-end gap-2 border-b border-border/40 px-1 pb-1.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
              <span />
              <span />
              <div className="relative h-4 font-mono normal-case tracking-normal">
                {AXIS_TICKS.map((tick) => (
                  <span
                    key={tick}
                    className={cn(
                      "absolute",
                      tick === AXIS_MIN_PERCENT ? "" : tick === AXIS_MAX_PERCENT ? "-translate-x-full" : "-translate-x-1/2",
                    )}
                    style={{ left: `${((tick - AXIS_MIN_PERCENT) / (AXIS_MAX_PERCENT - AXIS_MIN_PERCENT)) * 100}%` }}
                  >
                    {tick > 0 ? `+${tick}%` : `${tick}%`}
                  </span>
                ))}
              </div>
              <span className="text-right">Yours</span>
              <span className="text-right">{specificRaidComparison ? "Other" : "Median"}</span>
              <span className="text-right">Delta</span>
            </div>
            {rows.map(({ encounterName, primarySummary, comparisonSummary, percentile }) => {
              const primaryDurationMs = primarySummary?.median ?? null;
              const missing = primaryDurationMs === null;
              const delta = primaryDurationMs === null
                ? null
                : primaryDurationMs - comparisonSummary.median;
              const deltaPercent = primaryDurationMs === null
                ? null
                : relativeToMedian(primaryDurationMs, comparisonSummary.median);
              const spread = comparisonSummary.q3 - comparisonSummary.q1;
              return (
                <EncounterRowTooltip
                  key={encounterName}
                  missing={missing}
                  content={(
                    <>
                      <div className="mb-2.5 flex items-center justify-between gap-3">
                        <span className="truncate text-xs font-semibold">{encounterName}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {comparisonSummary.count.toLocaleString()} kills
                        </span>
                      </div>
                      {missing ? (
                        <p className="mb-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                          No clean kill was recorded for this raid, so no parse is available.
                        </p>
                      ) : percentile !== null ? (
                        <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className={parseBadgeClasses(percentile)}>{percentile}</span>
                          <span>means faster than or equal to {percentile}% of comparable kills.</span>
                        </p>
                      ) : (
                        <p className="mb-2 text-[11px] text-muted-foreground">
                          Parse unavailable: fewer than 5 comparable kills.
                        </p>
                      )}
                      <div className="space-y-1 text-xs">
                        <TimeStatLine
                          label="Your time"
                          value={primaryDurationMs === null ? "Missing" : formatClearDuration(primaryDurationMs)}
                          highlight={!missing}
                        />
                        {delta !== null && deltaPercent !== null && (
                          <TimeStatLine
                            label={specificRaidComparison ? "Raid delta" : "Median delta"}
                            value={`${formatDelta(delta)} · ${deltaPercent > 0 ? "+" : ""}${Math.round(deltaPercent)}%`}
                          />
                        )}
                        <div className="my-1 border-t border-white/5" />
                        <TimeStatLine label="Fastest" value={formatClearDuration(comparisonSummary.min)} />
                        <TimeStatLine label="Top 25%" value={formatClearDuration(comparisonSummary.q1)} />
                        <TimeStatLine
                          label={specificRaidComparison ? "Other raid" : "Typical"}
                          value={formatClearDuration(comparisonSummary.median)}
                        />
                        <TimeStatLine label="Bottom 25%" value={formatClearDuration(comparisonSummary.q3)} />
                        <TimeStatLine label="Slowest" value={formatClearDuration(comparisonSummary.max)} />
                        <div className="mt-1 border-t border-white/5 pt-1">
                          <TimeStatLine
                            label="Spread"
                            description="IQR (Q3 − Q1)"
                            value={formatClearDuration(spread)}
                          />
                        </div>
                      </div>
                    </>
                  )}
                >
                  <span className={parseBadgeClasses(percentile)}>
                    {percentile === null ? "—" : percentile}
                  </span>
                  <span className={cn(
                    "truncate text-xs font-medium",
                    missing ? "text-muted-foreground" : "text-foreground",
                  )}>
                    {encounterName}
                  </span>
                  <Distribution
                    summary={comparisonSummary}
                    primaryDurationMs={primaryDurationMs}
                  />
                  <span className={cn(
                    "text-right font-mono text-xs font-semibold",
                    missing ? "text-muted-foreground/60" : "text-white",
                  )}>
                    {primaryDurationMs === null ? "Missing" : formatClearDuration(primaryDurationMs)}
                  </span>
                  <span className="text-right font-mono text-xs text-muted-foreground">
                    {formatClearDuration(comparisonSummary.median)}
                  </span>
                  <span
                    className={cn(
                      "text-right font-mono text-xs font-semibold",
                      deltaPercent === null && "text-muted-foreground/40",
                      deltaPercent !== null && deltaPercent < 0 && "text-emerald-400",
                      deltaPercent !== null && deltaPercent > 0 && "text-rose-400",
                      deltaPercent === 0 && "text-muted-foreground",
                    )}
                  >
                    {deltaPercent === null
                      ? "—"
                      : `${deltaPercent > 0 ? "+" : ""}${Math.round(deltaPercent)}%`}
                  </span>
                </EncounterRowTooltip>
              );
            })}
          </div>
        </TooltipProvider>
      )}
    </Card>
  );
}
