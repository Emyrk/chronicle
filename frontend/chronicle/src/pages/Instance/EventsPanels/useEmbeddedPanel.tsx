import { useCallback, useMemo, type ReactNode } from "react";
import { useSyncModeContextOptional } from "../SyncModeContext";
import { useTimeRangeContextOptional } from "../TimeRangeContext";
import { getTimeRangeDurationMs } from "./panelDuration";
import { PanelVariantContext } from "./PanelVariantContext";
import type { PanelContext, PanelDefinition, PanelRenderVariant } from "./types";
import { usePanelAggregation } from "./usePanelAggregation";

export interface UseEmbeddedPanelOptions<TResult> {
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

/** Draws the processed panel, optionally with a render-only panel option (e.g. Unit Auras' `u:<guid>`). */
export type EmbeddedPanelRender = (panelOption?: string | null) => ReactNode;

/**
 * Processes a panel once (its processor, fixed and default filters, as its
 * card does) and returns a render function. Calling it with different
 * render-only panel options draws the same result several ways, e.g. one
 * inspect card per unit from a single Unit Auras run.
 */
export function useEmbeddedPanel<TResult>(options: UseEmbeddedPanelOptions<TResult>): EmbeddedPanelRender {
  return useEmbeddedPanelWithResult(options).render;
}

/**
 * useEmbeddedPanel, plus the processed result (null while off), for a host
 * that reads the panel's data as well as drawing it: e.g. the map finding a
 * target's target in the Raid Frames run it already draws.
 */
export function useEmbeddedPanelWithResult<TResult>({
  panel,
  context,
  durationMs,
  variant = "overlay",
  perSecond = false,
  enabled = true,
}: UseEmbeddedPanelOptions<TResult>): { render: EmbeddedPanelRender; result: TResult | null } {
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

  const active = enabled && available;
  const render = useCallback((panelOption?: string | null) => {
    if (!active) return null;
    return (
      <PanelVariantContext.Provider value={variant}>
        {panel.render({
          ...aggregation,
          durationMs: effectiveDurationMs,
          perSecond,
          checkboxChecked: perSecond,
          context,
          panelContext,
          panelOption: panelOption ?? null,
          variant,
        })}
      </PanelVariantContext.Provider>
    );
  }, [active, aggregation, context, effectiveDurationMs, panel, panelContext, perSecond, variant]);
  return { render, result: active ? aggregation.result : null };
}
