import { describe, expect, it } from "vitest";
import { mapPresentationForSelection } from "./Map";

describe("map presentation", () => {
  it("uses the 3D replay for exactly one selected encounter", () => {
    expect(mapPresentationForSelection(1)).toBe("replay-3d");
    expect(mapPresentationForSelection(1, true)).toBe("replay-3d");
  });

  it("uses the 2D route overview for zero or multiple selected encounters", () => {
    expect(mapPresentationForSelection(0)).toBe("overview-2d");
    expect(mapPresentationForSelection(2)).toBe("overview-2d");
    expect(mapPresentationForSelection(8)).toBe("overview-2d");
  });

  it("uses the 3D replay of the whole run when asked, for zero or several encounters", () => {
    expect(mapPresentationForSelection(0, true)).toBe("replay-3d");
    expect(mapPresentationForSelection(8, true)).toBe("replay-3d");
  });
});
