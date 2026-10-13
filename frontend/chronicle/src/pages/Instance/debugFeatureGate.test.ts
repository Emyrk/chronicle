import { describe, expect, it } from "vitest";
import { showDebugDesktopControls } from "./debugFeatureGate";

describe("showDebugDesktopControls", () => {
  it("shows experimental controls only for debug=true on desktop", () => {
    expect(showDebugDesktopControls(new URLSearchParams("debug=true"), false)).toBe(true);
    expect(showDebugDesktopControls(new URLSearchParams("debug=false"), false)).toBe(false);
    expect(showDebugDesktopControls(new URLSearchParams(), false)).toBe(false);
  });

  it("hides experimental controls on mobile even in debug mode", () => {
    expect(showDebugDesktopControls(new URLSearchParams("debug=true"), true)).toBe(false);
  });
});
