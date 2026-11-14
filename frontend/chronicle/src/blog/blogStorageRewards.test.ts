import { describe, expect, it } from "vitest";
import { blogRewardSuccessMessage } from "./blogStorageRewards";

const now = Date.parse("2026-01-01T00:00:00Z");
const future = "2026-02-01T00:00:00Z";
const past = "2025-12-01T00:00:00Z";

describe("blog storage rewards", () => {
  it("distinguishes first earns from active refreshes for both categories", () => {
    for (const category of ["vote", "feedback"] as const) {
      expect(blogRewardSuccessMessage({ eligible: true }, category, true, now)).toContain("earned");
      expect(blogRewardSuccessMessage({ eligible: true, expires_at: future }, category, true, now)).toContain("refreshed");
      expect(blogRewardSuccessMessage({ eligible: true, expires_at: past }, category, true, now)).toContain("earned");
    }
  });
  it("never announces rewards for omitted state, repeat interactions, or vote removal", () => {
    expect(blogRewardSuccessMessage(undefined, "vote", true, now)).toBeUndefined();
    expect(blogRewardSuccessMessage({ eligible: true }, "vote", false, now)).toBeUndefined();
    for (const category of ["vote", "feedback"] as const) {
      expect(blogRewardSuccessMessage({ eligible: false, expires_at: future }, category, true, now)).toBeUndefined();
      expect(blogRewardSuccessMessage({ eligible: false, expires_at: past }, category, true, now)).toBeUndefined();
    }
  });
  it("includes the category amount and 60-day duration", () => {
    expect(blogRewardSuccessMessage({ eligible: true }, "vote", true, now)).toContain("+2 MB for 60 days");
    expect(blogRewardSuccessMessage({ eligible: true }, "feedback", true, now)).toContain("+5 MB for 60 days");
  });
});
