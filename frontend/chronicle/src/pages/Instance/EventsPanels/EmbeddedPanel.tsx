import type { PanelContext, PanelDefinition, PanelRenderVariant } from "./types";
import { usePanelAggregation } from "./usePanelAggregation";

interface EmbeddedPanelProps<TResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  panel: PanelDefinition<TResult, any>;
  context: PanelContext;
  durationMs: number;
  variant?: PanelRenderVariant;
  /** Off skips the panel's processing entirely (e.g. while its overlay is hidden). */
  enabled?: boolean;
}

/**
 * Renders a panel inside another panel: the same processor and render as its
 * card, without the card. Lets a composite view (the map's raid frames) reuse
 * a panel players can also place on their own, so the two never drift apart.
 */
export function EmbeddedPanel<TResult>({ panel, context, durationMs, variant = "overlay", enabled = true }: EmbeddedPanelProps<TResult>) {
  const capabilities = context.instance.capabilities ?? [];
  const available = (panel.requiredCapabilities ?? []).every((capability) => capabilities.includes(capability));
  const aggregation = usePanelAggregation({ panel, context, enabled: enabled && available });
  if (!enabled || !available) return null;
  return (
    <>
      {panel.render({
        ...aggregation,
        durationMs,
        perSecond: false,
        checkboxChecked: false,
        context,
        variant,
      })}
    </>
  );
}
