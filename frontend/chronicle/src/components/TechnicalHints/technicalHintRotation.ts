import type { TechnicalHint, TechnicalHintsResponse } from "./types";

const TECHNICAL_HINT_ROTATION_KEY = "chronicle-technical-hint-rotation-v1";

interface StoredRotation {
  version: string;
  orderedIds: string[];
  assignments: Record<string, string>;
  cursor: number;
}

function getBrowserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function shuffled(values: string[], random: () => number): string[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function readRotation(storage: Storage | undefined): StoredRotation | undefined {
  if (!storage) return undefined;
  try {
    const value = JSON.parse(storage.getItem(TECHNICAL_HINT_ROTATION_KEY) ?? "null") as Partial<StoredRotation> | null;
    if (
      !value ||
      typeof value.version !== "string" ||
      !Array.isArray(value.orderedIds) ||
      !value.orderedIds.every((id) => typeof id === "string") ||
      !value.assignments ||
      typeof value.assignments !== "object" ||
      typeof value.cursor !== "number" ||
      !Number.isInteger(value.cursor)
    ) {
      return undefined;
    }
    return value as StoredRotation;
  } catch {
    return undefined;
  }
}

function writeRotation(storage: Storage | undefined, rotation: StoredRotation): void {
  if (!storage) return;
  try {
    storage.setItem(TECHNICAL_HINT_ROTATION_KEY, JSON.stringify(rotation));
  } catch {
    // Selection remains stable for the current render even when storage is unavailable.
  }
}

export function selectTechnicalHint(
  response: TechnicalHintsResponse | undefined,
  placement: string,
  storage: Storage | undefined = getBrowserStorage(),
  random: () => number = Math.random,
): TechnicalHint | undefined {
  if (!response || response.payloads.length === 0) return undefined;

  const hintsById = new Map(response.payloads.map((hint) => [hint.id, hint]));
  const eligibleIds = response.payloads.map((hint) => hint.id);
  let rotation = readRotation(storage);

  const hasSameInventory =
    rotation?.version === response.version &&
    rotation.orderedIds.length === eligibleIds.length &&
    rotation.orderedIds.every((id) => hintsById.has(id));

  if (!rotation || !hasSameInventory) {
    rotation = {
      version: response.version,
      orderedIds: shuffled(eligibleIds, random),
      assignments: {},
      cursor: 0,
    };
  }

  const assigned = rotation.assignments[placement];
  if (assigned && hintsById.has(assigned)) {
    return hintsById.get(assigned);
  }

  if (rotation.cursor >= rotation.orderedIds.length) {
    rotation.orderedIds = shuffled(eligibleIds, random);
    rotation.assignments = {};
    rotation.cursor = 0;
  }

  const selectedId = rotation.orderedIds[rotation.cursor];
  rotation.cursor += 1;
  rotation.assignments[placement] = selectedId;
  writeRotation(storage, rotation);
  return hintsById.get(selectedId);
}
