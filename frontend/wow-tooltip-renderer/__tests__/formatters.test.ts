import { describe, it, expect } from "vitest";
import { formatCooldown } from "../src/spell/formatters.js";
import { makeSpell } from "./fixtures.js";

// recovery_time / category_recovery_time are nanoseconds (Go time.Duration).
const SEC = 1_000_000_000;

describe("formatCooldown", () => {
  it("formats recovery_time (nanoseconds) as seconds", () => {
    // Anti-Magic Shell: recovery 45s -> 45 sec
    expect(formatCooldown(makeSpell({ recovery_time: 45 * SEC }))).toBe(
      "45 sec cooldown",
    );
  });

  it("formats long cooldowns as minutes", () => {
    // Mark of Blood: recovery 180s -> 3 min
    expect(formatCooldown(makeSpell({ recovery_time: 180 * SEC }))).toBe(
      "3 min cooldown",
    );
  });

  it("falls back to category_recovery_time when recovery_time is 0", () => {
    // Power Word: Shield: recovery 0, category 4s -> 4 sec
    expect(
      formatCooldown(makeSpell({ recovery_time: 0, category_recovery_time: 4 * SEC })),
    ).toBe("4 sec cooldown");
  });

  it("uses the larger of recovery and category recovery", () => {
    expect(
      formatCooldown(
        makeSpell({ recovery_time: 1.5 * SEC, category_recovery_time: 4 * SEC }),
      ),
    ).toBe("4 sec cooldown");
  });

  it("returns null when there is no cooldown", () => {
    expect(formatCooldown(makeSpell({ recovery_time: 0, category_recovery_time: 0 }))).toBeNull();
  });
});
