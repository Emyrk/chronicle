import type { ReactNode } from "react";
import type { PanelRenderProps } from "./types";
import { formatNumber } from "@/lib/format";

export function GenericPanel<TResult>({
  loading,
  processing,
  error,
  children,
  totalEvents,
  processingTimeMs,
}: PanelRenderProps<TResult> & { children: ReactNode }) {
  if (error) {
    return (
      <div className="h-full min-h-0 text-xs text-destructive flex items-center justify-center">
        Error: {error.message}
      </div>
    );
  }

  // Keep showing prior results while sync mode incrementally processes updates.
  // Only show blocking states if we don't have any processed events yet.
  if (loading && totalEvents === 0) {
    return (
      <div className="h-full min-h-0 text-xs text-muted-foreground flex items-center justify-center">
        Fetching data...
      </div>
    );
  }
  if (processing && totalEvents === 0) {
    return (
      <div className="h-full min-h-0 text-xs text-muted-foreground flex items-center justify-center">
        Processing...
      </div>
    );
  }

  const eventsPerSecond = processingTimeMs ? (totalEvents / (processingTimeMs / 1000)) : 0;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">{children}</div>
      <div
        className="text-2xs mt-1 font-mono text-muted-foreground flex items-center justify-between shrink-0 relative z-10 bg-card"
        data-chromatic="ignore"
        data-panel-performance-footer
      >
        <span>
          {formatNumber(totalEvents)} events
          {eventsPerSecond > 0 && <span className="ml-2">({formatNumber(eventsPerSecond)}/s)</span>}
          {processing && <span className="ml-2 text-blue-500">updating…</span>}
        </span>
        {processingTimeMs !== null && <span className="text-blue-500 mr-2">{processingTimeMs.toFixed(0)}ms</span>}
      </div>
    </div>
  );
}
