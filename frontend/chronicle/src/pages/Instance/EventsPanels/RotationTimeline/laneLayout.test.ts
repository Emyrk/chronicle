import { describe, expect, it } from "vitest";
import { laneLayout } from "./laneLayout";

describe("laneLayout", () => {
  it("grows auto icons with zoom between 22 and 60px", () => {
    expect(laneLayout(0.02, "auto").icon).toBe(22); // 32px per GCD
    expect(laneLayout(0.04, "auto").icon).toBe(38); // 64px per GCD → 60%
    expect(laneLayout(1, "auto").icon).toBe(60);
  });

  it("uses fixed sizes for S / M / L", () => {
    expect(laneLayout(1, "s").icon).toBe(22);
    expect(laneLayout(0.001, "l").icon).toBe(48);
  });

  it("falls back to ticks only on auto when a GCD is too narrow", () => {
    expect(laneLayout(0.005, "auto").compact).toBe(true); // 8px per GCD
    expect(laneLayout(0.005, "m").compact).toBe(false);
  });

  it("sizes procs and cooldowns from the cast icon", () => {
    const l = laneLayout(0.1, "auto"); // 60px icons
    expect(l.proc).toBe(20);
    expect(l.cooldown).toBe(26);
  });

  it("shows names only with large icons and room between casts", () => {
    expect(laneLayout(0.1, "auto").showNames).toBe(true);
    expect(laneLayout(0.04, "auto").showNames).toBe(false);
  });

  it("makes the lane tall enough for the rail below the labels", () => {
    const l = laneLayout(0.04, "auto");
    expect(l.railTop).toBeGreaterThan(l.labelTop);
    expect(l.height).toBeGreaterThan(l.railTop + l.cooldown / 2);
  });
});
