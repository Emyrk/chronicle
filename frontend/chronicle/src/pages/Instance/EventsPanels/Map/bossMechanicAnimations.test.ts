import { describe, expect, it } from "vitest";
import {
  activeBossMechanicAnimation,
  bossMechanicAnimationForSpell,
  recordBossMechanicAnimationAura,
  type BossMechanicAnimationInterval,
} from "./bossMechanicAnimations";

describe("bossMechanicAnimations", () => {
  it("registers Herod's Whirlwind clip by spell ID", () => {
    expect(bossMechanicAnimationForSpell(8989)).toMatchObject({
      key: "herod-whirlwind",
      candidates: ["Whirlwind"],
      loop: true,
    });
    expect(bossMechanicAnimationForSpell(6603)).toBeNull();
  });

  it("follows aura lifetimes deterministically while scrubbing", () => {
    const intervals = new Map<string, BossMechanicAnimationInterval[]>();
    expect(recordBossMechanicAnimationAura(intervals, "herod", 6603, 1_000, true)).toBe(false);
    expect(recordBossMechanicAnimationAura(intervals, "herod", 8989, 12_965, true)).toBe(true);
    expect(recordBossMechanicAnimationAura(intervals, "herod", 8989, 22_965, false)).toBe(true);

    expect(activeBossMechanicAnimation(intervals, "herod", 12_964)).toBeNull();
    expect(activeBossMechanicAnimation(intervals, "herod", 12_965)).toMatchObject({
      definition: { key: "herod-whirlwind", candidates: ["Whirlwind"], loop: true },
      startedAtMs: 12_965,
    });
    expect(activeBossMechanicAnimation(intervals, "herod", 22_964)).not.toBeNull();
    expect(activeBossMechanicAnimation(intervals, "herod", 22_965)).toBeNull();
    expect(activeBossMechanicAnimation(intervals, "herod", 15_000)).not.toBeNull();
  });

  it("closes and restarts an interval when an aura refreshes", () => {
    const intervals = new Map<string, BossMechanicAnimationInterval[]>();
    recordBossMechanicAnimationAura(intervals, "boss", 8989, 1_000, true);
    recordBossMechanicAnimationAura(intervals, "boss", 8989, 4_000, true);
    expect(intervals.get("boss")).toEqual([
      { definitionKey: "herod-whirlwind", spellId: 8989, startMs: 1_000, endMs: 4_000 },
      { definitionKey: "herod-whirlwind", spellId: 8989, startMs: 4_000, endMs: Infinity },
    ]);
  });
});
