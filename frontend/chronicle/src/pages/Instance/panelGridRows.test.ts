import { describe, expect, it } from "vitest";
import { buildLayoutSections } from "@/components/layout/layoutGroups";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import { isPanelPresetLayout, PRESET_LAYOUTS_BY_ID } from "./presetLayouts";
import { panelGridTemplateRows } from "./panelGridRows";

const items: GridEditorItem[] = [
  { id: "fixed", title: "Fixed", x: 0, y: 0, w: 12, h: 2 },
  { id: "content", title: "Content", x: 0, y: 2, w: 12, h: 1, minH: 1 },
];

describe("panelGridTemplateRows", () => {
  it("uses an auto track for an intrinsic-height panel", () => {
    expect(panelGridTemplateRows(items, new Set(["content"]), false)).toBe("96px 96px auto");
  });

  it("keeps the intrinsic track auto in fit layouts", () => {
    expect(panelGridTemplateRows(items, new Set(["content"]), true)).toBe(
      "minmax(96px, 1fr) minmax(96px, 1fr) auto",
    );
  });

  it("uses implicit fixed rows for an ordinary non-fit layout", () => {
    expect(panelGridTemplateRows(items, new Set(), false)).toBeNull();
  });

  it("keeps the grouped Player Timeline preset intrinsic after sectioning", () => {
    const preset = PRESET_LAYOUTS_BY_ID.player_timeline;
    if (!isPanelPresetLayout(preset)) throw new Error("Player Timeline should be a panels preset");

    const timelineId = Object.entries(preset.panelTypes).find(([, type]) => type === "player_timeline")?.[0];
    if (!timelineId) throw new Error("Player Timeline panel is missing");
    const timelineSection = buildLayoutSections(preset.layoutItems).find((section) =>
      section.items.some((item) => item.id === timelineId),
    );
    if (!timelineSection) throw new Error("Player Timeline section is missing");

    expect(panelGridTemplateRows(timelineSection.items, new Set([timelineId]), false)).toBe("auto");
  });
});
