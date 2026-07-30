import { describe, expect, it } from "vitest";
import {
  stripTitleMode,
  updateStripTitleMode,
} from "./stripOptions";

describe("strip title mode", () => {
  it("defaults to none", () => {
    expect(stripTitleMode(null)).toBe("none");
  });

  it("persists a title mode while preserving other options", () => {
    expect(updateStripTitleMode("bc:#ef4444", "large"))
      .toBe("bc:#ef4444,title-mode:large");
  });

  it("replaces an existing title mode", () => {
    expect(updateStripTitleMode("title-mode:large,t:Custom", "overlay"))
      .toBe("t:Custom,title-mode:overlay");
  });

  it("removes title mode tokens when set to none", () => {
    expect(updateStripTitleMode("title-mode:overlay,t:Custom", "none"))
      .toBe("t:Custom");
  });

  it("reads the legacy show-title token as overlay", () => {
    expect(stripTitleMode("show-title")).toBe("overlay");
  });
});
