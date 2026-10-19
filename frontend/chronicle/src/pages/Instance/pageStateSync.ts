export function samePageState(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export interface ImportedPageState {
  key: number;
  state: unknown;
}

export function updateImportedPageState(
  previous: ImportedPageState,
  state: unknown,
): ImportedPageState {
  return samePageState(previous.state, state)
    ? previous
    : { key: previous.key + 1, state };
}
