import { createContext, useContext } from "react";

/**
 * A seamless layout butts panels and strips together: no gaps, no rounding,
 * no shadows (as guild pages' "Seamless" does), so e.g. the Map preset's
 * replay controller sits flush under the map.
 */
export const SeamlessLayoutContext = createContext(false);

export function useSeamlessLayout(): boolean {
  return useContext(SeamlessLayoutContext);
}
