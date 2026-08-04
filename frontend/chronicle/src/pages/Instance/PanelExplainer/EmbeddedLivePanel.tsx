/**
 * The live panel inside the explainer: renders the production panel content
 * from a shell-owned aggregation with LOCAL per-second state (never URL).
 */

import { useState } from "react";
import { Switch } from "@/components/ui/Switch/Switch";
import type { EventsPanelType } from "../EventsPanels/EventsPanel";
import { PANELS } from "../EventsPanels/EventsPanel";
import type { UsePanelAggregationResult } from "../EventsPanels/usePanelAggregation";
import type { PanelContext } from "../EventsPanels/types";

export function EmbeddedLivePanel({
  panelType,
  aggregation,
  context,
  durationMs,
}: {
  panelType: EventsPanelType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aggregation: UsePanelAggregationResult<any>;
  context: PanelContext;
  durationMs: number;
}) {
  const panel = PANELS[panelType];
  const [perSecond, setPerSecond] = useState(false);

  if (!panel) return null;

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <span className="font-wow text-[13.5px]">{panel.label}</span>
        <span className="font-mono text-[10px] text-muted-foreground">YOUR DATA</span>
        {panel.supportsPerSecond && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11.5px] text-muted-foreground">Per second</span>
            <Switch checked={perSecond} onCheckedChange={setPerSecond} />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {panel.render({
          result: aggregation.result,
          totalEvents: aggregation.totalEvents,
          processingTimeMs: aggregation.processingTimeMs,
          durationMs,
          perSecond,
          checkboxChecked: perSecond,
          loading: aggregation.loading,
          processing: aggregation.processing,
          error: aggregation.error,
          context,
        })}
      </div>
      <div className="flex flex-shrink-0 items-center border-t border-border px-4 py-1.5">
        <span className="font-mono text-[10.5px] text-muted-foreground">
          {aggregation.totalEvents.toLocaleString()} events
        </span>
        {aggregation.processingTimeMs !== null && (
          <span className="ml-auto font-mono text-[10.5px] text-chart-1">
            {Math.round(aggregation.processingTimeMs)}ms
          </span>
        )}
      </div>
    </div>
  );
}
