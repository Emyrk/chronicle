export const STATUS_FOCUS_PREFIX = "f:";

export function parseStatusFocuses(option: string | null | undefined): Set<string> {
  return new Set(option?.split(",")
    .filter((value) => value.startsWith(STATUS_FOCUS_PREFIX))
    .map((value) => value.slice(STATUS_FOCUS_PREFIX.length)) ?? []);
}

export function updateStatusFocuses(
  option: string | null | undefined,
  unitIds: Iterable<string>,
): string | null {
  const tokens = option?.split(",").filter(
    (value) => value && !value.startsWith(STATUS_FOCUS_PREFIX),
  ) ?? [];
  for (const unitId of unitIds) tokens.push(`${STATUS_FOCUS_PREFIX}${unitId}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}
