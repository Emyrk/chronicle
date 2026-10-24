import { describe, expect, it } from "vitest";
import type { EventsPanelType } from "@/pages/Instance/EventsPanels";
import type { PanelFilter } from "@/pages/Instance/EventsPanels/processors/filters";
import {
  MAX_LAYOUT_PANELS,
  addGroup,
  addPanel,
  addStrip,
  layoutDraftFromExport,
  layoutDraftToExport,
  moveIntoGroup,
  moveOutOfGroup,
  normalizeLayoutDraftItems,
  removeItem,
  setPanelOption,
  setPanelFilters,
  setPanelType,
  setStripType,
  type LayoutDraft,
  type LayoutDraftCatalog,
} from "./layoutDraft";

const healingFilters = [{ field: "school", op: "eq", value: "holy" }] as unknown as PanelFilter[];

const catalog: LayoutDraftCatalog = {
  panelLabel: (type) => ({ damage_done: "Damage Done", healing_done: "Healing Done" } as Record<string, string>)[type],
  panelDefaultFilters: (type) => (type === "healing_done" ? healingFilters : undefined),
  strip: () => ({
    label: "Raid Durability",
    defaultOrientation: "horizontal",
    size: { minLength: 6, preferredLength: 12, minThickness: 1, preferredThickness: 1, maxThickness: 2 },
    defaultFilters: [],
  }),
};

function draft(overrides: Partial<LayoutDraft> = {}): LayoutDraft {
  return {
    items: [
      { id: "panel-1", title: "Damage Done", x: 0, y: 0, w: 6, h: 4 },
      { id: "panel-2", title: "Healing Done", x: 6, y: 0, w: 6, h: 4 },
    ],
    panelTypesById: { "panel-1": "damage_done", "panel-2": "healing_done" } as Record<string, EventsPanelType>,
    panelOptionsById: { "panel-1": "opt", "panel-2": null },
    panelFiltersById: { "panel-2": healingFilters },
    appearance: {},
    ...overrides,
  };
}

describe("layoutDraft", () => {
  it("adds panels with the next free id below everything else", () => {
    const result = addPanel(draft(), catalog);
    expect(result?.id).toBe("panel-3");
    expect(result?.draft.items.at(-1)).toMatchObject({ id: "panel-3", x: 0, y: 4, w: 6, h: 4, title: "Damage Done" });
    expect(result?.draft.panelTypesById["panel-3"]).toBe("damage_done");
  });

  it("refuses to add panels or strips past the limit", () => {
    let current = draft();
    while ((current.items.length) < MAX_LAYOUT_PANELS) {
      current = addPanel(current, catalog)!.draft;
    }
    expect(addPanel(current, catalog)).toBeNull();
    expect(addStrip(current, catalog)).toBeNull();
    // Groups are not panels and are not limited.
    expect(addGroup(current).id).toBe("group-1");
  });

  it("adds strips sized from the strip definition", () => {
    const result = addStrip(draft(), catalog)!;
    expect(result.id).toBe("strip-1");
    expect(result.draft.items.at(-1)).toMatchObject({ kind: "strip", w: 12, h: 1, minW: 6, minH: 1, maxH: 2, y: 4 });
  });

  it("removes an item and every per-id record for it", () => {
    const next = removeItem(draft(), "panel-1");
    expect(next.items.map((item) => item.id)).toEqual(["panel-2"]);
    expect(next.panelTypesById).not.toHaveProperty("panel-1");
    expect(next.panelOptionsById).not.toHaveProperty("panel-1");
    // Other panels keep their own state.
    expect(next.panelFiltersById["panel-2"]).toBe(healingFilters);
  });

  it("moves members of a removed group back to the outer grid", () => {
    const grouped = addGroup(draft());
    const withMember = moveIntoGroup(grouped.draft, "panel-2", grouped.id, { x: 0, y: 0 });
    expect(withMember.items.find((item) => item.id === "panel-2")).toMatchObject({ groupId: "group-1", x: 0, y: 0 });

    const next = removeItem(withMember, grouped.id);
    expect(next.items.find((item) => item.id === "panel-2")).toMatchObject({ groupId: undefined, x: 0 });
    expect(next.items.some((item) => item.id === "group-1")).toBe(false);
  });

  it("moves an item out of a group to the bottom of the outer grid", () => {
    const grouped = addGroup(draft());
    const inside = moveIntoGroup(grouped.draft, "panel-1", grouped.id, { x: 0, y: 0 });
    const outside = moveOutOfGroup(inside, "panel-1");
    // panel-2 (y 0–4) and the group row (y 4–8) remain in the outer grid.
    expect(outside.items.find((item) => item.id === "panel-1")).toMatchObject({ groupId: undefined, x: 0, y: 8 });
  });

  it("resets option and filters when a panel type changes", () => {
    const toHealing = setPanelType(draft(), catalog, "panel-1", "healing_done");
    expect(toHealing.panelTypesById["panel-1"]).toBe("healing_done");
    expect(toHealing.panelOptionsById["panel-1"]).toBeNull();
    expect(toHealing.panelFiltersById["panel-1"]).toBe(healingFilters);
    expect(toHealing.items[0].title).toBe("Healing Done");

    const toDamage = setPanelType(draft(), catalog, "panel-2", "damage_done");
    expect(toDamage.panelFiltersById).not.toHaveProperty("panel-2");
  });

  it("refits strip constraints on a strip type change", () => {
    const withStrip = addStrip(draft(), catalog)!;
    const shrunk = { ...withStrip.draft, items: withStrip.draft.items.map((item) => item.id === "strip-1" ? { ...item, w: 2 } : item) };
    const next = setStripType(shrunk, catalog, "strip-1", "raid_durability");
    expect(next.items.find((item) => item.id === "strip-1")).toMatchObject({ w: 6, stripType: "raid_durability" });
  });

  it("ignores repeated panel option writes", () => {
    const original = draft();
    expect(setPanelOption(original, "panel-1", "opt")).toBe(original);
    expect(setPanelOption(original, "panel-2", null)).toBe(original);
    expect(setPanelOption(original, "panel-1", "next")).not.toBe(original);
  });

  it("drops empty filter lists", () => {
    expect(setPanelFilters(draft(), "panel-2", []).panelFiltersById).not.toHaveProperty("panel-2");
  });

  it("normalizes items with the same outer compaction used by the rendered layout", () => {
    const normalized = normalizeLayoutDraftItems([
      { id: "panel-1", title: "First", x: -1, y: 10, w: 2, h: 2 },
      { id: "panel-2", title: "Second", x: 6, y: 20, w: 6, h: 4 },
    ]);
    expect(normalized).toEqual([
      expect.objectContaining({ id: "panel-1", kind: "panel", x: 0, y: 0, w: 4, h: 4 }),
      expect.objectContaining({ id: "panel-2", kind: "panel", x: 6, y: 0, w: 6, h: 4 }),
    ]);
  });

  it("round-trips through the layout export shape", () => {
    const original = draft({ appearance: { seamless: true } });
    const exported = layoutDraftToExport(original);
    expect(exported.version).toBe(1);
    expect(exported.seamless).toBe(true);
    // Null options are omitted from exports and restored as null.
    expect(exported.panelOptionsById).toEqual({ "panel-1": "opt" });
    const restored = layoutDraftFromExport(exported);
    expect(restored.panelTypesById).toEqual(original.panelTypesById);
    expect(restored.panelFiltersById).toEqual(original.panelFiltersById);
    expect(restored.appearance).toEqual({ seamless: true });
    expect(restored.items.map((item) => item.id)).toEqual(["panel-1", "panel-2"]);
  });
});
