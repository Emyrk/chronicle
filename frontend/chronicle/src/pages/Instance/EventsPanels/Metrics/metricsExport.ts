import type { PanelMetrics } from "../PanelTimingContext";

export interface MetricsSnapshot {
  instanceId: string;
  selectedEncounterIds: string[];
  selectedPlayerIds: string[];
  selectedEnemyIds: string[];
  panelCount: number;
  doneCount: number;
  allDone: boolean;
  totalTimeMs: number | null;
  panels: readonly PanelMetrics[];
}

export function serializeMetrics(snapshot: MetricsSnapshot, exportedAt = new Date()): string {
  return JSON.stringify({
    schemaVersion: 1,
    exportedAt: exportedAt.toISOString(),
    notes: "Worker-backed panel measurements only. Counts and bytes overlap across panels. Timings are milliseconds; updatedAtMs is relative to the page performance time origin. Selection describes the view at export time, not necessarily every recorded measurement.",
    ...snapshot,
    panels: [...snapshot.panels].sort((a, b) => a.panelIndex - b.panelIndex),
  }, null, 2);
}

export function downloadMetricsJson(snapshot: MetricsSnapshot): void {
  const blob = new Blob([serializeMetrics(snapshot)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `panel-metrics-${snapshot.instanceId.replace(/[^a-zA-Z0-9_-]+/g, "-") || "export"}.json`;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Allow the browser to start consuming the download before releasing it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
