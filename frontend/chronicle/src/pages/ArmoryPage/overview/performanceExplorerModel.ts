import type { CharacterEncounterStats, CharacterPerformanceRun } from "@/api/typesGenerated";

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
