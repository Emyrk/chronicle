import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { loopingWhelpStand, shouldFlapWings } from "./whelpAnimation";

describe("Rookery Whelp wing animation", () => {
  it("uses the original game model for every Rookery Whelp, not other models", () => {
    expect(shouldFlapWings(10161, "game")).toBe(true);
    expect(shouldFlapWings(10161, "miniature")).toBe(false);
    expect(shouldFlapWings(10161, undefined)).toBe(false);
    expect(shouldFlapWings(11262, "game")).toBe(false);
    expect(shouldFlapWings(175124, "game")).toBe(false);
  });

  it("loops the moving first 1.2 seconds instead of the padded 33-second Stand clip", () => {
    const stand = new THREE.AnimationClip("Stand", -1, [
      new THREE.NumberKeyframeTrack(".rotation[z]", [0, 0.6, 1.2], [0, 1, 0]),
      new THREE.NumberKeyframeTrack(".position[y]", [0, 33.334], [0, 0]),
    ]);
    const loop = loopingWhelpStand(stand);
    expect(stand.duration).toBeCloseTo(33.334);
    expect(loop.duration).toBeCloseTo(1.2);
    expect(loop.tracks[0]?.times).toEqual(new Float32Array([0, 0.6, 1.2]));
    expect(loopingWhelpStand(stand)).toBe(loop);
  });
});
