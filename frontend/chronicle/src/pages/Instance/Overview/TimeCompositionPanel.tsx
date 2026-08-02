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
  type TimeComposition,
  type TimeCompositionKey,
  type TimeCompositionSummary,
  type TimeCompositionSummaries,
} from "./timeCompositionPopulation";

const COMPONENTS: ReadonlyArray<{
  key: TimeCompositionKey;
  label: string;
  description: string;
  barClass: string;
  mutedBarClass: string;
  textClass: string;
}> = [
  {
    key: "boss",
    label: "Boss",
    description: "Boss encounters, including kills, wipes, and resets.",
    barClass: "bg-rose-500",
    mutedBarClass: "bg-rose-500/40",
    textClass: "text-rose-400",
  },
  {
    key: "trash",
    label: "Trash",
    description: "Combat outside boss encounters.",
    barClass: "bg-blue-500",
    mutedBarClass: "bg-blue-500/40",
    textClass: "text-blue-400",
  },
  {
    key: "idle",
    label: "Idle",
    description: "Gaps between encounters, including recovery, buffs, and breaks.",
    barClass: "bg-stone-500",
    mutedBarClass: "bg-stone-500/35",
    textClass: "text-stone-400",
  },
];

function formatDelta(deltaMs: number): string {
  const sign = deltaMs > 0 ? "+" : deltaMs < 0 ? "-" : "";
  return `${sign}${formatClearDuration(Math.abs(deltaMs))}`;
}

function comparisonComposition(summaries: TimeCompositionSummaries): TimeComposition {
  const boss = summaries.boss.median;
  const trash = summaries.trash.median;
  const idle = summaries.idle.median;
  return { boss, trash, idle, total: boss + trash + idle };
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  );
}

