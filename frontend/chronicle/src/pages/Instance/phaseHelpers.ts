/**
 * Pure helper functions for encounter phase selection.
 *
 * All functions are framework-agnostic (no React) so they can be
 * unit-tested and used in Web Workers.
 */

import type { Encounter, EncounterPhase } from "./InstancePage";

// ---------------------------------------------------------------------------
// Phase range — a time sub-range within an encounter used for event filtering
// ---------------------------------------------------------------------------

/** A selected phase range attached to its parent encounter. */
export interface SelectedPhaseRange {
  encounterID: string;
  startOffsetMs: number;
  endOffsetMs: number;
}

// ---------------------------------------------------------------------------
// Selection normalisation
// ---------------------------------------------------------------------------

/**
 * Normalise encounter + phase selection so parent and child are never
 * both selected.
 *
 * Rules:
 *  - Selecting a whole encounter clears any child phases for it.
 *  - Selecting a phase removes the parent encounter from the full list
 *    and keeps only the phase.
 *  - Multiple phases from the same or different encounters are OK.
 */
export function normalizeSelection(
  selectedEncounterIds: string[],
  selectedPhaseIds: string[],
  encounters: readonly Encounter[],
): { encounterIds: string[]; phaseIds: string[] } {
  // Build quick lookup: phaseId -> parentEncounterId
  const phaseToEncounter = new Map<string, string>();
  for (const enc of encounters) {
    for (const p of enc.phases ?? []) {
      phaseToEncounter.set(p.id, enc.id);
    }
  }

  const encSet = new Set(selectedEncounterIds);
  const phaseSet = new Set(selectedPhaseIds);

  // Any selected encounter removes its child phases
  for (const pid of phaseSet) {
    const parentId = phaseToEncounter.get(pid);
    if (parentId && encSet.has(parentId)) {
      phaseSet.delete(pid);
    }
  }

  // Any remaining selected phase removes its parent encounter
  for (const pid of phaseSet) {
    const parentId = phaseToEncounter.get(pid);
    if (parentId) encSet.delete(parentId);
  }

  return {
    encounterIds: Array.from(encSet),
    phaseIds: Array.from(phaseSet),
  };
}

// ---------------------------------------------------------------------------
// Deriving effective encounter IDs
// ---------------------------------------------------------------------------

/**
 * Derive the set of encounter IDs whose events should be loaded, i.e.
 * explicitly selected encounters PLUS parent encounters of any selected
 * phases.
 */
export function deriveEffectiveEncounterIds(
  selectedEncounterIds: string[],
  selectedPhaseIds: string[],
  encounters: readonly Encounter[],
): string[] {
  const ids = new Set(selectedEncounterIds);
  const phaseToEncounter = buildPhaseToEncounterMap(encounters);
  for (const pid of selectedPhaseIds) {
    const parentId = phaseToEncounter.get(pid);
    if (parentId) ids.add(parentId);
  }
  return Array.from(ids);
}

// ---------------------------------------------------------------------------
// Phase ranges for filtering
// ---------------------------------------------------------------------------

/**
 * Build an array of `SelectedPhaseRange` from the selected phase IDs.
 * Returns an empty array when no phases are selected (meaning: no
 * phase-level filtering required).
 */
export function buildPhaseRanges(
  selectedPhaseIds: string[],
  encounters: readonly Encounter[],
): SelectedPhaseRange[] {
  if (selectedPhaseIds.length === 0) return [];

  const phaseById = new Map<string, EncounterPhase>();
  for (const enc of encounters) {
    for (const p of enc.phases ?? []) {
      phaseById.set(p.id, p);
    }
  }

  const ranges: SelectedPhaseRange[] = [];
  for (const pid of selectedPhaseIds) {
    const phase = phaseById.get(pid);
    if (!phase) continue;
    ranges.push({
      encounterID: phase.encounter_id,
      startOffsetMs: phase.start_offset_ms,
      endOffsetMs: phase.end_offset_ms,
    });
  }
  return ranges;
}

// ---------------------------------------------------------------------------
// Event filtering
// ---------------------------------------------------------------------------

/**
 * Check whether an event at the given offset within a specific encounter
 * passes the phase range filter.
 *
 * If there are no phase ranges for this encounter the event passes (the
 * whole encounter is selected).  Otherwise the event must fall within at
 * least one selected phase range: [startOffsetMs, endOffsetMs).
 */
