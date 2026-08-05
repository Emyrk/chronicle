import { Loader2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { cn } from "@/lib/utils";
import { buildIncomingDamageComparisonRows } from "./incomingDamagePopulation";
import { useSpeedrunPopulation } from "./overviewQueries";
import type { PopulationSelection } from "./populationSelectionState";

function formatDamage(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 100_000 ? 1 : 0,
  }).format(value);
}

function DamageBar({
  value,
  maxValue,
  className,
}: {
  value: number | null;
  maxValue: number;
  className: string;
}) {
  const width = value === null ? 0 : Math.max((value / maxValue) * 100, 1.5);
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted/20">
      <div className={cn("h-full rounded-full", className)} style={{ width: `${width}%` }} />
    </div>
  );
}

export function DeadliestAbilitiesPanel({
  primary,
  comparison,
}: {
  primary: PopulationSelection;
  comparison?: PopulationSelection;
}) {
  const primaryQuery = useSpeedrunPopulation(primary);
  const comparisonQuery = useSpeedrunPopulation(comparison);
  const rows = buildIncomingDamageComparisonRows(
    primaryQuery.data?.overview,
    comparison ? comparisonQuery.data?.overview : undefined,
  );
  const loading = primaryQuery.isLoading || comparisonQuery.isLoading;
  const error = primaryQuery.error ?? comparisonQuery.error;
  const comparisonLabel = comparison?.kind === "instance" ? "Other raid" : "Comparison avg";
  const maxDamage = Math.max(
    1,
    ...rows.flatMap((row) => [row.primaryDamagePerRun ?? 0, row.comparisonDamagePerRun ?? 0]),
  );
  const comparisonRuns = comparisonQuery.data?.overview.runs ?? 0;

  return (
    <Card className="mt-4 gap-0 overflow-hidden border-border/80 bg-card/75 py-0 shadow-sm">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-rose-400/20 bg-rose-400/10 text-rose-400">
            <ShieldAlert className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Deadliest incoming abilities</h2>
            <p className="mt-0.5 text-[11px] leading-none text-muted-foreground">
              Effective damage to players and their units
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-4 rounded-full bg-rose-500" /> This raid
          </span>
          {comparison && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-sky-500/65" /> {comparisonLabel}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading incoming damage
        </div>
      ) : error ? (
        <div className="flex h-48 items-center justify-center px-5 text-sm text-destructive">
          {error instanceof Error ? error.message : "Unable to load incoming damage"}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-48 items-center justify-center px-5 text-center text-sm text-muted-foreground">
          No incoming ability data is available for this raid or comparison.
        </div>
      ) : (
        <div className="px-6 py-4">
          <div className="mb-2 grid grid-cols-[minmax(8rem,1fr)_minmax(10rem,2fr)] gap-5 px-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/65">
            <span>Ability</span>
            <span>Damage per raid</span>
          </div>
          <div className="divide-y divide-border/30">
            {rows.map((row, index) => (
              <div
                key={row.key}
                className="grid grid-cols-[minmax(8rem,1fr)_minmax(10rem,2fr)] items-center gap-5 px-2 py-2.5 transition-colors hover:bg-muted/10"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-5 shrink-0 text-right font-mono text-[10px] text-muted-foreground/50">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{row.name}</p>
                    <p className="mt-0.5 truncate text-[9px] text-muted-foreground/60">
                      {row.primary
                        ? `${row.primary.hits.toLocaleString()} hits this raid`
                        : row.comparison
                          ? `Ranked in ${row.comparison.runs.toLocaleString()} comparison raids`
                          : ""}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
                    <span className="text-right font-mono text-[11px] font-semibold text-rose-300">
                      {row.primaryDamagePerRun === null ? "—" : formatDamage(row.primaryDamagePerRun)}
                    </span>
                    <DamageBar value={row.primaryDamagePerRun} maxValue={maxDamage} className="bg-rose-500" />
                  </div>
                  {comparison && (
                    <div className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
                      <span className="text-right font-mono text-[10px] text-sky-300/80">
                        {row.comparisonDamagePerRun === null ? "—" : formatDamage(row.comparisonDamagePerRun)}
                      </span>
                      <DamageBar value={row.comparisonDamagePerRun} maxValue={maxDamage} className="bg-sky-500/65" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {comparison && (
            <p className="mt-3 border-t border-border/30 pt-3 text-[10px] leading-relaxed text-muted-foreground/60">
              Comparison averages use {comparisonRuns.toLocaleString()} complete raids. Cohort totals are aggregated server-side from each raid&apos;s ten deadliest abilities.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
