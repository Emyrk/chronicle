import { describe, expect, it } from "vitest";
import { cameraPoseAt, type MapCameraMark } from "./cameraPath";

const marks: MapCameraMark[] = [
  { timestampMs: 10_000, position: [10, 20, 30], target: [1, 2, 3], fov: 40, near: 1, far: 100 },
  { timestampMs: 0, position: [0, 0, 0], target: [0, 0, 0], fov: 50, near: 2, far: 200 },
];

describe("cameraPoseAt", () => {
  it("clamps to the path endpoints regardless of mark order", () => {
    expect(cameraPoseAt(marks, -1)?.position).toEqual([0, 0, 0]);
    expect(cameraPoseAt(marks, 20_000)?.position).toEqual([10, 20, 30]);
  });

  it("smoothly interpolates position, target, and lens settings", () => {
    expect(cameraPoseAt(marks, 5_000)).toEqual({
      position: [5, 10, 15],
      target: [0.5, 1, 1.5],
      fov: 45,
      near: 1.5,
      far: 150,
    });
  });

  it("returns null for an empty path", () => {
    expect(cameraPoseAt([], 5_000)).toBeNull();
  });
});