export function isEventInSelectedPhases(
  encounterID: string,
  offsetMs: number,
  phaseRanges: readonly SelectedPhaseRange[],
): boolean {
  // Fast path: no phase filtering at all
  if (phaseRanges.length === 0) return true;

  // Collect ranges for this encounter
  let hasRangeForEncounter = false;
  for (const r of phaseRanges) {
    if (r.encounterID !== encounterID) continue;
    hasRangeForEncounter = true;
    if (offsetMs >= r.startOffsetMs && offsetMs < r.endOffsetMs) {
      return true;
    }
  }

  // No phase ranges for this encounter → whole encounter is selected
  if (!hasRangeForEncounter) return true;

  // Ranges exist but event didn't match any → exclude
  return false;
}

// ---------------------------------------------------------------------------
// Duration calculation
// ---------------------------------------------------------------------------

/**
 * Compute total selected duration in ms.
 *
 * - Full encounters contribute their entire duration.
 * - Selected phases contribute their individual durations.
 * - No double-counting: a full encounter and its child phases are never
 *   both selected (enforced by normalizeSelection).
 */
export function computeSelectedDuration(
  selectedEncounterIds: string[],
  selectedPhaseIds: string[],
  encounters: readonly Encounter[],
): number {
  let total = 0;

  const encById = new Map<string, Encounter>();
  const phaseById = new Map<string, EncounterPhase>();
  for (const enc of encounters) {
    encById.set(enc.id, enc);
    for (const p of enc.phases ?? []) {
      phaseById.set(p.id, p);
    }
  }

  // Full encounters
  for (const eid of selectedEncounterIds) {
    const enc = encById.get(eid);
    if (!enc) continue;
    total += new Date(enc.end_time).getTime() - new Date(enc.start_time).getTime();
  }

  // Individual phases
  for (const pid of selectedPhaseIds) {
    const phase = phaseById.get(pid);
    if (!phase) continue;
    total += phase.end_offset_ms - phase.start_offset_ms;
  }

  return total;
}

// ---------------------------------------------------------------------------
// URL encoding / decoding  (deterministic flat phase indices)
// ---------------------------------------------------------------------------

/**
 * Build a flat ordered list of all phases across encounters (encounter
 * order × phase order).  The index in this list is the "flat phase index"
 * used in the URL.
 */
export function buildFlatPhaseList(
  encounters: readonly Encounter[],
): EncounterPhase[] {
  const list: EncounterPhase[] = [];
  for (const enc of encounters) {
    const sorted = [...(enc.phases ?? [])].sort((a, b) => a.order - b.order);
    list.push(...sorted);
  }
  return list;
}

/**
 * Convert selected phase IDs to flat indices for URL encoding.
 */
export function phaseIdsToFlatIndices(
  selectedPhaseIds: string[],
  encounters: readonly Encounter[],
): number[] {
  const flat = buildFlatPhaseList(encounters);
  const idToIndex = new Map<string, number>();
  flat.forEach((p, i) => idToIndex.set(p.id, i));

  return selectedPhaseIds
    .map((id) => idToIndex.get(id))
    .filter((idx): idx is number => idx !== undefined)
    .sort((a, b) => a - b);
}

/**
 * Convert flat indices back to phase IDs.
 */
export function flatIndicesToPhaseIds(
  indices: number[],
  encounters: readonly Encounter[],
): string[] {
  const flat = buildFlatPhaseList(encounters);
  return indices
    .filter((i) => i >= 0 && i < flat.length)
    .map((i) => flat[i].id);
}

// ---------------------------------------------------------------------------
// Sidebar helpers
// ---------------------------------------------------------------------------

/**
 * Determine the partial-selection state of an encounter for sidebar display.
 *
 * - "full": the encounter itself is selected (no phase filtering)
 * - "partial": one or more (but not all) phases are selected
 * - "all-phases": every phase of the encounter is selected
 * - "none": encounter is not selected at all
 */
export function encounterSelectionState(
  encounterId: string,
  selectedEncounterIds: readonly string[],
  selectedPhaseIds: readonly string[],
  encounter: Encounter,
): "full" | "partial" | "all-phases" | "none" {
  if (selectedEncounterIds.includes(encounterId)) return "full";

  const phases = encounter.phases ?? [];
  if (phases.length === 0) return "none";

  const phaseSet = new Set(selectedPhaseIds);
  const selectedCount = phases.filter((p) => phaseSet.has(p.id)).length;
  if (selectedCount === 0) return "none";
  if (selectedCount === phases.length) return "all-phases";
  return "partial";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildPhaseToEncounterMap(
  encounters: readonly Encounter[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const enc of encounters) {
    for (const p of enc.phases ?? []) {
      map.set(p.id, enc.id);
    }
  }
  return map;
}
