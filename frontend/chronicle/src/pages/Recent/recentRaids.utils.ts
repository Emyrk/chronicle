/**
 * Mapping of parent instance names to their derived sub-instance names.
 * Used to expand picker options and query filters so users can search for
 * and select sub-instances individually, or select the parent to query all.
 */
const DERIVED_INSTANCES: Record<string, string[]> = {
  "Tower of Karazhan": [
    "Lower Tower of Karazhan",
    "Upper Tower of Karazhan",
  ],
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Return raid counts after which a grid ad should be inserted. The hashed IDs
 * produce stable pseudo-random gaps, so loading another page never moves ads
 * that are already visible.
 */
export function getRecentRaidAdInsertions(instanceIDs: string[]): number[] {
  const insertions: number[] = [];
  const nonAligningGaps = [4, 6];
  let raidCount = 0;
  let adIndex = 0;

  while (raidCount < instanceIDs.length) {
    const anchorID = instanceIDs[raidCount] ?? instanceIDs[0];
    // Each gap also contains the previous ad cell. Gaps of 5 or 8 would align
    // consecutive ads in a three-column grid, while 7 would align them in a
    // four-column grid. Randomizing between 4 and 6 avoids both alignments.
    const gap = nonAligningGaps[hashString(`${anchorID}:${adIndex}`) % nonAligningGaps.length];
    raidCount += gap;

    if (raidCount > instanceIDs.length) break;

    insertions.push(raidCount);
    adIndex += 1;
  }

  return insertions;
}

/**
 * Expand a list of instance option names so that derived sub-instances
 * appear alongside their parent. Preserves all unrelated names and
 * de-duplicates output.
 */
export function expandInstanceOptions(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
    const derived = DERIVED_INSTANCES[name];
    if (derived) {
      for (const d of derived) {
        if (!seen.has(d)) {
          seen.add(d);
          result.push(d);
        }
      }
    }
  }

  return result;
}

/**
 * Expand selected instance names for the API query. When the parent is
 * selected, the parent name is kept (for legacy rows) and its derived
 * sub-instance names are appended. De-duplicates when the user selects
 * both the parent and a child directly.
 */
export function expandInstanceQuery(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
    const derived = DERIVED_INSTANCES[name];
    if (derived) {
      for (const d of derived) {
        if (!seen.has(d)) {
          seen.add(d);
          result.push(d);
        }
      }
    }
  }

  return result;
}
