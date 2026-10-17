import { useMemo } from "react";
import { useSyncModeContextOptional } from "../SyncModeContext";
import { useTimeRangeContextOptional } from "../TimeRangeContext";
import { getTimeRangeDurationMs } from "./panelDuration";
import { PanelVariantContext } from "./PanelVariantContext";
import type { PanelContext, PanelDefinition, PanelRenderVariant } from "./types";
import { usePanelAggregation } from "./usePanelAggregation";

interface EmbeddedPanelProps<TResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  panel: PanelDefinition<TResult, any>;
  context: PanelContext;
  durationMs: number;
  variant?: PanelRenderVariant;
  /** Per-second values (the card's "Per second" switch). */
  perSecond?: boolean;
  /** Off skips the panel's processing entirely (e.g. while its overlay is hidden). */
  enabled?: boolean;
}

/**
 * Renders a panel inside another panel: the same processor, default filters
 * and render as its card, without the card. Lets a composite view (the map's
 * raid frames and meters) reuse panels players can also place on their own,
 * so the two never drift apart.
 */
export function EmbeddedPanel<TResult>({
  panel,
  context,
  durationMs,
  variant = "overlay",
  perSecond = false,
  enabled = true,
}: EmbeddedPanelProps<TResult>) {
  const sync = useSyncModeContextOptional();
  const timeRange = useTimeRangeContextOptional();
  const capabilities = context.instance.capabilities ?? [];
  const available = (panel.requiredCapabilities ?? []).every((capability) => capabilities.includes(capability));
  const defaultFilters = panel.defaultFilters;
  const panelContext = useMemo(
    () => (defaultFilters && defaultFilters.length > 0 ? { filters: defaultFilters } : null),
    [defaultFilters],
  );
  const aggregation = usePanelAggregation({ panel, context, panelContext, enabled: enabled && available });

  // As EventsPanel does: the time range's length, else elapsed replay time for
  // cursor-following panels, else the whole duration.
  const filters = useMemo(() => [...(panel.fixedFilters ?? []), ...(defaultFilters ?? [])], [defaultFilters, panel.fixedFilters]);
  const rangeMs = getTimeRangeDurationMs(filters, timeRange, durationMs);
  const effectiveDurationMs = rangeMs
    ?? (sync?.enabled && panel.syncDataMode !== "full" && sync.currentTimestamp && sync.encounterBounds
      ? Math.max(sync.currentTimestamp.getTime() - sync.encounterBounds.start.getTime(), 1)
      : durationMs);

  if (!enabled || !available) return null;
  return (
    <PanelVariantContext.Provider value={variant}>
      {panel.render({
        ...aggregation,
        durationMs: effectiveDurationMs,
        perSecond,
        checkboxChecked: perSecond,
        context,
        panelContext,
        variant,
      })}
    </PanelVariantContext.Provider>
  );
}
