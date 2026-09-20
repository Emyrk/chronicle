import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, TrendingUp } from "lucide-react";
import type { ArmoryPlayer, CharacterPerformanceRun } from "@/api/typesGenerated";
import { useCharacterEncounters, useCharacterPerformance } from "@/api/rankingsQueries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { cn } from "@/lib/utils";
import type { ParseMetric } from "./util";
import {
  buildPerformanceVariants,
  filterPerformanceRuns,
  performanceValue,
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
    () => filterPerformanceRuns(allRuns, spec, subSpec, "raw"),
    [allRuns, spec, subSpec],
  );
  const runs = useMemo(
    () => filterPerformanceRuns(allRuns, spec, subSpec, display),
    [allRuns, display, spec, subSpec],
  );

  const selectVariant = (key: string) => {
    setVariantKey(key);
    setSelectedEncounters([]);
    setSpec(null);
    setSubSpec(null);
  };

  const toggleEncounter = (encounter: string) => {
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
            <div className="grid gap-4 lg:grid-cols-[minmax(15rem,0.36fr)_1fr]">
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
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

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Encounters</span>
                  <button
                    type="button"
                    className="text-sky-400 hover:text-sky-300"
                    onClick={() => setSelectedEncounters([])}
                  >
                    Select all
                  </button>
                </div>
                <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto pr-1 styled-scrollbar">
                  {variant?.encounters.map((encounter) => (
                    <button
                      type="button"
                      key={encounter}
                      onClick={() => toggleEncounter(encounter)}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                        effectiveEncounters.includes(encounter)
                          ? "border-sky-400/60 bg-sky-400/15 text-sky-100"
                          : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                      )}
                    >
                      {encounter}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {specs.length > 0 && (
              <div className="space-y-2 border-t border-border/60 pt-4">
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

            <PerformanceTrend
              runs={runs}
              metric={metric}
              display={display}
              loading={performanceQuery.isLoading}
              omittedParseCount={display === "parse" ? matchingRawRuns.length - runs.length : 0}
            />

            <PerformanceTable runs={runs} metric={metric} selectedCount={effectiveEncounters.length} />
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
  loading,
  omittedParseCount,
}: {
  runs: readonly CharacterPerformanceRun[];
  metric: ParseMetric;
  display: DisplayMode;
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
          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">All-time trend</div>
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
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={`${display === "parse" ? "Parse" : metric.toUpperCase()} performance trend`}>
          {[20, 40, 60, 80].map((line) => (
            <line key={line} x1="4" x2="96" y1={line} y2={line} stroke="currentColor" strokeWidth="0.25" className="text-border" vectorEffect="non-scaling-stroke" />
          ))}
          {runs.length > 1 && (
            <polyline points={points} fill="none" stroke="rgb(56 189 248)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          )}
          {runs.map((run, index) => (
            <g key={run.run_id}>
              <circle cx={x(index)} cy={y(values[index])} r="1.5" fill={display === "parse" ? parseColor(values[index]) : "rgb(96 165 250)"} vectorEffect="non-scaling-stroke">
                <title>{`${new Date(run.started_at).toLocaleDateString()}: ${formatValue(values[index])}`}</title>
              </circle>
            </g>
          ))}
        </svg>
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

