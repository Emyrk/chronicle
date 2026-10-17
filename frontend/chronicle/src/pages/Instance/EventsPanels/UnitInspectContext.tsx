import { createContext, useContext } from "react";

/**
 * Units picked for a closer look, shared by a composite view (the map) with
 * the panels it embeds: clicking a raid frame or a map unit selects it (the
 * map makes it the target).
 */
export interface UnitInspectSelection {
  /** Highlighted units: the target and every pinned one. */
  inspected: ReadonlySet<string>;
  select: (guid: string) => void;
}

export const UnitInspectContext = createContext<UnitInspectSelection | null>(null);

export function useUnitInspect(): UnitInspectSelection | null {
  return useContext(UnitInspectContext);
}
