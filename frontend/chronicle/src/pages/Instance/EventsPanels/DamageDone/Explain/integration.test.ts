/**
 * Integration tests for Damage Done Explain view routing and live capability path.
 */

import { describe, it, expect } from "vitest";
import { isDamageDoneExplainType } from "./routing";
import { deriveCapabilities, resolveLessonState, LESSONS } from "./capabilities";
import { getFixtureResult, FIXTURE_DURATION_MS } from "./fixture";

describe("isDamageDoneExplainType", () => {
  it("returns true for damage_done", () => {
    expect(isDamageDoneExplainType("damage_done")).toBe(true);
  });

  it("returns true for enemy_damage_done", () => {
    expect(isDamageDoneExplainType("enemy_damage_done")).toBe(true);
  });

  it("returns false for healing_done", () => {
    expect(isDamageDoneExplainType("healing_done")).toBe(false);
  });

  it("returns false for sunder", () => {
    expect(isDamageDoneExplainType("sunder")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isDamageDoneExplainType("")).toBe(false);
  });

  it("returns false for damage_taken (not a damage-done variant)", () => {
    expect(isDamageDoneExplainType("damage_taken")).toBe(false);
  });
});

describe("live capability callback path", () => {
  it("full fixture triggers all non-parse lessons to available or limited", () => {
    const result = getFixtureResult();
    const caps = deriveCapabilities(result, FIXTURE_DURATION_MS);

    for (const lesson of LESSONS) {
      const state = resolveLessonState(lesson.id, caps);
      if (lesson.id === "parse-scores") {
        // Parse scores always require example due to API dependency
        expect(state).toBe("example-required");
      } else {
        expect(
          state === "available" || state === "limited",
          `${lesson.id} should be available or limited with full fixture, got ${state}`,
        ).toBe(true);
      }
    }
  });

  it("null result makes all lessons example-required or limited", () => {
    const caps = deriveCapabilities(null, 0);

    for (const lesson of LESSONS) {
      const state = resolveLessonState(lesson.id, caps);
      // With no data and no duration, nothing should be "available"
      expect(
        state === "example-required" || state === "limited",
        `${lesson.id} should not be available with null result, got ${state}`,
      ).toBe(true);
    }
  });

  it("InstancePageView routing: damage_done types bypass PanelExplainerView", () => {
    // This test verifies the routing logic used in InstancePageView.
    // The actual rendering requires browser context, but we can verify
    // the predicate that gates the routing decision.
    const damagePanels = ["damage_done", "enemy_damage_done"];
    const otherPanels = [
      "healing_done", "sunder", "damage_taken", "enemy_damage_taken",
      "roles", "pulls_and_cleanup",
    ];

    for (const pt of damagePanels) {
      expect(isDamageDoneExplainType(pt), `${pt} should use DamageDoneExplainView`).toBe(true);
    }
    for (const pt of otherPanels) {
      expect(isDamageDoneExplainType(pt), `${pt} should use legacy PanelExplainerView`).toBe(false);
    }
  });
});
