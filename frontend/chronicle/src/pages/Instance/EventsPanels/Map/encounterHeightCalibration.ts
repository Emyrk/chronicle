import atrexis from "./height-calibrations/forever-dalaran-atrexis.json";

export interface EncounterHeightReference {
  id: string;
  meshSHA256: string;
  /** Reviewed world Z in yards, never recorded telemetry. */
  referenceZ: number;
}

export interface EncounterHeightCalibration extends EncounterHeightReference {
  version: number;
  dataset: string;
  datasetId: string;
  mapID: number;
  encounterName: string;
  enemyEntry: number;
  frame: string;
  review: { status: string };
}

export interface EncounterHeightContext {
  datasetId?: string;
  mapId?: number;
  coordinateSpace?: string;
  frame?: string;
  wholeRun: boolean;
  selectedEncounterIds: readonly string[];
  activeEncounter?: { id: string; name: string; mapId: number; enemyEntries: readonly number[] };
}

/** Match the actual active encounter, not the encounter standing in for artwork.
 * datasetId is the canonical UUID verified against /api/v1/datasets; dataset is
 * only the extraction namespace. Missing provenance always keeps ordinary inference.
 */
export function encounterHeightReference(
  context: EncounterHeightContext,
  calibration: EncounterHeightCalibration = atrexis,
): EncounterHeightReference | undefined {
  const active = context.activeEncounter;
  if (calibration.version !== 1 || calibration.review.status !== "operator-reviewed"
    || calibration.dataset !== "forever" || !calibration.datasetId
    || context.datasetId !== calibration.datasetId
    || context.mapId !== calibration.mapID || active?.mapId !== calibration.mapID
    || context.coordinateSpace !== "world"
    || context.frame !== "wow-yup-mirrored-x" || context.frame !== calibration.frame
    || context.wholeRun || context.selectedEncounterIds.length !== 1
    || context.selectedEncounterIds[0] !== active?.id
    || active?.name !== calibration.encounterName
    || !active.enemyEntries.includes(calibration.enemyEntry)
    || !calibration.id || !Number.isFinite(calibration.referenceZ)
    || !/^[a-f0-9]{64}$/.test(calibration.meshSHA256)) return undefined;
  return { id: calibration.id, meshSHA256: calibration.meshSHA256, referenceZ: calibration.referenceZ };
}

/** Authorize against the bytes parsed into this mesh, then convert yards to scene units. */
export function encounterReferenceY(
  reference: EncounterHeightReference | undefined,
  meshSHA256: string | undefined,
  scale: number,
): number | undefined {
  return reference && /^[a-f0-9]{64}$/.test(reference.meshSHA256)
    && meshSHA256 === reference.meshSHA256 && Number.isFinite(reference.referenceZ)
    && Number.isFinite(scale) && scale > 0
    ? reference.referenceZ * scale : undefined;
}

/** Digest failures disable only calibration, never mesh rendering. */
export async function dungeonMeshSHA256(bytes: ArrayBuffer): Promise<string | undefined> {
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return undefined;
  }
}
