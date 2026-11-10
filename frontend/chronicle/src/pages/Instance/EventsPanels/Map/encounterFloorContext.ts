import { createContext } from "react";
import type { EncounterFloorMemory } from "./encounterFloor";
export const EncounterFloorContext = createContext<Map<string, EncounterFloorMemory> | null>(null);
