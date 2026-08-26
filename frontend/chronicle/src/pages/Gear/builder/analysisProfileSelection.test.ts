import { describe, expect, it } from "vitest";
import { findProfileToHydrate } from "./analysisProfileSelection";

const profiles = [{ id: "profile-a" }, { id: "profile-b" }];

describe("findProfileToHydrate", () => {
  it("hydrates an external profile ID once", () => {
    expect(findProfileToHydrate("profile-a", null, profiles)).toEqual(profiles[0]);
    expect(findProfileToHydrate("profile-a", "profile-a", profiles)).toBeUndefined();
  });

  it("does not reapply the previous profile while a new picker selection is pending", () => {
    expect(findProfileToHydrate("profile-a", "profile-a", profiles)).toBeUndefined();
    expect(findProfileToHydrate("profile-b", "profile-a", profiles)).toEqual(profiles[1]);
  });

  it("waits for asynchronously loaded options", () => {
    expect(findProfileToHydrate("profile-a", null, [])).toBeUndefined();
    expect(findProfileToHydrate("profile-a", null, profiles)).toEqual(profiles[0]);
  });
});
