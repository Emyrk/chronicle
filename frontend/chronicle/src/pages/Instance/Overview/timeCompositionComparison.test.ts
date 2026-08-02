import { describe, expect, it } from "vitest";
import { relativeDurationLabel } from "./timeCompositionComparison";

describe("relativeDurationLabel", () => {
  it("uses performance language for complete raids", () => {
    expect(relativeDurationLabel(-10_000, 20, true, "total")).toBe("20% faster");
    expect(relativeDurationLabel(10_000, 20, true, "component")).toBe("20% slower");
    expect(relativeDurationLabel(0, 0, true, "total")).toBe("Same pace");
  });

  it("uses neutral duration language for partial raids", () => {
    expect(relativeDurationLabel(-10_000, 20, false, "total")).toBe("20% shorter");
    expect(relativeDurationLabel(10_000, 20, false, "total")).toBe("20% longer");
    expect(relativeDurationLabel(-10_000, 20, false, "component")).toBe("20% less time");
    expect(relativeDurationLabel(10_000, 20, false, "component")).toBe("20% more time");
    expect(relativeDurationLabel(0, 0, false, "total")).toBe("Same duration");
  });
});
