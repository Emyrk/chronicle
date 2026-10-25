import { describe, expect, it } from "vitest";
import { defaultPositionCoordinateSpace } from "./positionCoordinateSpace";

describe("defaultPositionCoordinateSpace", () => {
  it.each(["2.4.3-cc-addon", "3.3.5a-cc-addon"])("uses UI map coordinates for %s", (format) => {
    expect(defaultPositionCoordinateSpace(format)).toBe("ui-map-normalized");
  });

  it.each([undefined, "1.12.1-cc-addon", "azerothcore-mod"])("defaults %s to world coordinates", (format) => {
    expect(defaultPositionCoordinateSpace(format)).toBe("world");
  });
});
