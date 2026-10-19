import { describe, expect, it } from "vitest";
import type { GridEditorItem } from "./GridLayoutEditor";
import {
  buildLayoutSections,
  compactLayoutItems,
  groupEditorHeightRows,
  normalizeGroupedLayoutItems,
  placeLayoutItem,
} from "./layoutGroups";

const items: GridEditorItem[] = [
  { id: "top", title: "Top", x: 0, y: 0, w: 12, h: 4 },
  { id: "group-1", title: "Player panels", kind: "group", x: 0, y: 4, w: 12, h: 4 },
  { id: "left", title: "Left", groupId: "group-1", x: 0, y: 0, w: 6, h: 5 },
  { id: "right", title: "Right", groupId: "group-1", x: 6, y: 0, w: 6, h: 5 },
  { id: "middle", title: "Middle", x: 0, y: 8, w: 12, h: 4 },
  { id: "group-2", title: "Timeline", kind: "group", x: 0, y: 12, w: 12, h: 4 },
  { id: "bottom", title: "Bottom", groupId: "group-2", x: 0, y: 0, w: 12, h: 4 },
];

describe("buildLayoutSections", () => {
  it("uses explicit group membership and leaves ungrouped rows outside", () => {
    const sections = buildLayoutSections(items);

    expect(sections.map((section) => ({
      id: section.id,
      groupId: section.group?.id,
      itemIds: section.items.map((item) => item.id),
      itemRows: section.items.map((item) => item.y),
    }))).toEqual([
      { id: "rows:0-4", groupId: undefined, itemIds: ["top"], itemRows: [0] },
      { id: "group:group-1", groupId: "group-1", itemIds: ["left", "right"], itemRows: [0, 0] },
      { id: "rows:8-12", groupId: undefined, itemIds: ["middle"], itemRows: [0] },
      { id: "group:group-2", groupId: "group-2", itemIds: ["bottom"], itemRows: [0] },
    ]);
  });

  it("keeps an empty group so its header still renders", () => {
    const sections = buildLayoutSections([
      { id: "group-1", title: "Empty", kind: "group", x: 0, y: 0, w: 12, h: 1 },
    ]);

    expect(sections).toEqual([{
      id: "group:group-1",
      group: expect.objectContaining({ id: "group-1" }),
      items: [],
    }]);
  });
});

describe("compactLayoutItems", () => {
  it("snaps panels into the first available row in their columns", () => {
    const compacted = compactLayoutItems([
      { id: "strip", title: "Replay", kind: "strip", x: 0, y: 0, w: 12, h: 1 },
      { id: "group", title: "DPS/Healing", kind: "group", x: 0, y: 1, w: 12, h: 5 },
      { id: "status", title: "Status", x: 0, y: 6, w: 6, h: 8 },
      { id: "map", title: "Map", x: 6, y: 10, w: 6, h: 4 },
      { id: "casts", title: "Healer Casts", x: 6, y: 14, w: 6, h: 4 },
    ]);

    expect(Object.fromEntries(compacted.map((item) => [item.id, item.y]))).toEqual({
      strip: 0,
      group: 1,
      status: 6,
      map: 6,
      casts: 10,
    });
  });

  it("preserves requested rows while pushing collisions down", () => {
    const compacted = compactLayoutItems([
      { id: "first", title: "First", x: 0, y: 3, w: 6, h: 4 },
      { id: "second", title: "Second", x: 0, y: 4, w: 6, h: 4 },
    ], true);

    expect(compacted.map((item) => ({ id: item.id, y: item.y }))).toEqual([
      { id: "first", y: 3 },
      { id: "second", y: 7 },
    ]);
  });
});

describe("groupEditorHeightRows", () => {
  it("reserves a header row and grows with the child layout", () => {
    expect(groupEditorHeightRows([])).toBe(4);
    expect(groupEditorHeightRows([
      { id: "panel", title: "Panel", x: 0, y: 3, w: 6, h: 4 },
    ])).toBe(8);
  });
});

describe("normalizeGroupedLayoutItems", () => {
  it("repairs orphaned membership and derives persisted group height", () => {
    const normalized = normalizeGroupedLayoutItems([
      { id: "group", title: "Group", kind: "group", x: 0, y: 0, w: 12, h: 1 },
      { id: "child", title: "Child", groupId: "group", x: 0, y: 3, w: 6, h: 4 },
      { id: "orphan", title: "Orphan", groupId: "missing", x: 0, y: 8, w: 6, h: 4 },
    ]);

    expect(normalized.find((item) => item.id === "group")).toMatchObject({ h: 8, minH: 8, maxH: 8 });
    expect(normalized.find((item) => item.id === "orphan")?.groupId).toBeUndefined();
  });
});

describe("content-derived group height", () => {
  it("discards stale manual height and fits the child layout", () => {
    const [group] = normalizeGroupedLayoutItems([
      { id: "group", title: "Group", kind: "group", x: 0, y: 0, w: 12, h: 12, maxH: 20 },
      { id: "child", title: "Child", groupId: "group", x: 0, y: 0, w: 6, h: 4 },
    ]);

    expect(group).toMatchObject({ h: 5, minH: 5, maxH: 5 });
  });
});

describe("placeLayoutItem", () => {
  it("clamps columns and pushes a transferred item below collisions", () => {
    const item = { id: "moving", title: "Moving", x: 0, y: 0, w: 6, h: 4 };
    const occupied = [{ id: "existing", title: "Existing", x: 6, y: 0, w: 6, h: 4 }];

    expect(placeLayoutItem(item, occupied, { x: 10, y: 0 })).toEqual({ x: 6, y: 4 });
  });
});
