import { describe, expect, it } from "vitest";
import {
  CINEMATIC_ELEVATION_DEG,
  directorFrame,
  exceedsDeadZone,
  frameDistance,
  MAX_FRAME_DISTANCE_YARDS,
  MIN_FRAME_DISTANCE_YARDS,
  MIN_FRAME_RADIUS_YARDS,
  smoothDamp,
  snapDampedValue,
  type DirectorUnit,
} from "./cameraDirector";

function unit(guid: string, x: number, z: number, extra: Partial<DirectorUnit> = {}): DirectorUnit {
  return { guid, x, z, player: true, boss: false, dead: false, ...extra };
}

const boss = (x = 0, z = 0) => unit("boss", x, z, { player: false, boss: true });

describe("directorFrame", () => {
  it("frames the boss and every player near it", () => {
    const frame = directorFrame([
      boss(),
      unit("a", 5, 0),
      unit("b", -5, 0),
      unit("c", 0, 5),
    ]);
    expect(frame).not.toBeNull();
    expect(new Set(frame!.guids)).toEqual(new Set(["boss", "a", "b", "c"]));
    // The bounding circle covers every framed unit, not the clump's mean.
    for (const point of [[5, 0], [-5, 0], [0, 5], [0, 0]]) {
      expect(Math.hypot(frame!.x - point[0], frame!.z - point[1])).toBeLessThanOrEqual(frame!.radius + 1e-6);
    }
  });

  it("leaves a straggler past the cutoff out of the frame", () => {
    const frame = directorFrame([
      boss(),
      unit("a", 3, 0),
      unit("b", -3, 0),
      unit("c", 0, 3),
      unit("d", 0, -3),
      unit("far", 80, 0),
    ]);
    expect(frame!.guids).not.toContain("far");
    // Without the straggler the shot stays tight around the fight.
    expect(frame!.radius).toBeLessThan(5);
  });

  it("keeps three fifths of the group framed when most of it is spread out", () => {
    // Only one player is inside 30 yd, but ceil(0.6 * 5) = 3 must stay framed.
    const frame = directorFrame([
      boss(),
      unit("a", 5, 0),
      unit("b", 40, 0),
      unit("c", 45, 0),
      unit("d", 90, 0),
      unit("e", 95, 0),
    ]);
    expect(frame!.guids).toEqual(["boss", "a", "b", "c"]);
  });

  it("holds a player in frame until the release distance (hysteresis)", () => {
    const spread = (x: number) => [boss(), unit("a", 1, 0), unit("b", -1, 0), unit("c", 1, 1), unit("drift", x, 0)];
    // Fresh: joins only inside 30 yd.
    expect(directorFrame(spread(32))!.guids).not.toContain("drift");
    // Already framed: stays until 34 yd.
    expect(directorFrame(spread(32), new Set(["boss", "a", "b", "c", "drift"]))!.guids).toContain("drift");
    expect(directorFrame(spread(36), new Set(["boss", "a", "b", "c", "drift"]))!.guids).not.toContain("drift");
  });

  it("ignores dead players", () => {
    const frame = directorFrame([
      boss(),
      unit("alive", 4, 0),
      unit("corpse", 25, 0, { dead: true }),
    ]);
    expect(frame!.guids).toEqual(["boss", "alive"]);
  });

  it("frames the group alone when no boss is up", () => {
    const frame = directorFrame([unit("a", 0, 0), unit("b", 10, 0)]);
    expect(new Set(frame!.guids)).toEqual(new Set(["a", "b"]));
    expect(frame!.x).toBeCloseTo(5);
    expect(frame!.radius).toBeCloseTo(5);
  });

  it("leaves a straggler out of the group's frame when no boss is up", () => {
    // A whole run on a terrain map: one player 170 yd behind the group.
    const frame = directorFrame([
      unit("a", 0, 0),
      unit("b", 6, 0),
      unit("c", 0, 6),
      unit("d", 6, 6),
      unit("far", 170, 0),
    ]);
    expect(frame!.guids).not.toContain("far");
    expect(frame!.radius).toBeLessThan(5);
    expect(Math.hypot(frame!.x - 3, frame!.z - 3)).toBeLessThan(1);
  });

  it("frames a lone player", () => {
    const frame = directorFrame([unit("solo", 7, -3)]);
    expect(frame).toEqual({ x: 7, z: -3, radius: 0, guids: ["solo"] });
  });

  it("picks the boss nearest the group when several are alive", () => {
    const frame = directorFrame([
      unit("far-boss", 200, 0, { player: false, boss: true }),
      unit("near-boss", 5, 0, { player: false, boss: true }),
      unit("a", 0, 0),
      unit("b", 2, 0),
    ]);
    expect(frame!.guids[0]).toBe("near-boss");
  });

  it("frames the group alone while the only boss stands in another room", () => {
    const frame = directorFrame([
      unit("sleeping-boss", 300, 0, { player: false, boss: true }),
      unit("a", 0, 0),
      unit("b", 4, 0),
    ]);
    expect(new Set(frame!.guids)).toEqual(new Set(["a", "b"]));
    expect(frame!.radius).toBeCloseTo(2);
  });

  it("frames the double-clicked subject alone", () => {
    const frame = directorFrame([boss(), unit("a", 5, 0), unit("b", 40, 0)], new Set(), { subjectGuid: "b" });
    expect(frame).toEqual({ x: 40, z: 0, radius: 0, guids: ["b"] });
  });

  it("returns null with nobody alive", () => {
    expect(directorFrame([unit("a", 0, 0, { dead: true })])).toBeNull();
    expect(directorFrame([])).toBeNull();
  });
});

