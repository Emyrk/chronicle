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
import { useSpeedrunPopulation } from "./overviewQueries";
import type { PopulationSelection } from "./populationSelectionState";
import {
  summarizeTimeCompositions,
  timeComposition,
  type TimeCompositionKey,
  type TimeCompositionSummary,
} from "./timeCompositionPopulation";

const COMPONENTS: ReadonlyArray<{
  key: TimeCompositionKey;
  label: string;
  description: string;
  color: string;
  marker: string;
}> = [
  {
    key: "boss",
    label: "Boss",
    description: "Time spent in boss encounters, including kills, wipes, and resets.",
    color: "text-rose-400",
    marker: "bg-rose-400",
  },
  {
    key: "trash",
    label: "Trash",
    description: "Combat time outside boss encounters.",
    color: "text-sky-400",
    marker: "bg-sky-400",
  },
  {
    key: "idle",
    label: "Idle",
    description: "Time between encounters from the first encounter start to the last encounter end.",
    color: "text-zinc-400",
    marker: "bg-zinc-400",
  },
];

function formatDelta(deltaMs: number): string {
  const sign = deltaMs > 0 ? "+" : deltaMs < 0 ? "-" : "";
  return `${sign}${formatClearDuration(Math.abs(deltaMs))}`;
}

function Distribution({
  summary,
  primaryValue,
  scaleMax,
  markerClass,
}: {
  summary: TimeCompositionSummary;
  primaryValue: number | null;
  scaleMax: number;
  markerClass: string;
}) {
  const position = (value: number) => `${Math.min(100, Math.max(0, (value / scaleMax) * 100))}%`;

  return (
    <div className="relative h-7 min-w-0">
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/60" />
      {summary.count > 1 && (
        <>
          <div
            className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/40"
            style={{ left: position(summary.min), width: `calc(${position(summary.max)} - ${position(summary.min)})` }}
          />
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm border border-muted-foreground/30 bg-muted-foreground/40"
            style={{ left: position(summary.q1), width: `calc(${position(summary.q3)} - ${position(summary.q1)})` }}
          />
        </>
      )}
      <div
        className="absolute bottom-0.5 top-0.5 w-0.5 bg-muted-foreground/75"
        style={{ left: position(summary.median) }}
      />
      {primaryValue !== null && (
        <div
          className={cn(
            "absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-black/70 shadow-[0_0_0_1px_rgba(255,255,255,0.18),0_0_5px_currentColor]",
            markerClass,
          )}
          style={{ left: position(primaryValue) }}
        />
      )}
    </div>
  );
}

function CompositionRowTooltip({
  children,
  content,
}: {
  children: ReactNode;
  content: ReactNode;
}) {
  const [cursor, setCursor] = useState({ x: 0, y: 0 });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="grid cursor-default grid-cols-[4.5rem_minmax(7rem,1fr)_3.75rem_3.75rem_3.75rem] items-center gap-2 border-b border-border/30 px-1 py-2.5 last:border-b-0 hover:bg-muted/20"
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top });
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
        className="w-64 rounded-lg border border-white/10 bg-popover p-3 text-foreground shadow-lg"
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  );
}

