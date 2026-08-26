export function itemPickerLevelOptions(maxLevel: number): number[] {
  if (!Number.isInteger(maxLevel) || maxLevel < 1) return [];
  return Array.from({ length: maxLevel }, (_, index) => maxLevel - index);
}

export function parseItemPickerLevel(
  value: string,
  maxLevel?: number,
): number | undefined {
  if (value === "any" || maxLevel == null) return undefined;
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1) return maxLevel;
  return Math.min(level, maxLevel);
}
