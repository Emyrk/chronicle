import { useState, type ReactNode } from "react";
import { EncounterFloorContext } from "./encounterFloorContext";
import type { EncounterFloorMemory } from "./encounterFloor";

/** Panel-owned memory survives overview/replay changes and is discarded on unmount. */
export function EncounterFloorProvider({ children }: { children: ReactNode }) {
  const [memory] = useState(() => new Map<string, EncounterFloorMemory>());
  return <EncounterFloorContext.Provider value={memory}>{children}</EncounterFloorContext.Provider>;
}
