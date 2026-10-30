import type { CharacterEncounterStats, CharacterPerformanceRun, RankingEncounterSet } from "@/api/typesGenerated";
import {
  defaultRankingBossNames,
  rankingEncounterSections,
  type RankingEncounterSection,
} from "@/pages/Rankings/rankingsEncounterSelection";
import { resolveRankingEncounterSet } from "@/pages/Rankings/rankingEncounterSets";

export interface PerformanceInstanceVariant {
  key: string;
  instanceName: string;
  difficultyName: string;
  maxPlayers: number;
  encounters: string[];
  lastKilledAt: string;
}

export function buildPerformanceVariants(
  encounters: readonly CharacterEncounterStats[],
): PerformanceInstanceVariant[] {
  const variants = new Map<string, PerformanceInstanceVariant>();

  for (const encounter of encounters) {
    if (encounter.encounter_name === "Trash") continue;
    const key = [encounter.instance_name, encounter.difficulty_name, encounter.max_players].join("\u0000");
    const existing = variants.get(key);
    if (existing) {
      if (!existing.encounters.includes(encounter.encounter_name)) {
        existing.encounters.push(encounter.encounter_name);
      }
      if (encounter.last_killed_at > existing.lastKilledAt) {
        existing.lastKilledAt = encounter.last_killed_at;
      }
      continue;
    }

    variants.set(key, {
      key,
      instanceName: encounter.instance_name,
      difficultyName: encounter.difficulty_name,
      maxPlayers: encounter.max_players,
      encounters: [encounter.encounter_name],
      lastKilledAt: encounter.last_killed_at,
    });
  }

  return [...variants.values()]
    .map((variant) => ({ ...variant, encounters: [...variant.encounters].sort() }))
    .sort((a, b) => b.lastKilledAt.localeCompare(a.lastKilledAt));
}

export function performanceEncounterSections(
  variant: PerformanceInstanceVariant | undefined,
  progressionBosses: Map<string, Set<string>> | undefined,
): RankingEncounterSection[] {
  if (!variant) return [];
  const progressionBossNames = progressionBosses?.get(variant.instanceName)
    ?? new Set(variant.encounters);
  return rankingEncounterSections(variant.encounters, progressionBossNames);
}

export function selectPerformanceEncounterNames(
  variant: PerformanceInstanceVariant | undefined,
  selectedEncounterNames: readonly string[],
  progressionBosses: Map<string, Set<string>> | undefined,
  rankingEncounterSets?: Map<string, readonly RankingEncounterSet[]>,
): string[] {
  if (!variant) return [];
  if (selectedEncounterNames.length > 0) {
    return selectedEncounterNames.filter((name) => variant.encounters.includes(name));
  }

  const defaultSet = resolveRankingEncounterSet(
    rankingEncounterSets?.get(variant.instanceName) ?? [],
    "",
  );
  const defaultBossNames = defaultRankingBossNames(
    variant.encounters,
    defaultSet?.encounters ?? progressionBosses?.get(variant.instanceName),
  );
  return variant.encounters.filter((name) => defaultBossNames.has(name));
}

export function filterPerformanceRuns(
  runs: readonly CharacterPerformanceRun[],
  spec: string | null,
  subSpec: string | null,
  display: "raw" | "parse",
): CharacterPerformanceRun[] {
  return runs.filter((run) => {
    if (display === "parse" && run.average_parse == null) return false;
    if (spec && run.player_spec !== spec) return false;
    if (subSpec && run.player_sub_spec !== subSpec) return false;
    return true;
  });
}

export function formatDeathsAlive(run: Pick<CharacterPerformanceRun, "player_deaths" | "alive_percentage">): string {
  if (run.player_deaths == null || run.alive_percentage == null) return "—";
  return `${run.player_deaths.toLocaleString()} / ${Math.round(run.alive_percentage)}%`;
}

export type PerformanceDateRange = "180d" | "60d" | "30d";

export function filterPerformanceRunsByDate(
  runs: readonly CharacterPerformanceRun[],
  range: PerformanceDateRange,
  now = new Date(),
): CharacterPerformanceRun[] {
  const days = range === "180d" ? 180 : range === "60d" ? 60 : 30;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return runs.filter((run) => new Date(run.started_at).getTime() >= cutoff);
}

export interface PerformanceRunFilter {
  id: string;
  runs: readonly CharacterPerformanceRun[];
  spec: string | null;
  subSpec: string | null;
}

export interface FilteredPerformanceRunSeries {
  id: string;
  rawRuns: CharacterPerformanceRun[];
  runs: CharacterPerformanceRun[];
}

export function filterPerformanceRunSeries(
  filters: readonly PerformanceRunFilter[],
  display: "raw" | "parse",
  range: PerformanceDateRange,
  now = new Date(),
): FilteredPerformanceRunSeries[] {
  return filters.map((filter) => ({
    id: filter.id,
    rawRuns: filterPerformanceRunsByDate(
      filterPerformanceRuns(filter.runs, filter.spec, filter.subSpec, "raw"),
      range,
      now,
    ),
    runs: filterPerformanceRunsByDate(
      filterPerformanceRuns(filter.runs, filter.spec, filter.subSpec, display),
      range,
      now,
    ),
  }));
}

