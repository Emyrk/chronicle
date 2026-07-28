/**
 * Metrics panel - displays panel processing diagnostics.
 */

/* eslint-disable react-refresh/only-export-components */
import { useMemo } from "react";
import { Activity } from "lucide-react";
import { usePanelTimingContext } from "../PanelTimingContext";
import type { PanelDefinition } from "../types";
import { metricsProcessor, type MetricsResult } from "./metrics.processor";

function formatMs(value: number): string {
  if (value >= 100) {
    return `${value.toFixed(0)}ms`;
  }
  if (value >= 10) {
    return `${value.toFixed(1)}ms`;
  }
  return `${value.toFixed(2)}ms`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function MetricsContent() {
  const timingContext = usePanelTimingContext();

  const rows = useMemo(
    () => Array.from(timingContext?.panelMetrics.values() ?? []).sort((a, b) => a.panelIndex - b.panelIndex),
    [timingContext?.panelMetrics],
  );

  if (!timingContext) {
    return <div className="text-xs text-muted-foreground">Metrics context unavailable.</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No panel metrics recorded yet. Metrics appear after worker-backed panels finish processing.
      </div>
    );
  }

  const totalEvents = rows.reduce((sum, row) => sum + row.totalEvents, 0);
  const totalStreamBytes = rows.reduce((sum, row) => sum + row.totalStreamBytes, 0);
  const slowestPanel = rows.reduce((max, row) => (row.wallTimeMs > max.wallTimeMs ? row : max), rows[0]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 text-xs">
      <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded border bg-muted/30 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total Events</div>
          <div className="font-mono text-sm text-foreground">{totalEvents.toLocaleString()}</div>
        </div>
        <div className="rounded border bg-muted/30 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Stream Bytes</div>
          <div className="font-mono text-sm text-foreground">{formatBytes(totalStreamBytes)}</div>
        </div>
        <div className="rounded border bg-muted/30 px-2 py-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Slowest Panel</div>
          <div className="font-mono text-sm text-foreground">
            {slowestPanel.panelLabel} ({formatMs(slowestPanel.wallTimeMs)})
          </div>
        </div>
      </div>

      <div className="shrink-0 space-y-1 rounded border bg-muted/20 px-2 py-2 text-[11px]">
        <div className="font-medium text-foreground">How to read these timings</div>
        <div className="text-muted-foreground">
          Worker time already includes Process + Serialize, so those columns overlap.
        </div>
        <div className="font-mono text-[10px] text-muted-foreground">Worker = Process + Serialize</div>
        <div className="font-mono text-[10px] text-muted-foreground">Total = Fetch + Worker round-trip + Deserialize</div>
        <div className="text-muted-foreground">
          Worker round-trip includes queue wait, thread scheduling, and message transfer/clone overhead.
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto rounded border">
        <table className="w-full min-w-[860px] border-collapse">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-1.5">Panel</th>
              <th className="px-2 py-1.5 text-right">Events</th>
              <th className="px-2 py-1.5 text-right">Worker</th>
              <th className="px-2 py-1.5 text-right">Process</th>
              <th className="px-2 py-1.5 text-right">Serialize</th>
              <th className="px-2 py-1.5 text-right">Deserialize</th>
              <th className="px-2 py-1.5 text-right">Queue</th>
              <th className="px-2 py-1.5 text-right">Fetch</th>
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="px-2 py-1.5">Streams</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.panelKey} className="border-b last:border-b-0">
                <td className="px-2 py-1.5 font-medium">{row.panelLabel}</td>
                <td className="px-2 py-1.5 text-right font-mono">{row.totalEvents.toLocaleString()}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatMs(row.processingTimeMs)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatMs(row.streamProcessingTimeMs)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatMs(row.serializationTimeMs)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatMs(row.deserializationTimeMs)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatMs(row.queueWaitMs)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatMs(row.fetchTimeMs)}</td>
                <td className="px-2 py-1.5 text-right">
                  <div className="font-mono text-foreground">{formatMs(row.wallTimeMs)}</div>
                  <div className="font-mono text-[10px] text-muted-foreground/80">
                    {formatMs(Math.max(0, row.wallTimeMs - row.fetchTimeMs - row.deserializationTimeMs - row.processingTimeMs))} xfer/sched
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {row.streams.length > 0 ? row.streams.join(", ") : "none"}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground/80">
                    {formatBytes(row.totalStreamBytes)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createMetricsPanel(): PanelDefinition<MetricsResult, any> {
  return {
    ...metricsProcessor,
    label: "Metrics",
    icon: <Activity className="h-4 w-4" />,
    selfManagesAggregation: true,
    render: () => <MetricsContent />,
  };
}
