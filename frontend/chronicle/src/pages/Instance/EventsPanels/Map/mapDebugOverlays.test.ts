import { describe, expect, it } from "vitest";
import { mapDebugOverlays, projectMapDebugPath } from "./mapDebugOverlays";

describe("mapDebugOverlays", () => {
  it("registers Onyxia's three fixed lanes only for Onyxia's Lair", () => {
    expect(mapDebugOverlays(249).map((overlay) => overlay.id)).toEqual([
      "onyxia-deep-breath-middle",
      "onyxia-deep-breath-southwest_northeast",
      "onyxia-deep-breath-northwest_southeast",
    ]);
    expect(mapDebugOverlays(409)).toEqual([]);
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
