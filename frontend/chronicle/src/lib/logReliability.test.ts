import { describe, expect, it } from "vitest";
import { shouldShowChronicleCompanionWarning } from "./logReliability";

describe("shouldShowChronicleCompanionWarning", () => {
  it("does not warn for official Blizzard v9 logs", () => {
    expect(shouldShowChronicleCompanionWarning({ format: "v9-cleu" })).toBe(false);
  });

  it("does not warn when ChronicleCompanion metadata is present", () => {
    expect(shouldShowChronicleCompanionWarning({ versions: { addon: "1.0.0" } })).toBe(false);
    expect(
      shouldShowChronicleCompanionWarning({ versions: { chronicle_companion: "1.0.0" } }),
    ).toBe(false);
  });

  it("does not warn for server-side logs", () => {
    expect(
      shouldShowChronicleCompanionWarning({ capabilities: ["server-side"] }),
    ).toBe(false);
  });

  it("warns for client-side logs without ChronicleCompanion", () => {
    expect(shouldShowChronicleCompanionWarning({ format: "1.12a" })).toBe(true);
  });
});
