import { describe, expect, it } from "vitest";
import { relativeDurationLabel } from "./timeCompositionComparison";

describe("relativeDurationLabel", () => {
  it("uses performance language for complete raids", () => {
    expect(relativeDurationLabel(-10_000, 20, true, "total")).toBe("20% faster");
    expect(relativeDurationLabel(10_000, 20, true, "component")).toBe("20% slower");
    expect(relativeDurationLabel(0, 0, true, "total")).toBe("Same pace");
  });

  it("omits percentage judgments for partial raids", () => {
    expect(relativeDurationLabel(-10_000, 20, false, "total")).toBe("Partial raid");
    expect(relativeDurationLabel(10_000, 20, false, "total")).toBe("Partial raid");
    expect(relativeDurationLabel(-10_000, 20, false, "component")).toBe("Less time");
    expect(relativeDurationLabel(10_000, 20, false, "component")).toBe("More time");
    expect(relativeDurationLabel(0, 0, false, "component")).toBe("Same time");
  });
});
