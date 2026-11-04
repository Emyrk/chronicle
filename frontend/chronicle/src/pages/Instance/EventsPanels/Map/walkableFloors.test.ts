import { describe, expect, it } from "vitest";
import {
  buildFloorTracks,
  CLIMB_LIMIT_YARDS,
  floorTrackAt,
  startFloorTrackBuild,
  type FloorSample,
  type FloorTrack,
} from "./walkableFloors";

// Synthetic worlds, one yard per scene unit unless a test says otherwise; the
// candidate floors depend on x only.
const UNDERCITY = [-3, -17, -62];

/** A unit walking +x from `fromX` to `toX` at 5 yd/s, one sample a second. */
function walk(fromX: number, toX: number, startMs = 0, z = 0): FloorSample[] {
  const samples: FloorSample[] = [];
  const direction = Math.sign(toX - fromX) || 1;
  for (let x = fromX, ms = startMs; direction * (toX - x) >= 0; x += 5 * direction, ms += 1000) samples.push({ ms, x, z });
  return samples;
}

function floorsOf(track: FloorTrack): number[] {
  return Array.from(track.y);
}

describe("buildFloorTracks", () => {
  it("never puts a unit on a roof 20 yd up over part of its path", () => {
    const tracks = buildFloorTracks({
      units: [{ guid: "a", samples: walk(0, 40) }],
      scale: 1,
      candidatesAt: (x) => (x >= 10 && x <= 25 ? [20, 0] : [0]),
    });
    const track = tracks.units.get("a")!;
    expect(floorsOf(track).every((y) => y === 0)).toBe(true);
    // Stepped about a yard at a time between the samples.
    expect(track.ms.length).toBe(41);
  });

  it("keeps a unit off a roof even when the ground under it costs a drop", () => {
    // The unit ends under the roof, a yard down a step: only the climb limit
    // keeps the (otherwise cheaper) roof out of reach.
    const track = buildFloorTracks({
      units: [{ guid: "a", samples: walk(0, 25) }],
      scale: 1,
      candidatesAt: (x) => (x < 10 ? [0] : [20, -1]),
    }).units.get("a")!;
    expect(floorsOf(track).every((y) => y <= 0)).toBe(true);
    expect(track.y[track.y.length - 1]).toBe(-1);
  });

  it("follows a ramp that rises 0.5 yd a step up to a higher floor", () => {
    const ramp = (x: number) => (x < 10 ? [0] : x < 30 ? [0.5 * (x - 10)] : [10]);
    const track = buildFloorTracks({
      units: [{ guid: "a", samples: walk(0, 40) }],
      scale: 1,
      candidatesAt: (x) => [...ramp(x), ...UNDERCITY],
    }).units.get("a")!;
    const at = (x: number) => track.y[Array.from(track.x).indexOf(x)];
    expect(at(5)).toBe(0);
    expect(at(20)).toBe(5);
    expect(at(29)).toBe(9.5);
    expect(at(40)).toBe(10);
  });

  it("starts a unit under a roof on the floor nearest the fight's median top floor", () => {
    // Four units fight in the open at ground 60; one starts under a roof at 80.
    const open = ["a", "b", "c", "d"].map((guid, index) => ({ guid, samples: walk(100, 120, 0, index) }));
    const tracks = buildFloorTracks({
      units: [...open, { guid: "roofed", samples: walk(0, 10) }],
      scale: 1,
      candidatesAt: (x) => (x <= 15 ? [80, 60, ...UNDERCITY] : [60, ...UNDERCITY]),
    });
    expect(tracks.reference).toBe(60);
    expect(floorsOf(tracks.units.get("roofed")!).every((y) => y === 60)).toBe(true);
  });

  it("never drops into a far lower layer: not on walks, gaps, teleports or ledges", () => {
    const samples: FloorSample[] = [
      ...walk(0, 30),
      // A long gap, then on 20 yd: a fresh start.
      { ms: 20_000, x: 50, z: 0 },
      // A 100 yd teleport.
      { ms: 21_000, x: 150, z: 0 },
      ...walk(155, 170, 22_000),
    ];
    const tracks = buildFloorTracks({
      units: [{ guid: "a", samples }],
      scale: 1,
      // A balcony at 70 above the ground at 60 for x < 10, the Undercity far below everywhere.
      candidatesAt: (x) => (x < 10 ? [70, 60, ...UNDERCITY] : [60, ...UNDERCITY]),
    });
    const floors = floorsOf(tracks.units.get("a")!);
    expect(floors.every((y) => y >= 60)).toBe(true);
  });

  it("takes the nearest floor below off a ledge, never the layer under it", () => {
    // Seeded on the ledge (the only floor there), then walking off it.
    const track = buildFloorTracks({
      units: [{ guid: "a", samples: walk(0, 20) }],
      scale: 1,
      candidatesAt: (x) => (x < 10 ? [70] : [60, ...UNDERCITY]),
    }).units.get("a")!;
    expect(track.y[0]).toBe(70);
    expect(track.y[track.y.length - 1]).toBe(60);
    expect(floorsOf(track).every((y) => y >= 60)).toBe(true);
  });

  it("restarts where every floor is out of reach instead of leaving the unit nowhere", () => {
    // The ground ends at a cliff the unit cannot climb (a missing ramp in the mesh).
    const track = buildFloorTracks({
      units: [{ guid: "a", samples: walk(0, 20) }],
      scale: 1,
      candidatesAt: (x) => (x < 10 ? [0] : [CLIMB_LIMIT_YARDS + 8]),
    }).units.get("a")!;
    expect(track.y[0]).toBe(0);
    expect(track.y[track.y.length - 1]).toBe(10);
  });

  it("leaves steps without a floor empty and restarts after them", () => {
    const track = buildFloorTracks({
      units: [{ guid: "a", samples: walk(0, 20) }],
      scale: 1,
      candidatesAt: (x) => (x >= 8 && x <= 12 ? [] : [0]),
    }).units.get("a")!;
    const at = (x: number) => track.y[Array.from(track.x).indexOf(x)];
    expect(at(10)).toBeNaN();
    expect(at(13)).toBe(0);
  });

  it("measures the climb limit in yards at the scene scale", () => {
    // 0.5 scene units per yard: a 1.5-unit rise is 3 yd, too far to climb.
    const track = buildFloorTracks({
      units: [{ guid: "a", samples: walk(0, 10).map((sample) => ({ ...sample, x: sample.x * 0.5 })) }],
      scale: 0.5,
      candidatesAt: (x) => (x < 2.5 ? [0] : [1.5, 0]),
    }).units.get("a")!;
    expect(floorsOf(track).every((y) => y === 0)).toBe(true);
  });

  it("builds in slices against its time budget", () => {
    let clock = 0;
    const build = startFloorTrackBuild({
      units: [{ guid: "a", samples: walk(0, 1000) }],
      scale: 1,
      candidatesAt: () => {
        clock += 0.1;
        return [0];
      },
    }, () => clock);
    expect(build.step(1)).toBe(false);
    expect(build.result).toBeNull();
    let slices = 1;
    while (!build.step(1)) slices++;
    expect(slices).toBeGreaterThan(5);
    expect(build.result!.units.get("a")!.y.length).toBe(1001);
  });
});

