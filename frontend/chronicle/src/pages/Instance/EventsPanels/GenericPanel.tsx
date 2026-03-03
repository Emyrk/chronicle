import type { CSSProperties, ReactNode } from "react";
import type { PanelRenderProps } from "./types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function GenericPanel<TResult>({
  loading,
  processing,
  error,
  children,
  totalEvents,
  processingTimeMs,
  context,
}: PanelRenderProps<TResult> & { children: ReactNode }) {
  const useContainerHeight = context.renderMode === "layout_lab";

  if (error) {
    return (
      <div className={cn("text-xs text-destructive flex items-center justify-center", useContainerHeight ? "h-full" : "min-h-panel")}>
        Error: {error.message}
      </div>
    );
  }

  // Keep showing prior results while sync mode incrementally processes updates.
  // Only show blocking states if we don't have any processed events yet.
  if (loading && totalEvents === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground flex items-center justify-center", useContainerHeight ? "h-full" : "min-h-panel")}>
        Fetching data...
      </div>
    );
  }
  if (processing && totalEvents === 0) {
    return (
      <div className={cn("text-xs text-muted-foreground flex items-center justify-center", useContainerHeight ? "h-full" : "min-h-panel")}>
        Processing...
      </div>
    );
  }

  const eventsPerSecond = processingTimeMs ? (totalEvents / (processingTimeMs / 1000)) : 0;
  const contentStyle = useContainerHeight
    ? ({
        "--max-height-panel": "calc(100% - 1.5rem)",
        "--min-height-panel": "0px",
      } as CSSProperties)
    : undefined;

  return (
    <div className={cn(useContainerHeight && "h-full min-h-0 flex flex-col")}>
      <div className={cn(useContainerHeight && "flex-1 min-h-0 overflow-hidden")} style={contentStyle}>
        {children}
      </div>
      <div
        className="text-2xs mt-1 font-mono text-muted-foreground flex items-center justify-between shrink-0 relative z-10 bg-card"
        data-chromatic="ignore"
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
