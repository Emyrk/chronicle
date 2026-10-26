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
 * Return raid counts after which a grid ad should be inserted. Single-column
 * grids show the first ad after three raids, then use the regular hashed gaps.
 * The stable pseudo-random gaps ensure loading another page never moves ads
 * that are already visible.
 */
export function getRecentRaidAdInsertions(instanceIDs: string[], columnCount: number): number[] {
  const insertions: number[] = [];
  const gaps = [5, 6, 7, 8, 9, 10];
  const eligibleGaps = columnCount <= 1
    ? gaps
    : gaps.filter((gap) => (gap + 1) % columnCount !== 0);
  let raidCount = columnCount <= 1 ? 3 : 0;
  let adIndex = 0;

  if (columnCount <= 1 && raidCount <= instanceIDs.length) {
    insertions.push(raidCount);
    adIndex += 1;
  }

  while (raidCount < instanceIDs.length) {
    const anchorID = instanceIDs[raidCount] ?? instanceIDs[0];
    // The previous ad also occupies a grid cell, so compare gap + 1 against
    // the active column count to keep consecutive ads out of the same column.
    const gap = eligibleGaps[hashString(`${anchorID}:${adIndex}`) % eligibleGaps.length];
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
