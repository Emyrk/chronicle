import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, ExternalLink, TrendingUp } from "lucide-react";
import type { ArmoryPlayer, CharacterPerformanceRun } from "@/api/typesGenerated";
import { useCharacterEncounters, useCharacterPerformance } from "@/api/rankingsQueries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { Switch } from "@/components/ui/Switch/Switch";
import { cn } from "@/lib/utils";
import type { ParseMetric } from "./util";
import {
  buildPerformanceVariants,
  calculatePerformanceWaterlines,
  filterPerformanceRuns,
  filterPerformanceRunsByDate,
  performanceValue,
  type PerformanceDateRange,
} from "./performanceExplorerModel";

type DisplayMode = "raw" | "parse";

interface PerformanceExplorerProps {
  player: ArmoryPlayer;
  metric: ParseMetric;
  onMetricChange: (metric: ParseMetric) => void;
}

export function PerformanceExplorer({ player, metric, onMetricChange }: PerformanceExplorerProps) {
  const encountersQuery = useCharacterEncounters(player.id);
  const variants = useMemo(
    () => buildPerformanceVariants(encountersQuery.data?.encounters ?? []),
    [encountersQuery.data],
  );
  const [variantKey, setVariantKey] = useState("");
  const [selectedEncounters, setSelectedEncounters] = useState<string[]>([]);
  const [display, setDisplay] = useState<DisplayMode>("raw");
  const [dateRange, setDateRange] = useState<PerformanceDateRange>("all");
  const [showAverage, setShowAverage] = useState(true);
  const [showBestThreeAverage, setShowBestThreeAverage] = useState(true);
  const [spec, setSpec] = useState<string | null>(null);
  const [subSpec, setSubSpec] = useState<string | null>(null);

  const variant = variants.find((item) => item.key === variantKey) ?? variants[0];
  const effectiveEncounters = selectedEncounters.length > 0
    ? selectedEncounters
    : variant?.encounters ?? [];

  const performanceQuery = useCharacterPerformance({
    playerGuid: player.id,
    instanceName: variant?.instanceName,
    encounterNames: effectiveEncounters,
    difficultyName: variant?.difficultyName,
    maxPlayers: variant?.maxPlayers,
    metric,
  });

  const allRuns = useMemo(
    () => performanceQuery.data?.runs ?? [],
    [performanceQuery.data?.runs],
  );
  const specs = useMemo(
    () => [...new Set(allRuns.map((run) => run.player_spec).filter((value) => value && value !== "Mixed"))].sort(),
    [allRuns],
  );
  const subSpecs = useMemo(
    () => [...new Set(allRuns
      .filter((run) => !spec || run.player_spec === spec)
      .map((run) => run.player_sub_spec)
      .filter((value): value is string => !!value && value !== "Mixed"))].sort(),
    [allRuns, spec],
  );
  const matchingRawRuns = useMemo(
    () => filterPerformanceRunsByDate(filterPerformanceRuns(allRuns, spec, subSpec, "raw"), dateRange),
    [allRuns, dateRange, spec, subSpec],
  );
  const runs = useMemo(
    () => filterPerformanceRunsByDate(filterPerformanceRuns(allRuns, spec, subSpec, display), dateRange),
    [allRuns, dateRange, display, spec, subSpec],
  );

  const selectVariant = (key: string) => {
    setVariantKey(key);
    setSelectedEncounters([]);
    setSpec(null);
    setSubSpec(null);
  };

  const selectEncounter = (encounter: string, additive: boolean) => {
    if (!additive) {
      setSelectedEncounters([encounter]);
      return;
    }

    const current = effectiveEncounters;
    if (current.includes(encounter)) {
      if (current.length > 1) setSelectedEncounters(current.filter((item) => item !== encounter));
      return;
    }
    if (variant) {
      setSelectedEncounters(variant.encounters.filter((item) => current.includes(item) || item === encounter));
    }
  };

  return (
    <Card className="overflow-hidden border-border/80 bg-gradient-to-b from-card to-card/70">
      <CardHeader className="border-b border-border/70">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5 text-sky-400" />
              Performance explorer
            </CardTitle>
            <CardDescription className="mt-1">
              Each point combines the selected bosses from one canonical raid run.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <SegmentedButton active={metric === "dps"} onClick={() => onMetricChange("dps")}>DPS</SegmentedButton>
            <SegmentedButton active={metric === "hps"} onClick={() => onMetricChange("hps")}>HPS</SegmentedButton>
            <div className="mx-1 w-px bg-border" />
            <SegmentedButton active={display === "raw"} onClick={() => setDisplay("raw")}>Raw</SegmentedButton>
            <SegmentedButton active={display === "parse"} onClick={() => setDisplay("parse")}>Parse</SegmentedButton>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {variants.length === 0 ? (
          <EmptyState loading={encountersQuery.isLoading} />
        ) : (
          <>
            <label className="block max-w-sm space-y-1.5 text-xs font-medium text-muted-foreground">
              Instance
              <select
                value={variant?.key ?? ""}
                onChange={(event) => selectVariant(event.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-sky-500/70"
              >
                {variants.map((item) => (
                  <option key={item.key} value={item.key}>
                    {variantLabel(item.instanceName, item.difficultyName, item.maxPlayers)}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col border-t border-border/60 pt-5 lg:flex-row">
              <aside className="shrink-0 border-b border-border/60 pb-5 lg:w-64 lg:border-r lg:border-b-0 lg:pr-5 lg:pb-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Encounters</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-5 px-1.5 text-xs"
                    onClick={() => setSelectedEncounters([])}
                    title="Select all encounters"
                  >
                    All
                  </Button>
                </div>
                <div className="mt-3">
                  <h4 className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Bosses
                  </h4>
                  <div className="space-y-1">
                    {variant?.encounters.map((encounter) => {
                      const selected = effectiveEncounters.includes(encounter);
                      return (
                        <div
                          role="button"
                          tabIndex={0}
                          key={encounter}
                          onClick={(event) => selectEncounter(encounter, event.ctrlKey || event.metaKey)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              selectEncounter(encounter, event.ctrlKey || event.metaKey);
                            }
                          }}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-all duration-150",
                            selected
                              ? "border-l-3 border-l-primary-foreground/70 bg-primary-darker text-primary-foreground shadow-sm"
                              : "hover:translate-x-0.5 hover:bg-accent/50",
                          )}
                          title={`${encounter}. Click to select, Ctrl+Click to toggle`}
                        >
                          <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                          <span className="min-w-0 flex-1 truncate">{encounter}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/50">
                  Click to select one boss. Ctrl+Click or Cmd+Click to compare multiple bosses.
                </p>
              </aside>

              <div className="min-w-0 flex-1 pt-5 lg:pl-6 lg:pt-0">
                {specs.length > 0 && (
                  <div className="space-y-2 pb-4">
                    <div className="text-xs font-medium text-muted-foreground">Spec and subspec</div>
                    <div className="flex flex-wrap gap-1.5">
                      <FilterButton active={!spec} onClick={() => { setSpec(null); setSubSpec(null); }}>All specs</FilterButton>
                      {specs.map((option) => (
                        <FilterButton
                          key={option}
                          active={spec === option}
                          onClick={() => { setSpec(spec === option ? null : option); setSubSpec(null); }}
                        >
                          {option}
                        </FilterButton>
                      ))}
                    </div>
                    {spec && subSpecs.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pl-2">
                        <FilterButton active={!subSpec} onClick={() => setSubSpec(null)}>All {spec}</FilterButton>
                        {subSpecs.map((option) => (
                          <FilterButton key={option} active={subSpec === option} onClick={() => setSubSpec(subSpec === option ? null : option)}>
                            {option}
                          </FilterButton>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-col gap-3 border-t border-border/60 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="mr-1 text-xs font-medium text-muted-foreground">Range</span>
                    <RangeButton active={dateRange === "all"} onClick={() => setDateRange("all")}>All time</RangeButton>
                    <RangeButton active={dateRange === "60d"} onClick={() => setDateRange("60d")}>60d</RangeButton>
                    <RangeButton active={dateRange === "30d"} onClick={() => setDateRange("30d")}>30d</RangeButton>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <WaterlineToggle
                      checked={showAverage}
                      onCheckedChange={setShowAverage}
                      color="rgb(148 163 184)"
                    >
                      Average
                    </WaterlineToggle>
                    <WaterlineToggle
                      checked={showBestThreeAverage}
                      onCheckedChange={setShowBestThreeAverage}
                      color="rgb(251 191 36)"
                    >
                      Best 3 avg
                    </WaterlineToggle>
                  </div>
                </div>

                <PerformanceTrend
                  runs={runs}
                  metric={metric}
                  display={display}
                  dateRange={dateRange}
                  showAverage={showAverage}
                  showBestThreeAverage={showBestThreeAverage}
                  loading={performanceQuery.isLoading}
                  omittedParseCount={display === "parse" ? matchingRawRuns.length - runs.length : 0}
                />

                <PerformanceTable runs={runs} metric={metric} selectedCount={effectiveEncounters.length} />
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PerformanceTrend({
  runs,
  metric,
  display,
  dateRange,
  showAverage,
  showBestThreeAverage,
  loading,
  omittedParseCount,
}: {
  runs: readonly CharacterPerformanceRun[];
  metric: ParseMetric;
  display: DisplayMode;
  dateRange: PerformanceDateRange;
  showAverage: boolean;
  showBestThreeAverage: boolean;
  loading: boolean;
  omittedParseCount: number;
}) {
  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading performance…</div>;
  if (runs.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
        No complete {display === "parse" ? "scored " : ""}runs match these filters.
      </div>
    );
  }

  const values = runs.map((run) => performanceValue(run, metric, display));
  const waterlines = calculatePerformanceWaterlines(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(max - min, max * 0.1, 1);
  const floor = Math.max(0, min - spread * 0.2);
  const ceiling = max + spread * 0.2;
  const x = (index: number) => runs.length === 1 ? 50 : 6 + (index / (runs.length - 1)) * 88;
  const y = (value: number) => 90 - ((value - floor) / (ceiling - floor)) * 76;
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(" ");
  const formatValue = (value: number) => display === "parse" ? value.toFixed(1) : Math.round(value).toLocaleString();

  return (
    <div className="space-y-3 border-t border-border/60 pt-5">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{dateRangeLabel(dateRange)} trend</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-sky-300">
            {formatValue(values[values.length - 1])}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              latest {display === "parse" ? "parse" : metric.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{runs.length} complete {runs.length === 1 ? "run" : "runs"}</div>
          <div>Best {formatValue(max)}</div>
        </div>
      </div>
      <div className="relative h-72 overflow-hidden rounded-lg border border-border/70 bg-black/10">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none h-full w-full" aria-hidden="true">
          {[20, 40, 60, 80].map((line) => (
            <line key={line} x1="4" x2="96" y1={line} y2={line} stroke="currentColor" strokeWidth="0.25" className="text-border" vectorEffect="non-scaling-stroke" />
          ))}
          {showAverage && waterlines && (
            <line
              x1="4"
              x2="96"
              y1={y(waterlines.average)}
              y2={y(waterlines.average)}
              stroke="rgb(148 163 184)"
              strokeWidth="1"
              strokeDasharray="5 5"
              opacity="0.75"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {showBestThreeAverage && waterlines && (
            <line
              x1="4"
              x2="96"
              y1={y(waterlines.bestThreeAverage)}
              y2={y(waterlines.bestThreeAverage)}
              stroke="rgb(251 191 36)"
              strokeWidth="1"
              strokeDasharray="5 5"
              opacity="0.8"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {runs.length > 1 && (
            <polyline points={points} fill="none" stroke="rgb(56 189 248)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {showAverage && waterlines && (
          <WaterlineLabel
            top={y(waterlines.average)}
            color="rgb(148 163 184)"
            label="Average"
            value={formatValue(waterlines.average)}
          />
        )}
        {showBestThreeAverage && waterlines && (
          <WaterlineLabel
            top={y(waterlines.bestThreeAverage)}
            color="rgb(251 191 36)"
            label="Best 3 avg"
            value={formatValue(waterlines.bestThreeAverage)}
          />
        )}
        {runs.map((run, index) => {
          const pointX = x(index);
          const pointY = y(values[index]);
          const value = formatValue(values[index]);
          const valueLabel = display === "parse" ? "Parse" : metric.toUpperCase();
          const tooltipX = pointX < 15 ? "left-0" : pointX > 85 ? "right-0" : "left-1/2 -translate-x-1/2";
          const tooltipY = pointY < 24 ? "top-full mt-2" : "bottom-full mb-2";

          return (
            <div
              key={run.run_id}
              className="group absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pointX}%`, top: `${pointY}%` }}
            >
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={`${new Date(run.started_at).toLocaleDateString()}, ${value} ${valueLabel}`}
              >
                <span
                  className="size-2.5 rounded-full border-2 border-background shadow-[0_0_0_1px_rgba(125,211,252,0.75),0_2px_7px_rgba(0,0,0,0.55)] transition-transform duration-150 group-hover:scale-125 group-focus-within:scale-125"
                  style={{ backgroundColor: display === "parse" ? parseColor(values[index]) : "rgb(96 165 250)" }}
                />
              </button>
              <div
                role="tooltip"
                className={cn(
                  "pointer-events-none absolute hidden min-w-36 rounded-md border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-xl shadow-black/40 backdrop-blur-sm group-hover:block group-focus-within:block",
                  tooltipX,
                  tooltipY,
                )}
              >
                <div className="font-medium text-foreground">{new Date(run.started_at).toLocaleDateString()}</div>
                <div className="mt-1 flex items-baseline justify-between gap-4">
                  <span className="text-muted-foreground">{valueLabel}</span>
                  <span className="font-mono font-semibold tabular-nums text-sky-300">{value}</span>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">
                  {run.player_spec}{run.player_sub_spec && run.player_sub_spec !== run.player_spec ? ` · ${run.player_sub_spec}` : ""}
                </div>
              </div>
            </div>
          );
        })}
        <div className="pointer-events-none absolute inset-x-4 bottom-2 flex justify-between text-[10px] text-muted-foreground">
          <span>{new Date(runs[0].started_at).toLocaleDateString()}</span>
          <span>{new Date(runs[runs.length - 1].started_at).toLocaleDateString()}</span>
        </div>
      </div>
      {display === "parse" && omittedParseCount > 0 && (
        <p className="text-xs text-muted-foreground">
          {omittedParseCount} {omittedParseCount === 1 ? "run is" : "runs are"} omitted because a selected boss lacks a cached parse.
        </p>
      )}
    </div>
  );
}

function PerformanceTable({ runs, metric, selectedCount }: { runs: readonly CharacterPerformanceRun[]; metric: ParseMetric; selectedCount: number }) {
  return (
    <div className="space-y-2 border-t border-border/60 pt-5">
      <div className="text-sm font-semibold">Run summary</div>
      <div className="overflow-x-auto styled-scrollbar">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted-foreground">
            <tr className="border-b border-border">
              <th className="pb-2 pr-4 font-medium">Date</th>
              <th className="pb-2 pr-4 font-medium">Spec</th>
              <th className="pb-2 pr-4 text-right font-medium">Bosses</th>
              <th className="pb-2 pr-4 text-right font-medium">Duration</th>
              <th className="pb-2 pr-4 text-right font-medium">Total</th>
              <th className="pb-2 pr-4 text-right font-medium">{metric.toUpperCase()}</th>
              <th className="pb-2 pr-4 text-right font-medium">Parse</th>
              <th className="pb-2 text-right font-medium">Run</th>
            </tr>
          </thead>
          <tbody>
            {[...runs].reverse().map((run) => (
              <tr key={run.run_id} className="border-b border-border/50 last:border-0">
                <td className="py-3 pr-4 whitespace-nowrap">{new Date(run.started_at).toLocaleDateString()}</td>
                <td className="py-3 pr-4">
                  <div className="font-medium">{run.player_spec || "Unknown"}</div>
                  {run.player_sub_spec && run.player_sub_spec !== run.player_spec && <div className="text-xs text-muted-foreground">{run.player_sub_spec}</div>}
                </td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">{run.encounter_count}/{selectedCount}</td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">{formatDuration(run.duration_secs)}</td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums">{formatCompact(metric === "hps" ? run.healing_done + run.absorbed_done : run.damage_done)}</td>
                <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-sky-300">{Math.round(metric === "hps" ? run.hps : run.dps).toLocaleString()}</td>
                <td className="py-3 pr-4 text-right font-mono tabular-nums" style={{ color: run.average_parse == null ? undefined : parseColor(run.average_parse) }}>
                  {run.average_parse == null ? "—" : Math.round(run.average_parse)}
                </td>
                <td className="py-3 text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/instances/${run.log_hashed_slug}`} aria-label="Open raid run">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {runs.length === 0 && <div className="py-10 text-center text-sm text-muted-foreground">No runs to summarize.</div>}
      </div>
    </div>
  );
}

function RangeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "secondary" : "ghost"}
      className="h-7 px-2.5 text-xs"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function WaterlineToggle({
  checked,
  onCheckedChange,
  color,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  color: string;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} />
      <span className="inline-block h-px w-4 border-t border-dashed" style={{ borderColor: color }} />
      <span>{children}</span>
    </label>
  );
}

function WaterlineLabel({ top, color, label, value }: { top: number; color: string; label: string; value: string }) {
  return (
    <div
      className="pointer-events-none absolute right-[4%] z-[5] -translate-y-1/2 rounded bg-zinc-950/85 px-1.5 py-0.5 font-mono text-[10px] tabular-nums shadow-sm backdrop-blur-sm"
      style={{ top: `${top}%`, color }}
    >
      {label} {value}
    </div>
  );
}

function SegmentedButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <Button type="button" size="sm" variant={active ? "secondary" : "outline"} onClick={onClick}>{children}</Button>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-md border px-2.5 py-1 text-xs transition-colors", active ? "border-sky-400/60 bg-sky-400/15 text-sky-100" : "border-border text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

function EmptyState({ loading }: { loading: boolean }) {
  return <div className="py-16 text-center text-sm text-muted-foreground">{loading ? "Loading encounters…" : "No ranked boss encounters are available for this character."}</div>;
}

function dateRangeLabel(range: PerformanceDateRange) {
  if (range === "60d") return "Last 60 days";
  if (range === "30d") return "Last 30 days";
  return "All-time";
}

function variantLabel(instance: string, difficulty: string, maxPlayers: number) {
  const details = [difficulty, maxPlayers > 0 ? `${maxPlayers}-player` : ""].filter(Boolean).join(" · ");
  return details ? `${instance} · ${details}` : instance;
}

function formatDuration(seconds: number) {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return `${minutes}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatCompact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function parseColor(score: number) {
  if (score >= 99) return "#e6cc80";
  if (score >= 95) return "#ff8000";
  if (score >= 75) return "#a335ee";
  if (score >= 50) return "#0070ff";
  if (score >= 25) return "#1eff00";
  return "#9d9d9d";
}