export function TimeCompositionPanel({
  primary,
  comparison,
}: {
  primary: PopulationSelection;
  comparison?: PopulationSelection;
}) {
  const primaryQuery = useSpeedrunPopulation(primary);
  const comparisonQuery = useSpeedrunPopulation(comparison);
  const primaryComposition = timeComposition(primaryQuery.data?.runs[0]);
  const comparisonSummaries = summarizeTimeCompositions(comparisonQuery.data?.runs ?? []);
  const specificRaidComparison = comparison?.kind === "instance";
  const comparisonLabel = specificRaidComparison ? "Other" : "Median";
  const coverage = comparisonQuery.data?.overviewCoverage;
  const incompleteCoverage = coverage && coverage.runsWithMetrics < coverage.eligibleRuns;
  const loading = primaryQuery.isLoading || comparisonQuery.isLoading;
  const error = primaryQuery.error ?? comparisonQuery.error;
  const scaleMax = Math.max(
    1,
    ...COMPONENTS.flatMap(({ key }) => [
      primaryComposition?.[key] ?? 0,
      comparisonSummaries?.[key].max ?? 0,
    ]),
  );

  return (
    <Card className="overflow-hidden border-border/80 bg-card/75 shadow-sm">
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">Raid time breakdown</h2>
          <p className="mt-0.5 text-[11px] leading-none text-muted-foreground">
            Boss, trash, and idle time
            {incompleteCoverage && (
              <span
                className="ml-2 text-amber-400/80"
                title={`Overview timing data is available for ${coverage.runsWithMetrics} of ${coverage.eligibleRuns} eligible raids`}
              >
                {coverage.runsWithMetrics}/{coverage.eligibleRuns} with data
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5 text-foreground/90">
            <span className="size-2 rotate-45 border border-white/20 bg-primary" />
            Your time
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-5 rounded-sm bg-muted-foreground/40" />
            {specificRaidComparison ? "Comparison time" : "Comparison spread"}
          </span>
        </div>
      </div>

      {!comparison ? (
        <div className="flex h-28 items-center justify-center px-5 text-sm text-muted-foreground">
          Choose a comparison population to compare raid time.
        </div>
      ) : loading ? (
        <div className="flex h-28 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading raid time
        </div>
      ) : error ? (
        <div className="flex h-28 items-center justify-center px-5 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load raid time"}
        </div>
      ) : !comparisonSummaries ? (
        <div className="flex h-28 items-center justify-center px-5 text-center text-sm text-muted-foreground">
          No complete comparison raids with Overview timing data were found.
        </div>
      ) : (
        <TooltipProvider>
          <div className="px-5 pb-3 pt-1.5">
            <div className="grid grid-cols-[4.5rem_minmax(7rem,1fr)_3.75rem_3.75rem_3.75rem] items-end gap-2 border-b border-border/40 px-1 pb-1.5 text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60">
              <span />
              <div className="flex justify-between font-mono normal-case tracking-normal">
                <span>0</span>
                <span>{formatClearDuration(scaleMax)}</span>
              </div>
              <span className="text-right">Yours</span>
              <span className="text-right">{comparisonLabel}</span>
              <span className="text-right">Delta</span>
            </div>
            {COMPONENTS.map(({ key, label, description, color, marker }) => {
              const summary = comparisonSummaries[key];
              const primaryValue = primaryComposition?.[key] ?? null;
              const delta = primaryValue === null ? null : primaryValue - summary.median;
              return (
                <CompositionRowTooltip
                  key={key}
                  content={(
                    <>
                      <div className="mb-2.5 flex items-start justify-between gap-3">
                        <div>
                          <p className={cn("text-xs font-semibold", color)}>{label} time</p>
                          <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{description}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {summary.count.toLocaleString()} raids
                        </span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <StatLine label="Your time" value={primaryValue === null ? "Missing" : formatClearDuration(primaryValue)} />
                        {delta !== null && <StatLine label={`${comparisonLabel} delta`} value={formatDelta(delta)} />}
                        <div className="my-1 border-t border-white/5" />
                        <StatLine label="Fastest" value={formatClearDuration(summary.min)} />
                        <StatLine label="Top 25%" value={formatClearDuration(summary.q1)} />
                        <StatLine label={specificRaidComparison ? "Other raid" : "Typical"} value={formatClearDuration(summary.median)} />
                        <StatLine label="Bottom 25%" value={formatClearDuration(summary.q3)} />
                        <StatLine label="Slowest" value={formatClearDuration(summary.max)} />
                      </div>
                    </>
                  )}
                >
                  <span className={cn("flex items-center gap-2 text-xs font-medium", color)}>
                    <span className={cn("size-2 rounded-sm", marker)} />
                    {label}
                  </span>
                  <Distribution
                    summary={summary}
                    primaryValue={primaryValue}
                    scaleMax={scaleMax}
                    markerClass={marker}
                  />
                  <span className={cn(
                    "text-right font-mono text-xs font-semibold",
                    primaryValue === null ? "text-muted-foreground/50" : "text-foreground",
                  )}>
                    {primaryValue === null ? "Missing" : formatClearDuration(primaryValue)}
                  </span>
                  <span className="text-right font-mono text-xs text-muted-foreground">
                    {formatClearDuration(summary.median)}
                  </span>
                  <span className={cn(
                    "text-right font-mono text-xs font-semibold",
                    delta === null && "text-muted-foreground/40",
                    delta !== null && delta < 0 && "text-emerald-400",
                    delta !== null && delta > 0 && "text-rose-400",
                    delta === 0 && "text-muted-foreground",
                  )}>
                    {delta === null ? "—" : formatDelta(delta)}
                  </span>
                </CompositionRowTooltip>
              );
            })}
          </div>
        </TooltipProvider>
      )}
    </Card>
  );
}
