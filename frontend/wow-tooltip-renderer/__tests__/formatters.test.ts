import { describe, it, expect } from "vitest";
import { formatCooldown } from "../src/spell/formatters.js";
import { makeSpell } from "./fixtures.js";

describe("formatCooldown", () => {
  it("formats recovery_time (milliseconds) as seconds", () => {
    // Anti-Magic Shell: recovery 45000 ms -> 45 sec
    expect(formatCooldown(makeSpell({ recovery_time: 45000 }))).toBe(
      "45 sec cooldown",
    );
  });

  it("formats long cooldowns as minutes", () => {
    // Mark of Blood: recovery 180000 ms -> 3 min
    expect(formatCooldown(makeSpell({ recovery_time: 180000 }))).toBe(
      "3 min cooldown",
    );
  });

  it("falls back to category_recovery_time when recovery_time is 0", () => {
    // Power Word: Shield: recovery 0, category 4000 ms -> 4 sec
    expect(
      formatCooldown(makeSpell({ recovery_time: 0, category_recovery_time: 4000 })),
    ).toBe("4 sec cooldown");
  });

  it("uses the larger of recovery and category recovery", () => {
    expect(
      formatCooldown(
        makeSpell({ recovery_time: 1500, category_recovery_time: 4000 }),
      ),
    ).toBe("4 sec cooldown");
  });

  it("returns null when there is no cooldown", () => {
    expect(formatCooldown(makeSpell({ recovery_time: 0, category_recovery_time: 0 }))).toBeNull();
  });
});
