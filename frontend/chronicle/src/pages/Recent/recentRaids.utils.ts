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
