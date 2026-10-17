import { describe, expect, it } from "vitest";
import { withSelectedUnit } from "./RaidFrames";

describe("withSelectedUnit", () => {
  it("selects a unit, keeping other tokens", () => {
    expect(withSelectedUnit("cb", "Player-1")).toBe("cb,u:Player-1");
    expect(withSelectedUnit(null, "Player-1")).toBe("u:Player-1");
  });

  it("replaces an existing selection", () => {
    expect(withSelectedUnit("u:Player-1,cb", "Player-2")).toBe("cb,u:Player-2");
  });

  it("clears the selection", () => {
    expect(withSelectedUnit("cb,u:Player-1", null)).toBe("cb");
    expect(withSelectedUnit("u:Player-1", null)).toBeNull();
  });
});
