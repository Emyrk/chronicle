import { describe, expect, it } from "vitest";
import { PANEL_POPUP_FEATURES, panelPopupName } from "./panelPopup";

describe("panelPopupName", () => {
  it("creates a stable window name for a panel", () => {
    expect(panelPopupName("panel-12")).toBe("chronicle-panel-panel-12");
  });

  it("sanitizes characters that should not be used in a window name", () => {
    expect(panelPopupName("layout/panel 2"))
      .toBe("chronicle-panel-layout-panel-2");
  });
});

describe("PANEL_POPUP_FEATURES", () => {
  it("requests a resizable popup with a useful initial size", () => {
    expect(PANEL_POPUP_FEATURES).toContain("popup=yes");
    expect(PANEL_POPUP_FEATURES).toContain("width=900");
    expect(PANEL_POPUP_FEATURES).toContain("height=650");
    expect(PANEL_POPUP_FEATURES).toContain("resizable=yes");
  });
});
