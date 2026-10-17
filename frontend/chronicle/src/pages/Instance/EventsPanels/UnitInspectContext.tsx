import { createContext, useContext } from "react";

/**
 * Units picked for a closer look, shared by a composite view (the map) with
 * the panels it embeds: clicking a raid frame or a map unit toggles it.
 */
export interface UnitInspectSelection {
  inspected: ReadonlySet<string>;
  toggle: (guid: string) => void;
}

export const UnitInspectContext = createContext<UnitInspectSelection | null>(null);

export function useUnitInspect(): UnitInspectSelection | null {
  return useContext(UnitInspectContext);
}
