import type { Encounter } from "../../InstancePage";
import type { TimelinePlayerDeath } from "./timeline.processor";

export interface TimelinePhaseAnnotation {
  id: string;
  name: string;
  startSec: number;
  endSec: number;
}

export interface TimelineDeathAnnotation {
  offsetSec: number;
  deaths: TimelinePlayerDeath[];
}

export function createTimelinePhaseAnnotations(
  encounters: Encounter[],
  selectedEncounterIds: string[],
): TimelinePhaseAnnotation[] {
  const selectedIds = new Set(selectedEncounterIds);
  const selectedEncounters = encounters
    .filter((encounter) => selectedIds.has(encounter.id))
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
  const baseTimestamp = selectedEncounters.length > 0
    ? Date.parse(selectedEncounters[0].start_time)
    : Number.NaN;

  if (!Number.isFinite(baseTimestamp)) return [];

  return selectedEncounters.flatMap((encounter) => {
    const encounterOffsetMs = Date.parse(encounter.start_time) - baseTimestamp;
    if (!Number.isFinite(encounterOffsetMs)) return [];

    return (encounter.phases ?? []).flatMap((phase) => {
      const startSec = (encounterOffsetMs + phase.start_offset_ms) / 1000;
      const endSec = (encounterOffsetMs + phase.end_offset_ms) / 1000;
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec < startSec) return [];
      return [{
        id: phase.id,
        name: phase.name,
        startSec,
        endSec,
      }];
    });
  });
}

export function groupTimelineDeathAnnotations(
  deaths: TimelinePlayerDeath[],
): TimelineDeathAnnotation[] {
  const groups = new Map<number, TimelinePlayerDeath[]>();
  for (const death of deaths) {
    const group = groups.get(death.offsetMs);
    if (group) group.push(death);
    else groups.set(death.offsetMs, [death]);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([offsetMs, groupedDeaths]) => ({
      offsetSec: offsetMs / 1000,
      deaths: groupedDeaths,
    }));
}