const DUPLICATE_CLASS_SERIES_COLORS = ["#38bdf8", "#f59e0b", "#a78bfa", "#34d399", "#fb7185"];

export function assignPerformanceSeriesColors(classNames: readonly string[]): string[] {
  const classCounts = new Map<string, number>();
  const usedColors = new Set<string>();

  return classNames.map((className, index) => {
    const normalizedClass = className.toLowerCase();
    const occurrence = classCounts.get(normalizedClass) ?? 0;
    classCounts.set(normalizedClass, occurrence + 1);

    if (occurrence === 0) {
      const classColor = `var(--color-class-${normalizedClass})`;
      usedColors.add(classColor);
      return classColor;
    }

    const fallback = DUPLICATE_CLASS_SERIES_COLORS.find((color) => !usedColors.has(color))
      ?? DUPLICATE_CLASS_SERIES_COLORS[index % DUPLICATE_CLASS_SERIES_COLORS.length];
    usedColors.add(fallback);
    return fallback;
  });
}

export type PerformancePointShape = "circle" | "diamond" | "square" | "triangle" | "hexagon";

const PERFORMANCE_POINT_SHAPES: readonly PerformancePointShape[] = [
  "circle",
  "diamond",
  "square",
  "triangle",
  "hexagon",
];

export function assignSpecPointShapes(specs: readonly string[]): Record<string, PerformancePointShape> {
  const counts = new Map<string, number>();
  for (const spec of specs) {
    if (!spec || spec === "Mixed") continue;
    counts.set(spec, (counts.get(spec) ?? 0) + 1);
  }

  return Object.fromEntries(
    [...counts.entries()]
      .sort(([leftSpec, leftCount], [rightSpec, rightCount]) => (
        rightCount - leftCount || leftSpec.localeCompare(rightSpec)
      ))
      .map(([spec], index) => [spec, PERFORMANCE_POINT_SHAPES[index % PERFORMANCE_POINT_SHAPES.length]]),
  );
}

export interface PerformanceWaterlines {
  average: number;
  bestThreeAverage: number;
}

export function calculatePerformanceWaterlines(values: readonly number[]): PerformanceWaterlines | null {
  if (values.length === 0) return null;

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const bestThree = [...values].sort((a, b) => b - a).slice(0, 3);
  const bestThreeAverage = bestThree.reduce((sum, value) => sum + value, 0) / bestThree.length;
  return { average, bestThreeAverage };
}

export interface PerformanceWaterlineMarker {
  kind: "average" | "best-three-average";
  value: number;
}

export function calculatePerformanceWaterlineMarkers(
  visibleSeriesValues: readonly (readonly number[])[],
): PerformanceWaterlineMarker[] {
  if (visibleSeriesValues.length !== 1) return [];

  const values = visibleSeriesValues[0];
  const waterlines = calculatePerformanceWaterlines(values);
  if (!waterlines) return [];

  return [
    { kind: "average", value: waterlines.average },
    ...(values.length > 3
      ? [{ kind: "best-three-average" as const, value: waterlines.bestThreeAverage }]
      : []),
  ];
}

export interface ChartCollisionPoint {
  id: string;
  group: number;
  position: number;
}

export function assignChartCollisionOffsets(
  points: readonly ChartCollisionPoint[],
  collisionDistance = 3.5,
  spacing = 8,
): Record<string, number> {
  const offsets: Record<string, number> = {};
  const grouped = new Map<number, ChartCollisionPoint[]>();

  for (const point of points) {
    const group = grouped.get(point.group) ?? [];
    group.push(point);
    grouped.set(point.group, group);
    offsets[point.id] = 0;
  }

  for (const group of grouped.values()) {
    const sorted = [...group].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    let clusterStart = 0;

    const assignCluster = (end: number) => {
      const cluster = sorted.slice(clusterStart, end);
      if (cluster.length < 2) return;
      const center = (cluster.length - 1) / 2;
      cluster.forEach((point, index) => {
        offsets[point.id] = (index - center) * spacing;
      });
    };

    for (let index = 1; index <= sorted.length; index += 1) {
      if (index === sorted.length || sorted[index].position - sorted[index - 1].position > collisionDistance) {
        assignCluster(index);
        clusterStart = index;
      }
    }
  }

  return offsets;
}

export function performanceValue(
  run: CharacterPerformanceRun,
  metric: "dps" | "hps",
  display: "raw" | "parse",
): number {
  if (display === "parse") return run.average_parse ?? 0;
  return metric === "hps" ? run.hps : run.dps;
}

export function performanceParseColor(score: number): string {
  if (score >= 99) return "#e6cc80";
  if (score >= 95) return "#ff8000";
  if (score >= 75) return "#a335ee";
  if (score >= 50) return "#0070ff";
  if (score >= 25) return "#1eff00";
  return "#9d9d9d";
}

export const PERFORMANCE_RECENT_RUN_COUNT = 5;