describe("frameDistance", () => {
  const fov = (45 * Math.PI) / 180;
  const shot = { verticalFov: fov, aspect: 2, elevationDeg: CINEMATIC_ELEVATION_DEG };

  // Where the near and far edges of the framed circle land, in degrees below
  // the camera's horizon; both have to stay inside half the vertical fov.
  function edgesBelowAxis(radius: number, distance: number, elevationDeg: number) {
    const elevation = (elevationDeg * Math.PI) / 180;
    const height = distance * Math.sin(elevation);
    const ground = distance * Math.cos(elevation);
    const angle = (depth: number) => (Math.atan2(height, ground + depth) * 180) / Math.PI;
    return { near: angle(-radius) - elevationDeg, far: elevationDeg - angle(radius) };
  }

  it("keeps the whole circle inside the frame", () => {
    const radius = 15;
    const distance = frameDistance(radius, shot);
    const { near, far } = edgesBelowAxis(radius, distance, CINEMATIC_ELEVATION_DEG);
    const half = (fov / 2) * (180 / Math.PI);
    expect(near).toBeLessThan(half);
    expect(far).toBeLessThan(half);
    // And sideways.
    expect(Math.atan(radius / distance)).toBeLessThan(Math.atan(Math.tan(fov / 2) * 2));
  });

  it("stands closer for a low shot than a disc fit would, because the ground is seen edge-on", () => {
    const radius = 15;
    const discFit = (radius / Math.sin(fov / 2)) * 1.15;
    expect(frameDistance(radius, shot)).toBeLessThan(discFit);
    // Straight down there is no foreshortening, so it falls back to the disc fit.
    expect(frameDistance(radius, { ...shot, elevationDeg: 90 })).toBeCloseTo((radius / Math.tan(fov / 2)) * 1.15);
  });

  it("stands back far enough for a narrow viewport, where the sides bind first", () => {
    const wide = frameDistance(15, { ...shot, aspect: 4 });
    const narrow = frameDistance(15, { ...shot, aspect: 0.5 });
    expect(narrow).toBeGreaterThan(wide);
  });

  it("never gets closer than the minimum frame radius allows", () => {
    expect(frameDistance(0, shot)).toBe(frameDistance(MIN_FRAME_RADIUS_YARDS, shot));
  });

  it("clamps to the distance limits", () => {
    expect(frameDistance(1000, shot)).toBe(MAX_FRAME_DISTANCE_YARDS);
    expect(frameDistance(0, { ...shot, verticalFov: (170 * Math.PI) / 180 })).toBe(MIN_FRAME_DISTANCE_YARDS);
  });

  it("scales the yard limits into scene units", () => {
    expect(frameDistance(1000, { ...shot, scale: 3 })).toBe(MAX_FRAME_DISTANCE_YARDS * 3);
    expect(frameDistance(0, { ...shot, scale: 3 })).toBe(frameDistance(MIN_FRAME_RADIUS_YARDS * 3, { ...shot, scale: 3 }));
  });
});

describe("snapDampedValue", () => {
  it("starts a camera value at its goal without leftover momentum", () => {
    const state = { value: 120, velocity: -45 };
    expect(snapDampedValue(state, 18)).toBe(18);
    expect(state).toEqual({ value: 18, velocity: 0 });
  });
});

describe("smoothDamp", () => {
  it("reaches the goal in about the smoothing time without overshooting", () => {
    const state = { value: 0, velocity: 0 };
    let peak = 0;
    // Three seconds, five times the smoothing time.
    for (let step = 0; step < 180; step++) {
      peak = Math.max(peak, smoothDamp(state, 10, 0.6, 1 / 60));
    }
    expect(peak).toBeLessThanOrEqual(10);
    expect(state.value).toBeCloseTo(10, 1);
  });

  it("moves most of the way within the smoothing time", () => {
    const state = { value: 0, velocity: 0 };
    for (let step = 0; step < 36; step++) smoothDamp(state, 10, 0.6, 1 / 60);
    expect(state.value).toBeGreaterThan(5);
    expect(state.value).toBeLessThan(10);
  });

  it("is frame-rate independent", () => {
    const fast = { value: 0, velocity: 0 };
    const slow = { value: 0, velocity: 0 };
    for (let step = 0; step < 120; step++) smoothDamp(fast, 10, 0.6, 1 / 120);
    for (let step = 0; step < 30; step++) smoothDamp(slow, 10, 0.6, 1 / 30);
    expect(fast.value).toBeCloseTo(slow.value, 1);
  });

  it("snaps with no smoothing time and ignores a zero step", () => {
    const state = { value: 3, velocity: 2 };
    expect(smoothDamp(state, 9, 0, 1 / 60)).toBe(9);
    expect(state.velocity).toBe(0);
    expect(smoothDamp({ value: 3, velocity: 0 }, 9, 0.5, 0)).toBe(3);
  });
});

describe("exceedsDeadZone", () => {
  it("ignores small changes and takes large ones", () => {
    expect(exceedsDeadZone(20, 22, 0.15)).toBe(false);
    expect(exceedsDeadZone(20, 24, 0.15)).toBe(true);
    expect(exceedsDeadZone(20, 16, 0.15)).toBe(true);
  });
});

describe("the cinematic shot", () => {
  it("is a low three-quarter view, not the near-top-down the mesh used to start from", () => {
    expect(CINEMATIC_ELEVATION_DEG).toBeGreaterThanOrEqual(25);
    expect(CINEMATIC_ELEVATION_DEG).toBeLessThanOrEqual(30);
  });
});