function SegmentTooltip({
  component,
  primaryValue,
  summary,
  comparisonLabel,
  children,
}: {
  component: (typeof COMPONENTS)[number];
  primaryValue?: number | null;
  summary: TimeCompositionSummary;
  comparisonLabel: string;
  children: React.ReactNode;
}) {
  const showPrimaryComparison = primaryValue !== undefined;
  const delta = typeof primaryValue === "number" ? primaryValue - summary.median : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={7}
        hideArrow
        className="w-64 rounded-lg border border-white/10 bg-popover p-3 text-foreground shadow-lg"
      >
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div>
            <p className={cn("text-xs font-semibold", component.textClass)}>{component.label} time</p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{component.description}</p>
          </div>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {summary.count.toLocaleString()} raids
          </span>
        </div>
        <div className="space-y-1 text-xs">
          {showPrimaryComparison && (
            <>
              <StatLine label="Your time" value={primaryValue === null ? "Missing" : formatClearDuration(primaryValue)} />
              {delta !== null && <StatLine label={`${comparisonLabel} delta`} value={formatDelta(delta)} />}
              <div className="my-1 border-t border-white/5" />
            </>
          )}
          <StatLine label="Fastest" value={formatClearDuration(summary.min)} />
          <StatLine label="Top 25%" value={formatClearDuration(summary.q1)} />
          <StatLine label={comparisonLabel} value={formatClearDuration(summary.median)} />
          <StatLine label="Bottom 25%" value={formatClearDuration(summary.q3)} />
          <StatLine label="Slowest" value={formatClearDuration(summary.max)} />
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function StackedBar({
  composition,
  summaries,
  scaleMax,
  comparisonLabel,
  primary,
}: {
  composition: TimeComposition;
  summaries: TimeCompositionSummaries;
  scaleMax: number;
  comparisonLabel: string;
  primary: boolean;
}) {
  return (
    <div className={cn(
      "flex w-full overflow-hidden rounded-md bg-muted/10",
      primary ? "h-12" : "h-8 opacity-80",
    )}>
      {COMPONENTS.map((component) => {
        const value = composition[component.key];
        const width = `${(value / scaleMax) * 100}%`;
        return (
          <SegmentTooltip
            key={component.key}
            component={component}
            primaryValue={primary ? value : undefined}
            summary={summaries[component.key]}
            comparisonLabel={comparisonLabel}
          >
            <div
              className={cn(
                "flex min-w-0 cursor-help items-center justify-center overflow-hidden border-r border-black/50 px-1 last:border-r-0",
                primary ? component.barClass : component.mutedBarClass,
              )}
              style={{ width }}
            >
              <span className={cn(
                "truncate font-mono font-semibold tabular-nums",
                primary ? "text-xs text-black/90" : "text-[10px] text-foreground/65",
              )}>
                {formatClearDuration(value)}
              </span>
            </div>
          </SegmentTooltip>
        );
      })}
    </div>
  );
}

function ComponentCard({
  component,
  primaryValue,
  summary,
  comparisonLabel,
}: {
  component: (typeof COMPONENTS)[number];
  primaryValue: number | null;
  summary: TimeCompositionSummary;
  comparisonLabel: string;
}) {
  const delta = primaryValue === null ? null : primaryValue - summary.median;
  const deltaPercent = delta !== null && summary.median > 0
    ? Math.round((Math.abs(delta) / summary.median) * 100)
    : null;

  return (
    <SegmentTooltip
      component={component}
      primaryValue={primaryValue}
      summary={summary}
      comparisonLabel={comparisonLabel}
    >
      <div className="cursor-help rounded-lg border border-border/70 bg-background/25 p-3.5 transition-colors hover:border-border hover:bg-muted/10">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <span className={cn("size-2.5 rounded-sm", component.barClass)} />
            {component.label}
          </span>
          <span
            className={cn(
              "flex items-baseline gap-1 font-mono font-semibold",
              delta === null && "text-muted-foreground/50",
              delta !== null && delta < 0 && "text-emerald-400",
              delta !== null && delta > 0 && "text-amber-400",
              delta === 0 && "text-muted-foreground",
            )}
            title={delta === null ? undefined : `${formatDelta(delta)} compared with ${comparisonLabel.toLowerCase()}`}
          >
            <span className="text-xs">
              {delta === null || deltaPercent === null
                ? "—"
                : delta === 0
                  ? "Same"
                  : `${deltaPercent}% ${delta < 0 ? "faster" : "slower"}`}
            </span>
            {delta !== null && delta !== 0 && (
              <span className="text-[9px] opacity-70">{formatDelta(delta)}</span>
            )}
          </span>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className={cn(
            "font-mono text-2xl font-bold tracking-tight",
            primaryValue === null ? "text-muted-foreground/50" : "text-foreground",
          )}>
            {primaryValue === null ? "Missing" : formatClearDuration(primaryValue)}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {comparisonLabel.toLowerCase()} <span className="font-mono">{formatClearDuration(summary.median)}</span>
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground/75">{component.description}</p>
      </div>
    </SegmentTooltip>
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
  const comparisonValues = comparisonSummaries ? comparisonComposition(comparisonSummaries) : null;
  const specificRaidComparison = comparison?.kind === "instance";
  const comparisonLabel = specificRaidComparison ? "Other raid" : "Median";
  const loading = primaryQuery.isLoading || comparisonQuery.isLoading;
  const error = primaryQuery.error ?? comparisonQuery.error;
  const scaleMax = Math.max(primaryComposition?.total ?? 0, comparisonValues?.total ?? 0, 1);
  const totalDelta = primaryComposition && comparisonValues
    ? primaryComposition.total - comparisonValues.total
    : null;
  const totalDeltaPercent = totalDelta !== null && comparisonValues.total > 0
    ? Math.round((Math.abs(totalDelta) / comparisonValues.total) * 100)
    : null;

  return (
    <Card className="gap-0 overflow-hidden border-border/80 bg-card/75 py-0 shadow-sm">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold">Raid time breakdown</h2>
          <p className="mt-0.5 text-[11px] leading-none text-muted-foreground">
            Boss, trash, and idle time
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          {COMPONENTS.map((component) => (
            <span key={component.key} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-sm", component.barClass)} />
              {component.label}
            </span>
          ))}
        </div>
      </div>

      {!comparison ? (
        <div className="flex h-36 items-center justify-center px-5 text-sm text-muted-foreground">
          Choose a comparison population to compare raid time.
        </div>
      ) : loading ? (
        <div className="flex h-36 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading raid time
        </div>
      ) : error ? (
        <div className="flex h-36 items-center justify-center px-5 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load raid time"}
        </div>
      ) : !comparisonSummaries || !comparisonValues ? (
        <div className="flex h-36 items-center justify-center px-5 text-center text-sm text-muted-foreground">
          No complete comparison raids with Overview timing data were found.
        </div>
      ) : (
        <TooltipProvider>
          <div className="space-y-5 px-6 py-5">
            <div>
              <div className="mb-2 flex items-end justify-between gap-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-foreground">This raid</span>
                  <span className="text-[10px] text-muted-foreground">encounter span</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-lg font-bold text-foreground">
                    {primaryComposition ? formatClearDuration(primaryComposition.total) : "Missing"}
                  </span>
                  {totalDelta !== null && totalDeltaPercent !== null && (
                    <span
                      className={cn(
                        "flex items-baseline gap-1 rounded-md border px-2 py-1 font-mono",
                        totalDelta < 0 && "border-emerald-400/25 bg-emerald-400/10 text-emerald-400",
                        totalDelta > 0 && "border-rose-400/25 bg-rose-400/10 text-rose-400",
                        totalDelta === 0 && "border-border bg-muted/20 text-muted-foreground",
                      )}
                      title={`${formatDelta(totalDelta)} compared with ${comparisonLabel.toLowerCase()}`}
                    >
                      <strong className="text-xs">
                        {totalDelta === 0
                          ? "Same pace"
                          : `${totalDeltaPercent}% ${totalDelta < 0 ? "faster" : "slower"}`}
                      </strong>
                      {totalDelta !== 0 && (
                        <span className="text-[9px] opacity-75">{formatDelta(totalDelta)}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
              {primaryComposition ? (
                <StackedBar
                  composition={primaryComposition}
                  summaries={comparisonSummaries}
                  scaleMax={scaleMax}
                  comparisonLabel={comparisonLabel}
                  primary
                />
              ) : (
                <div className="flex h-12 items-center rounded-md bg-muted/10 px-3 text-xs text-muted-foreground">
                  Overview timing data is missing for this raid.
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-end justify-between gap-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">{comparisonLabel} composition</span>
                  <span className="text-[10px] text-muted-foreground/70">
                    n={comparisonSummaries.boss.count.toLocaleString()}
                  </span>
                </div>
                <span className="font-mono text-lg font-bold text-foreground">
                  {formatClearDuration(comparisonValues.total)}
                </span>
              </div>
              <StackedBar
                composition={comparisonValues}
                summaries={comparisonSummaries}
                scaleMax={scaleMax}
                comparisonLabel={comparisonLabel}
                primary={false}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {COMPONENTS.map((component) => (
                <ComponentCard
                  key={component.key}
                  component={component}
                  primaryValue={primaryComposition?.[component.key] ?? null}
                  summary={comparisonSummaries[component.key]}
                  comparisonLabel={comparisonLabel}
                />
              ))}
            </div>
          </div>
        </TooltipProvider>
      )}
    </Card>
  );
}
