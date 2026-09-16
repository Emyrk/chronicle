import type { UnitSearchOption } from "./UnitSearch";

const GROUP_ORDER: Record<UnitSearchOption["group"], number> = {
  player: 0,
  friendly: 1,
  enemy: 2,
};

function isGuidDisplayName(name: string): boolean {
  return /^0x/i.test(name.trim());
}

export function compareUnitSearchOptions(a: UnitSearchOption, b: UnitSearchOption): number {
  const groupOrder = GROUP_ORDER[a.group] - GROUP_ORDER[b.group];
  if (groupOrder !== 0) return groupOrder;

  const guidOrder = Number(isGuidDisplayName(a.name)) - Number(isGuidDisplayName(b.name));
  if (guidOrder !== 0) return guidOrder;

  return a.name.localeCompare(b.name);
}

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