/** A run must sit at least this far beyond the middle half to be an outlier, in parse points. */
const MIN_OUTLIER_PARSE_GAP = 10;
/** The same minimum gap in Raw mode, as a fraction of the typical run. */
const MIN_OUTLIER_RAW_GAP = 0.1;

export interface PerformanceTrendLine {
  /** Change per day. */
  slope: number;
  /** Value at the Unix epoch, in days. */
  intercept: number;
}

export interface PerformanceSummary {
  runCount: number;
  best: number;
  typical: number;
  /** Median of the latest runs; null until there are more runs than the recent window. */
  recent: number | null;
  /** 10th percentile run. */
  floor: number;
  /** Interquartile range. */
  spread: number;
  lowerQuartile: number;
  upperQuartile: number;
  /** Lowest and highest runs that are not outliers. */
  lowWhisker: number;
  highWhisker: number;
  /**
   * Runs beyond 1.5x spread from the middle half, and at least a minimum gap
   * from it, so tightly grouped players don't get ordinary runs flagged. Ascending.
   */
  outliers: number[];
  /** Theil–Sen trend through the runs; null below 3 runs. */
  trend: PerformanceTrendLine | null;
  /**
   * The spread (interquartile range) once there are enough runs to judge it;
   * null below 3 runs. A fast improver reads as inconsistent by design.
   */
  consistency: number | null;
  averageDeaths: number | null;
  averageAlive: number | null;
}

export function summarizePerformanceRuns(
  runs: readonly CharacterPerformanceRun[],
  metric: "dps" | "hps",
  display: "raw" | "parse",
): PerformanceSummary | null {
  if (runs.length === 0) return null;

  const values = runs.map((run) => performanceValue(run, metric, display)).sort((a, b) => a - b);
  const recentValues = [...runs]
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
    .slice(0, PERFORMANCE_RECENT_RUN_COUNT)
    .map((run) => performanceValue(run, metric, display))
    .sort((a, b) => a - b);
  const deaths = runs.flatMap((run) => run.player_deaths == null ? [] : [run.player_deaths]);
  const alive = runs.flatMap((run) => run.alive_percentage == null ? [] : [run.alive_percentage]);
  const typical = quantile(values, 0.5);
  const lowerQuartile = quantile(values, 0.25);
  const upperQuartile = quantile(values, 0.75);
  const spread = upperQuartile - lowerQuartile;
  const minimumGap = display === "parse" ? MIN_OUTLIER_PARSE_GAP : Math.abs(typical) * MIN_OUTLIER_RAW_GAP;
  const fenceGap = Math.max(spread * 1.5, minimumGap);
  const lowFence = lowerQuartile - fenceGap;
  const highFence = upperQuartile + fenceGap;
  const inside = values.filter((value) => value >= lowFence && value <= highFence);
  const fit = runs.length >= 3
    ? fitTrend(runs.map((run) => ({
      day: Date.parse(run.started_at) / DAY_MS,
      value: performanceValue(run, metric, display),
    })))
    : null;

  return {
    runCount: runs.length,
    best: values[values.length - 1],
    typical,
    recent: runs.length > PERFORMANCE_RECENT_RUN_COUNT ? quantile(recentValues, 0.5) : null,
    floor: quantile(values, 0.1),
    spread,
    lowerQuartile,
    upperQuartile,
    lowWhisker: inside[0],
    highWhisker: inside[inside.length - 1],
    outliers: values.filter((value) => value < lowFence || value > highFence),
    trend: fit,
    consistency: runs.length >= 3 ? spread : null,
    averageDeaths: deaths.length > 0 ? mean(deaths) : null,
    averageAlive: alive.length > 0 ? mean(alive) : null,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The trend line's value at a timestamp in milliseconds. */
export function performanceTrendValue(trend: PerformanceTrendLine, timestamp: number): number {
  return trend.intercept + trend.slope * (timestamp / DAY_MS);
}

/** Theil–Sen trend line (median of pairwise slopes), which a few outlier nights barely move. */
export function fitTrend(points: readonly { day: number; value: number }[]): PerformanceTrendLine {
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const run = points[j].day - points[i].day;
      if (run !== 0) slopes.push((points[j].value - points[i].value) / run);
    }
  }
  const slope = slopes.length > 0 ? quantile(slopes.sort((a, b) => a - b), 0.5) : 0;
  const intercept = quantile(points.map((point) => point.value - slope * point.day).sort((a, b) => a - b), 0.5);
  return { slope, intercept };
}

/** Linear-interpolated quantile of an ascending, non-empty list. */
export function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Consistency label from the spread: parse points in Parse mode, percent of the typical run in Raw mode. */
export function consistencyLabel(spread: number, typical: number, display: "raw" | "parse"): "High" | "Med" | "Low" {
  const scaled = display === "parse" ? spread : (spread / Math.max(typical, 1)) * 100;
  if (scaled <= 4) return "High";
  if (scaled <= 8) return "Med";
  return "Low";
}

/** One decimal for parses, whole numbers with separators for DPS/HPS. */
export function formatStat(value: number, display: "raw" | "parse"): string {
  return display === "parse" ? value.toFixed(1) : Math.round(value).toLocaleString();
}
