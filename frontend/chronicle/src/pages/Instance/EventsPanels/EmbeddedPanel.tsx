import { useEmbeddedPanel, type UseEmbeddedPanelOptions } from "./useEmbeddedPanel";

/**
 * Renders a panel inside another panel: the same processor, default filters
 * and render as its card, without the card. Lets a composite view (the map's
 * raid frames and meters) reuse panels players can also place on their own,
 * so the two never drift apart.
 */
export function EmbeddedPanel<TResult>({ panelOption, ...options }: UseEmbeddedPanelOptions<TResult> & { panelOption?: string | null }) {
  const render = useEmbeddedPanel(options);
  return <>{render(panelOption)}</>;
}
