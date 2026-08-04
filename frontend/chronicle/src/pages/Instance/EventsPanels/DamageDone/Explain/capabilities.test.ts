/**
 * Tests for capability derivation and lesson state resolution.
 */

import { describe, it, expect } from "vitest";
import {
  deriveCapabilities,
  resolveLessonState,
  LESSONS,
  type CapabilitySummary,
} from "./capabilities";
import { getFixtureResult, FIXTURE_DURATION_MS } from "./fixture";

// ── deriveCapabilities ──

describe("deriveCapabilities", () => {
  it("returns all-false for null result", () => {
    const caps = deriveCapabilities(null, 120_000);
    expect(caps.hasMultiplePlayers).toBe(false);
    expect(caps.hasAbilityBreakout).toBe(false);
    expect(caps.hasTargetBreakout).toBe(false);
    expect(caps.hasDetailedStats).toBe(false);
    expect(caps.hasSpellRanks).toBe(false);
    expect(caps.hasFocusTarget).toBe(false);
    expect(caps.hasDuration).toBe(true); // duration was > 0
  });

  it("returns all-false for undefined result", () => {
    const caps = deriveCapabilities(undefined, 0);
    expect(caps.hasDuration).toBe(false);
  });

  it("derives full capabilities from the curated fixture", () => {
    const result = getFixtureResult();
    const caps = deriveCapabilities(result, FIXTURE_DURATION_MS);
    expect(caps.hasMultiplePlayers).toBe(true);
    expect(caps.hasAbilityBreakout).toBe(true);
    expect(caps.hasTargetBreakout).toBe(true);
    expect(caps.hasDetailedStats).toBe(true);
    expect(caps.hasSpellRanks).toBe(true);
    expect(caps.hasFocusTarget).toBe(true);
    expect(caps.hasDuration).toBe(true);
  });

  it("detects zero duration", () => {
    const result = getFixtureResult();
    const caps = deriveCapabilities(result, 0);
    expect(caps.hasDuration).toBe(false);
  });
});

// ── resolveLessonState ──

describe("resolveLessonState", () => {
  const fullCaps: CapabilitySummary = {
    hasMultiplePlayers: true,
    hasAbilityBreakout: true,
    hasTargetBreakout: true,
    hasDetailedStats: true,
    hasSpellRanks: true,
    hasFocusTarget: true,
    hasDuration: true,
  };

  const emptyCaps: CapabilitySummary = {
    hasMultiplePlayers: false,
    hasAbilityBreakout: false,
    hasTargetBreakout: false,
    hasDetailedStats: false,
    hasSpellRanks: false,
    hasFocusTarget: false,
    hasDuration: false,
  };

  it("reading-chart: available with multiple players", () => {
    expect(resolveLessonState("reading-chart", fullCaps)).toBe("available");
  });

  it("reading-chart: limited with single player", () => {
    expect(resolveLessonState("reading-chart", { ...fullCaps, hasMultiplePlayers: false })).toBe("limited");
  });

  it("dps-vs-total: available with players and duration", () => {
    expect(resolveLessonState("dps-vs-total", fullCaps)).toBe("available");
  });

  it("dps-vs-total: example-required without duration", () => {
    expect(resolveLessonState("dps-vs-total", emptyCaps)).toBe("example-required");
  });

  it("dps-vs-total: limited with duration but no multiple players", () => {
    expect(resolveLessonState("dps-vs-total", { ...emptyCaps, hasDuration: true })).toBe("limited");
  });

  it("parse-scores: always example-required", () => {
    expect(resolveLessonState("parse-scores", fullCaps)).toBe("example-required");
  });

  it("breakout-box: available with ability breakout", () => {
    expect(resolveLessonState("breakout-box", fullCaps)).toBe("available");
  });

  it("breakout-box: example-required without ability breakout", () => {
    expect(resolveLessonState("breakout-box", emptyCaps)).toBe("example-required");
  });

  it("abilities-vs-targets: available with both", () => {
    expect(resolveLessonState("abilities-vs-targets", fullCaps)).toBe("available");
  });

  it("abilities-vs-targets: limited with only ability", () => {
    expect(resolveLessonState("abilities-vs-targets", { ...emptyCaps, hasAbilityBreakout: true })).toBe("limited");
  });

  it("abilities-vs-targets: example-required with neither", () => {
    expect(resolveLessonState("abilities-vs-targets", emptyCaps)).toBe("example-required");
  });

  it("detailed-results: available with detailed stats", () => {
    expect(resolveLessonState("detailed-results", fullCaps)).toBe("available");
  });

  it("detailed-results: limited with ability but no stats", () => {
    expect(resolveLessonState("detailed-results", { ...emptyCaps, hasAbilityBreakout: true })).toBe("limited");
  });

  it("spell-ranks: available with spell ranks", () => {
    expect(resolveLessonState("spell-ranks", fullCaps)).toBe("available");
  });

  it("spell-ranks: limited with ability breakout but no ranks", () => {
    expect(resolveLessonState("spell-ranks", { ...emptyCaps, hasAbilityBreakout: true })).toBe("limited");
  });

  it("focus: available with focus target and ability breakout", () => {
    expect(resolveLessonState("focus", fullCaps)).toBe("available");
  });

  it("focus: limited with focus target but no breakout", () => {
    expect(resolveLessonState("focus", { ...emptyCaps, hasFocusTarget: true })).toBe("limited");
  });

  it("focus: example-required without focus target", () => {
    expect(resolveLessonState("focus", emptyCaps)).toBe("example-required");
  });

  it("all lesson IDs are covered", () => {
    for (const lesson of LESSONS) {
      const state = resolveLessonState(lesson.id, fullCaps);
      expect(["available", "limited", "example-required"]).toContain(state);
    }
  });

  it("every lesson has a valid category", () => {
    for (const lesson of LESSONS) {
      expect(["essentials", "deeper"]).toContain(lesson.category);
    }
  });

  it("essentials category has 4 lessons", () => {
    expect(LESSONS.filter((l) => l.category === "essentials")).toHaveLength(4);
  });

  it("deeper category has 4 lessons", () => {
    expect(LESSONS.filter((l) => l.category === "deeper")).toHaveLength(4);
  });
});
