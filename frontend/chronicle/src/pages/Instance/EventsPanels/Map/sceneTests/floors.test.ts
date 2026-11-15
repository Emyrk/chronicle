import { describe, expect, it } from "vitest";
import type { MapSceneFollowSource } from "../MapScene3D";
import { createTestScene, testUnit } from "./createTestScene";
import { BALCONY_Y, GROUND_Y, mapPointAt } from "./syntheticDungeon";

// Characterisation (chronicle-1967): which floor a unit stands on. Under the
// balcony (x -40..-10) the mesh has two floors, the ground (y 0) and the
// balcony (y 10); east of it only the ground. Scene units are yards here.

const UNDER_BALCONY = -25;

/** A follow source with one no-Z unit walking east to west, from open ground to under the balcony. */
function walkUnderTheBalcony(guid: string): MapSceneFollowSource {
  const samples = [0, 1, 2, 3].map((second) => ({ ms: second * 1000, point: mapPointAt(5 - second * 10, 0) }));
  return {
    key: "walk-under-the-balcony",
    startMs: 0,
    endMs: 3000,
    unitsAt: () => [],
    unitTracks: () => [{ guid, samples }],
  };
}

describe("floors: a unit with a logged Z", () => {
  it("stands on the floor nearest below its logged height (probed from 2.5 yards above its feet)", async () => {
    const h = await createTestScene({
      units: [
        testUnit("ground", UNDER_BALCONY, 0, { z: 0.5 }),
        testUnit("balcony", UNDER_BALCONY, 5, { z: 10.5 }),
        testUnit("open", 5, 0, { z: 0 }),
      ],
    });
    expect(h.probe.unit("ground")).toMatchObject({ floorY: GROUND_Y, floorTracked: false });
    expect(h.probe.unit("ground")!.base.y).toBe(GROUND_Y);
    expect(h.probe.unit("balcony")).toMatchObject({ floorY: BALCONY_Y, floorTracked: false });
    expect(h.probe.unit("balcony")!.base.y).toBe(BALCONY_Y);
    expect(h.probe.unit("open")!.floorY).toBe(GROUND_Y);
  });

  it("more than 2 yards above that floor it is drawn in the air at its logged height", async () => {
    const h = await createTestScene({ units: [testUnit("knocked", UNDER_BALCONY, 0, { z: 4 }), testUnit("hop", 5, 0, { z: 1.9 })] });
    expect(h.probe.unit("knocked")!.floorY).toBe(GROUND_Y);
    expect(h.probe.unit("knocked")!.base.y).toBe(4);
    // Within 2 yards it stands on the floor.
    expect(h.probe.unit("hop")!.base.y).toBe(GROUND_Y);
  });

  it("logged up to 2.5 yards under the balcony's top it already stands on the balcony", async () => {
    // The probe starts at z + 2.5 = 10.5, above the balcony's top (10): a unit
    // logged in the air under a 1-yard-thick floor is put on top of it.
    const h = await createTestScene({ units: [testUnit("under", UNDER_BALCONY, 0, { z: 8 })] });
    expect(h.probe.unit("under")!.floorY).toBe(BALCONY_Y);
    expect(h.probe.unit("under")!.base.y).toBe(BALCONY_Y);
  });

  it("a probe that starts inside the balcony slab passes through its underside to the ground", async () => {
    // z 7 probes from 9.5, between the balcony's underside (9) and top (10).
    const h = await createTestScene({ units: [testUnit("inside", UNDER_BALCONY, 0, { z: 7 })] });
    expect(h.probe.unit("inside")!.floorY).toBe(GROUND_Y);
    expect(h.probe.unit("inside")!.base.y).toBe(7);
  });
});

