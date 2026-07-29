import { describe, expect, it } from "vitest";
import { resizeGridItemFromEdge } from "./gridEdgeResize";

const item = {
  x: 3,
  y: 2,
  w: 4,
  h: 3,
  minW: 2,
  minH: 2,
  maxW: 8,
  maxH: 6,
};

describe("resizeGridItemFromEdge", () => {
  it("grows and shrinks from the right and bottom", () => {
    expect(resizeGridItemFromEdge(item, "right", 1, 12)).toMatchObject({
      x: 3,
      w: 5,
    });
    expect(resizeGridItemFromEdge(item, "right", -1, 12)).toMatchObject({
      x: 3,
      w: 3,
    });
    expect(resizeGridItemFromEdge(item, "bottom", 1, 12)).toMatchObject({
      y: 2,
      h: 4,
    });
    expect(resizeGridItemFromEdge(item, "bottom", -1, 12)).toMatchObject({
      y: 2,
      h: 2,
    });
  });

  it("moves the origin when resizing from the left or top", () => {
    expect(resizeGridItemFromEdge(item, "left", 1, 12)).toMatchObject({
      x: 2,
      w: 5,
    });
    expect(resizeGridItemFromEdge(item, "left", -1, 12)).toMatchObject({
      x: 4,
      w: 3,
    });
    expect(resizeGridItemFromEdge(item, "top", 1, 12)).toMatchObject({
      y: 1,
      h: 4,
    });
    expect(resizeGridItemFromEdge(item, "top", -1, 12)).toMatchObject({
      y: 3,
      h: 2,
    });
  });

  it("does not grow beyond grid edges or shrink below minimums", () => {
    expect(
      resizeGridItemFromEdge({ ...item, x: 0 }, "left", 1, 12),
    ).toEqual({ ...item, x: 0 });
    expect(
      resizeGridItemFromEdge({ ...item, x: 8 }, "right", 1, 12),
    ).toEqual({ ...item, x: 8 });
    expect(
      resizeGridItemFromEdge({ ...item, w: 2 }, "right", -1, 12),
    ).toEqual({ ...item, w: 2 });
    expect(
      resizeGridItemFromEdge({ ...item, h: 2 }, "top", -1, 12),
    ).toEqual({ ...item, h: 2 });
  });
});
