import { describe, expect, it } from "vitest";
import {
  getPanelLayout,
  PANEL_LAYOUT_CARDS,
  PANEL_LAYOUT_SEAMLESS,
} from "./panelLayout";

describe("getPanelLayout", () => {
  it.each([undefined, "", PANEL_LAYOUT_CARDS, "unknown"])(
    "uses the card layout for %s",
    (value) => {
      expect(getPanelLayout(value)).toBe(PANEL_LAYOUT_CARDS);
    },
  );

  it("keeps the seamless layout", () => {
    expect(getPanelLayout(PANEL_LAYOUT_SEAMLESS)).toBe(PANEL_LAYOUT_SEAMLESS);
  });
});
