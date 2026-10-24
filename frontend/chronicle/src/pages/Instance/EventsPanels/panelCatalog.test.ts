import { describe, expect, it } from "vitest";
import { PANELS } from "./EventsPanel";
import { isQueryablePanelType, PANEL_AI_DESCRIPTIONS } from "./panelCatalog";

describe("panel AI catalog", () => {
  it("has a meaningful human description for every built-in panel", () => {
    expect(Object.keys(PANEL_AI_DESCRIPTIONS).sort()).toEqual(Object.keys(PANELS).sort());
    for (const [panelType, description] of Object.entries(PANEL_AI_DESCRIPTIONS)) {
      expect(description.length, panelType).toBeGreaterThan(30);
      expect(PANELS[panelType as keyof typeof PANELS].label, panelType).not.toBe("");
    }
  });

  it("identifies only the panel types supported by query_panel", () => {
    expect(Object.keys(PANELS).filter(isQueryablePanelType).sort()).toEqual([
      "damage_done",
      "damage_taken",
      "healing_done",
      "healing_taken",
    ]);
  });
});
