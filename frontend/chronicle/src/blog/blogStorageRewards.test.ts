import { describe, expect, it } from "vitest";
import { blogRewardDescription, blogRewardSuccessMessage } from "./blogStorageRewards";

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
  it("shows active expiry and an eligible post's refresh opportunity", () => {
    const text = blogRewardDescription({ eligible: true, expires_at: future }, "vote", true, now);
    expect(text).toContain("+2 MB active. Expires");
    expect(text).toContain("Refresh it for 60 days");
  });
  it("shows expiry without promising another reward on the same post", () => {
    const text = blogRewardDescription({ eligible: false, expires_at: past }, "feedback", true, now);
    expect(text).toContain("+5 MB expired");
    expect(text).toContain("Already earned on this post");
    expect(text).not.toContain("Earn it");
  });
  it("treats exact expiry as expired and handles malformed dates safely", () => {
    expect(blogRewardDescription({ eligible: true, expires_at: new Date(now).toISOString() }, "vote", true, now)).toContain("expired");
    expect(blogRewardDescription({ eligible: true, expires_at: "invalid" }, "vote", true, now)).not.toContain("Invalid Date");
  });
});
