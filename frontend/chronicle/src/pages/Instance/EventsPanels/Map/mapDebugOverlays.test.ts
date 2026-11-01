import { describe, expect, it } from "vitest";
import { mapDebugOverlays, projectMapDebugPath, projectMapDebugPoints } from "./mapDebugOverlays";

describe("mapDebugOverlays", () => {
  it("registers all eight server paths only for Onyxia's Lair", () => {
    expect(mapDebugOverlays(249).map((overlay) => overlay.id)).toEqual([
      "onyxia-deep-breath-north_to_south",
      "onyxia-deep-breath-south_to_north",
      "onyxia-deep-breath-east_to_west",
      "onyxia-deep-breath-west_to_east",
      "onyxia-deep-breath-se_to_nw",
      "onyxia-deep-breath-nw_to_se",
      "onyxia-deep-breath-sw_to_ne",
      "onyxia-deep-breath-ne_to_sw",
    ]);
    expect(mapDebugOverlays(249).reduce((total, overlay) => total + overlay.points.length, 0)).toBe(93);
    expect(mapDebugOverlays(409)).toEqual([]);
  });

  it("projects every ordered server point without simplifying the path", () => {
    const overlay = mapDebugOverlays(249).find((candidate) => candidate.id.endsWith("nw_to_se"))!;
    const projected = projectMapDebugPoints(
      overlay.points,
      overlay.mapId,
      { minX: -150, maxX: 50, minY: -260, maxY: -160 },
      1,
      100,
    );
    expect(projected).toHaveLength(12);
    expect(projected[0]).not.toEqual(projected.at(-1));
  });

  it("projects a world path through the dungeon mesh transform", () => {
    const overlay = mapDebugOverlays(249)[0];
    const projected = projectMapDebugPath(
      overlay,
      { minX: -100, maxX: 100, minY: -300, maxY: -100 },
      1,
      100,
    );
    expect(projected).not.toBeNull();
    expect(projected!.length).toBeGreaterThan(40);
    expect(Math.hypot(projected!.direction.x, projected!.direction.z)).toBeCloseTo(1);
  });
});
