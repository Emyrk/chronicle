import { describe, expect, it } from "vitest";
import {
  deepBreathPathForPrimarySpell,
  deepBreathPathForSpell,
  deepBreathPointForSpell,
  ONYXIA_DEEP_BREATH_RADIUS_YARDS,
  ONYXIA_DEEP_BREATH_PATHS,
} from "./deepBreathLanes";

const EXPECTED_PRIMARY_SPELLS = [
  [17_086, "NORTH_TO_SOUTH", 20],
  [18_351, "SOUTH_TO_NORTH", 11],
  [18_576, "EAST_TO_WEST", 7],
  [18_609, "WEST_TO_EAST", 7],
  [18_564, "SE_TO_NW", 12],
  [18_584, "NW_TO_SE", 12],
  [18_596, "SW_TO_NE", 12],
  [18_617, "NE_TO_SW", 12],
] as const;

describe("Onyxia Deep Breath paths", () => {
  it("contains all eight directed server paths and all 93 ground targets", () => {
    expect(ONYXIA_DEEP_BREATH_PATHS).toHaveLength(8);
    expect(ONYXIA_DEEP_BREATH_PATHS.reduce((total, path) => total + path.points.length, 0)).toBe(93);
  });

  it("uses the verified SpellRadius ID 10 value", () => {
    expect(ONYXIA_DEEP_BREATH_RADIUS_YARDS).toBe(30);
  });

  it.each(EXPECTED_PRIMARY_SPELLS)("maps primary spell %i to %s", (spellId, key, pointCount) => {
    const path = deepBreathPathForPrimarySpell(spellId);
    expect(path?.key).toBe(key);
    expect(path?.points).toHaveLength(pointCount);
    expect(path?.points[0].spellId).toBe(spellId);
  });

  it("maps every chain member to one path and one ordered point", () => {
    const spellIds = new Set<number>();
    for (const path of ONYXIA_DEEP_BREATH_PATHS) {
      path.points.forEach((point, index) => {
        expect(point.mapId).toBe(249);
        expect(point.sequence).toBe(index + 1);
        expect(spellIds.has(point.spellId)).toBe(false);
        spellIds.add(point.spellId);
        expect(deepBreathPathForSpell(point.spellId)).toBe(path);
        expect(deepBreathPointForSpell(point.spellId)).toBe(point);
      });
    }
    expect(spellIds.size).toBe(93);
  });

  it("preserves the explicit non-monotonic NE to SW spell order", () => {
    expect(deepBreathPathForPrimarySpell(18_617)?.points.map((point) => point.spellId)).toEqual([
      18_617, 18_619, 18_620, 18_621, 18_622, 18_623,
      18_624, 18_625, 18_626, 18_627, 18_628, 18_618,
    ]);
  });

  it("preserves the asymmetric north/south server paths", () => {
    expect(deepBreathPathForPrimarySpell(17_086)?.points).toHaveLength(20);
    expect(deepBreathPathForPrimarySpell(18_351)?.points).toHaveLength(11);
  });

  it("does not resolve unrelated Heated Ground or ordinary spells", () => {
    expect(deepBreathPathForSpell(22_191)).toBeNull();
    expect(deepBreathPathForSpell(1)).toBeNull();
  });
});
