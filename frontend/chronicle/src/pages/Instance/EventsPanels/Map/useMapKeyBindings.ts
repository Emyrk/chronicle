import { useMemo } from "react";
import { useMapControls } from "@/api/queries";
import { useAuth } from "@/hooks/useAuth";
import { resolveMapKeyBindings, type MapKeyBindings } from "./mapControls";

export interface MapKeyBindingsState {
  bindings: MapKeyBindings;
  /** Signed-in users can change the controls; everyone else gets the defaults. */
  canEdit: boolean;
  loading: boolean;
  error: Error | null;
}

/** The viewer's camera keybinds: their saved controls, or the defaults. */
export function useMapKeyBindings(): MapKeyBindingsState {
  const { isAuthenticated, isLoading } = useAuth();
  const query = useMapControls(isAuthenticated);
  const saved = isAuthenticated ? query.data?.bindings : null;
  const bindings = useMemo(() => resolveMapKeyBindings(saved), [saved]);
  return {
    bindings,
    canEdit: isAuthenticated,
    loading: isLoading || (isAuthenticated && query.isLoading),
    error: query.error,
  };
}
