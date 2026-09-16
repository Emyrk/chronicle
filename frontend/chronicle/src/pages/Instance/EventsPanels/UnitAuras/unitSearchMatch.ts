import type { UnitSearchOption } from "./UnitSearch";

export function scoreUnitSearchMatch(query: string, unit: UnitSearchOption): number | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;

  const name = unit.name.toLowerCase();
  const guid = unit.guid.toLowerCase();
  if (name === needle) return 1000;
  if (name.startsWith(needle)) return 500 - name.length;
  const nameIndex = name.indexOf(needle);
  if (nameIndex >= 0) return 250 - nameIndex;
  if (guid.includes(needle)) return 50;
  return null;
}
