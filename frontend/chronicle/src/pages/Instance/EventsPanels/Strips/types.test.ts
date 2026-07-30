import { describe, expect, it } from "vitest";
import { resolveStripSize } from "./types";

const size = {
  minLength: 6,
  preferredLength: 12,
  maxLength: 20,
  minThickness: 1,
  preferredThickness: 2,
  maxThickness: 3,
};

describe("resolveStripSize", () => {
  it("maps length to width for horizontal strips", () => {
    expect(resolveStripSize(size, "horizontal")).toEqual({
      minW: 6,
      minH: 1,
      maxW: 20,
      maxH: 3,
      preferredW: 12,
      preferredH: 2,
    });
  });

  it("reverses length and thickness constraints for vertical strips", () => {
    expect(resolveStripSize(size, "vertical")).toEqual({
      minW: 1,
      minH: 6,
      maxW: 3,
      maxH: 20,
      preferredW: 2,
      preferredH: 12,
    });
  });
});