describe("floors: a unit without a logged Z", () => {
  it("stands on the highest surface while there are no floor tracks", async () => {
    const h = await createTestScene({ units: [testUnit("p1", UNDER_BALCONY, 0, { atMs: 3000 })] });
    expect(h.probe.floorTracks()).toBeNull();
    expect(h.probe.unit("p1")).toMatchObject({ floorY: BALCONY_Y, floorTracked: false });
  });

  it("moves to its tracked floor once the sliced floor-track build finishes", async () => {
    const h = await createTestScene({ units: [testUnit("p1", UNDER_BALCONY, 0, { atMs: 3000 })] });
    h.scene.setFollowSource(walkUnderTheBalcony("p1"));
    // The build runs in setTimeout slices; nothing changes until it is done.
    expect(h.probe.unit("p1")!.floorY).toBe(BALCONY_Y);
    await h.runTimers();
    expect(h.probe.floorTracks()).not.toBeNull();
    // It walked in on the ground and cannot have climbed 10 yards onto the balcony.
    expect(h.probe.unit("p1")).toMatchObject({ floorY: GROUND_Y, floorTracked: true });
    expect(h.probe.unit("p1")!.base.y).toBe(GROUND_Y);
  });

  it("off its track (other data, or no sample time) it falls back to the highest surface", async () => {
    const h = await createTestScene({ units: [testUnit("p1", UNDER_BALCONY, 0, { atMs: 3000 })] });
    h.scene.setFollowSource(walkUnderTheBalcony("p1"));
    await h.runTimers();
    // 10 yards from where the track had it at 3 s.
    h.scene.setUnits([testUnit("p1", UNDER_BALCONY, 10, { atMs: 3000 })]);
    expect(h.probe.unit("p1")).toMatchObject({ floorY: BALCONY_Y, floorTracked: false });
    // No atMs: the track cannot be read.
    h.scene.setUnits([testUnit("p1", UNDER_BALCONY, 0)]);
    expect(h.probe.unit("p1")).toMatchObject({ floorY: BALCONY_Y, floorTracked: false });
  });

  it("a logged Z wins over its floor track", async () => {
    const h = await createTestScene({ units: [testUnit("p1", UNDER_BALCONY, 0, { atMs: 3000, z: 10 })] });
    h.scene.setFollowSource(walkUnderTheBalcony("p1"));
    await h.runTimers();
    expect(h.probe.unit("p1")).toMatchObject({ floorY: BALCONY_Y, floorTracked: false });
  });

  it("dropping the follow source drops the tracks, but the unit stays on its tracked floor until it is placed again", async () => {
    const h = await createTestScene({ units: [testUnit("p1", UNDER_BALCONY, 0, { atMs: 3000 })] });
    h.scene.setFollowSource(walkUnderTheBalcony("p1"));
    await h.runTimers();
    h.scene.setFollowSource(null);
    expect(h.probe.floorTracks()).toBeNull();
    expect(h.probe.unit("p1")).toMatchObject({ floorY: GROUND_Y, floorTracked: true });
    h.scene.setUnits([testUnit("p1", UNDER_BALCONY, 0, { atMs: 3000 })]);
    expect(h.probe.unit("p1")!.floorY).toBe(BALCONY_Y);
  });
});

describe("floors: a unit off the mesh", () => {
  it("keeps the last height it had on the mesh", async () => {
    const h = await createTestScene({ units: [testUnit("p1", UNDER_BALCONY, 0)] });
    expect(h.probe.unit("p1")!.floorY).toBe(BALCONY_Y);
    // x -45 is on the artwork but past the mesh's west edge (-40).
    h.scene.setUnits([testUnit("p1", -45, 0)]);
    expect(h.probe.unit("p1")!.floorY).toBe(BALCONY_Y);
    expect(h.probe.unit("p1")!.base.toArray()).toEqual([-45, BALCONY_Y, 0]);
  });

  it("starts at 0 when it has never been on the mesh", async () => {
    const h = await createTestScene({ units: [testUnit("p1", 45, 45, { z: 30 })] });
    expect(h.probe.unit("p1")!.floorY).toBe(0);
    // Its logged height still lifts it into the air.
    expect(h.probe.unit("p1")!.base.y).toBe(30);
  });

  it("without the mesh every unit stands at 0, whatever its logged height", async () => {
    const h = await createTestScene({ mesh: false, units: [testUnit("p1", UNDER_BALCONY, 0, { z: 10.5 })] });
    expect(h.probe.unit("p1")!.floorY).toBe(0);
    expect(h.probe.unit("p1")!.base.y).toBe(0);
  });
});
