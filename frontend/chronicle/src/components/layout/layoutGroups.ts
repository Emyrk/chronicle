import type { GridEditorItem } from "./GridLayoutEditor";

const GROUP_HEADER_ROWS = 1;
const MIN_GROUP_EDITOR_ROWS = 4;

export function groupEditorHeightRows(items: readonly GridEditorItem[]): number {
  const childBottom = items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  return Math.max(MIN_GROUP_EDITOR_ROWS, GROUP_HEADER_ROWS + childBottom);
}

export function placeLayoutItem(
  item: GridEditorItem,
  otherItems: readonly GridEditorItem[],
  desired: { x: number; y: number },
  cols = 12,
): Pick<GridEditorItem, "x" | "y"> {
  const x = Math.max(0, Math.min(cols - item.w, desired.x));
  let y = Math.max(0, desired.y);
  const overlaps = (other: GridEditorItem) =>
    x < other.x + other.w && x + item.w > other.x && y < other.y + other.h && y + item.h > other.y;
  while (otherItems.some(overlaps)) y += 1;
  return { x, y };
}

export function normalizeGroupedLayoutItems(items: readonly GridEditorItem[]): GridEditorItem[] {
  const groupIds = new Set(items.filter((item) => item.kind === "group").map((item) => item.id));
  const normalized = items.map((item) =>
    item.groupId && !groupIds.has(item.groupId) ? { ...item, groupId: undefined } : { ...item },
  );

  return normalized.map((item) => {
    if (item.kind !== "group") return item;
    const h = groupEditorHeightRows(normalized.filter((candidate) => candidate.groupId === item.id));
    return { ...item, h, minH: h, maxH: h };
  });
}

export interface LayoutSection {
  id: string;
  group?: GridEditorItem;
  items: GridEditorItem[];
}

/**
 * Build runtime sections from explicit group membership. Grouped item geometry
 * is already local to its group; ungrouped items retain outer-grid geometry and
 * are split around group shells so collapsed groups close up vertically.
 */
export function buildLayoutSections(items: readonly GridEditorItem[]): LayoutSection[] {
  const groups = items
    .filter((item) => item.kind === "group")
    .sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  const groupIds = new Set(groups.map((group) => group.id));
  const ungrouped = items
    .filter((item) => item.kind !== "group" && (!item.groupId || !groupIds.has(item.groupId)))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  const sections: LayoutSection[] = [];
  let sectionStartY = 0;
  let remaining = ungrouped;

  for (const group of groups) {
    const before = remaining.filter((item) => item.y < group.y);
    if (before.length > 0) {
      sections.push({
        id: `rows:${sectionStartY}-${group.y}`,
        items: before.map((item) => ({ ...item, y: Math.max(0, item.y - sectionStartY) })),
      });
    }
    remaining = remaining.filter((item) => item.y >= group.y);
    sections.push({
      id: `group:${group.id}`,
      group,
      items: items
        .filter((item) => item.groupId === group.id)
        .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)),
    });
    sectionStartY = group.y + group.h;
  }

  if (remaining.length > 0) {
    sections.push({
      id: groups.length > 0 ? `rows:${sectionStartY}-end` : "rows:all",
      items: remaining.map((item) => ({ ...item, y: Math.max(0, item.y - sectionStartY) })),
    });
  }

  return sections;
}
