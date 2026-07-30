import { describe, expect, it } from "vitest";
import {
  SHOW_STRIP_TITLE_TOKEN,
  stripOptionEnabled,
  updateStripOptionFlag,
} from "./stripOptions";

describe("strip title option", () => {
  it("defaults to hidden", () => {
    expect(stripOptionEnabled(null, SHOW_STRIP_TITLE_TOKEN)).toBe(false);
  });

  it("adds the title token while preserving other options", () => {
    expect(updateStripOptionFlag("bc:#ef4444", SHOW_STRIP_TITLE_TOKEN, true))
      .toBe("bc:#ef4444,show-title");
  });

  it("removes only the title token", () => {
    expect(updateStripOptionFlag("show-title,t:Custom", SHOW_STRIP_TITLE_TOKEN, false))
      .toBe("t:Custom");
  });
});
