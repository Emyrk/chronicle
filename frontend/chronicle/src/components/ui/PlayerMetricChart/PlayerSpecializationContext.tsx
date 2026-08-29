/* eslint-disable react-refresh/only-export-components -- Provider and hook are intentionally colocated. */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { FastCombatantInfoCursor } from "@/api/protodecode/decode";
import { useInstanceEventsContext } from "@/hooks/instanceEvents";
import { useTalentTrees } from "@/components/ui/TalentTreeViewer/useTalentTrees";
import {
  resolvePlayerSpecialization,
  type PlayerSpecialization,
  type PlayerTalentSnapshot,
} from "./playerSpecialization";

export type PlayerSpecializationDisplay = PlayerSpecialization;

const PlayerSpecializationContext = createContext<ReadonlyMap<string, PlayerSpecializationDisplay>>(
  new Map(),
);

export function PlayerSpecializationProvider({
  datasetId,
  selectedEncounterIds,
  children,
}: {
  datasetId?: string;
  selectedEncounterIds: readonly string[];
  children: React.ReactNode;
}) {
  const instanceEvents = useInstanceEventsContext();
  const { data: talentTrees } = useTalentTrees(datasetId);
  const [snapshots, setSnapshots] = useState<ReadonlyMap<string, PlayerTalentSnapshot>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshots() {
      try {
        const stream = await instanceEvents.fetchStream("combatant_info");
        if (cancelled) return;

        const selectedEncounters = new Set(selectedEncounterIds);
        const nextSnapshots = new Map<string, PlayerTalentSnapshot>();
        const cursor = new FastCombatantInfoCursor(stream.data);

        while (cursor.currentHeader) {
          if (selectedEncounters.has(cursor.currentHeader.encounterID)) {
            while (cursor.hasMoreInEncounter) {
              const event = cursor.next();
              if (!event?.talents) continue;
              nextSnapshots.set(event.guid, {
                heroClass: event.heroClass,
                summary: [...event.talents.summary],
              });
            }
          }
          cursor.nextEncounter();
        }

        if (!cancelled) setSnapshots(nextSnapshots);
      } catch {
        if (!cancelled) setSnapshots(new Map());
      }
    }

    void loadSnapshots();
    return () => {
      cancelled = true;
    };
  }, [instanceEvents, selectedEncounterIds]);

  const specializations = useMemo(() => {
    const resolved = new Map<string, PlayerSpecializationDisplay>();
    if (!talentTrees) return resolved;

    for (const [playerID, snapshot] of snapshots) {
      const specialization = resolvePlayerSpecialization(snapshot, talentTrees.classes);
      if (!specialization) continue;
      resolved.set(playerID, specialization);
    }
    return resolved;
  }, [snapshots, talentTrees]);

  return (
    <PlayerSpecializationContext.Provider value={specializations}>
      {children}
    </PlayerSpecializationContext.Provider>
  );
}

export function usePlayerSpecializations(): ReadonlyMap<string, PlayerSpecializationDisplay> {
  return useContext(PlayerSpecializationContext);
}