describe("floorTrackAt", () => {
  const track = buildFloorTracks({
    units: [{ guid: "a", samples: [{ ms: 0, x: 0, z: 0 }, { ms: 2000, x: 2, z: 0 }, { ms: 10_000, x: 2, z: 0 }] }],
    scale: 1,
    candidatesAt: (x) => [x],
  }).units.get("a")!;

  it("follows the path between steps as the replay interpolates it", () => {
    expect(floorTrackAt(track, 500, 0.5, 0, 0.1)).toBeCloseTo(0.5);
    expect(floorTrackAt(track, 1500, 1.5, 0, 0.1)).toBeCloseTo(1.5);
    // Standing still between two samples, and before and after the path.
    expect(floorTrackAt(track, 6000, 2, 0, 0.1)).toBe(2);
    expect(floorTrackAt(track, -100, 0, 0, 0.1)).toBe(0);
    expect(floorTrackAt(track, 20_000, 2, 0, 0.1)).toBe(2);
  });

  it("finds either of two samples logged at the same time", () => {
    const twin = buildFloorTracks({
      units: [{ guid: "a", samples: [{ ms: 0, x: 0, z: 0 }, { ms: 1000, x: 3, z: 0 }, { ms: 1000, x: 6, z: 0 }] }],
      scale: 1,
      candidatesAt: (x) => [x],
    }).units.get("a")!;
    expect(floorTrackAt(twin, 1000, 3, 0, 0.1)).toBe(3);
    expect(floorTrackAt(twin, 1000, 6, 0, 0.1)).toBe(6);
  });

  it("answers null for a unit away from the path it was built from", () => {
    expect(floorTrackAt(track, 500, 0.5, 3, 0.1)).toBeNull();
  });
});
