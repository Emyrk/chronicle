import { createContext, useContext } from "react";
import type { PanelRenderVariant } from "./types";

/**
 * Where the surrounding panel is drawn, for shared building blocks that a
 * panel's render does not pass props to (PlayerMetricChart, GenericPanel):
 * "overlay" (EmbeddedPanel, e.g. a meter over the map) draws them dense.
 */
export const PanelVariantContext = createContext<PanelRenderVariant>("card");

export function usePanelVariant(): PanelRenderVariant {
  return useContext(PanelVariantContext);
}
