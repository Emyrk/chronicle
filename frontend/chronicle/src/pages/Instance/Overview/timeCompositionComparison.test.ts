import { describe, expect, it } from "vitest";
import { relativeDurationLabel } from "./timeCompositionComparison";

describe("relativeDurationLabel", () => {
  it("describes relative performance for complete raids", () => {
    expect(relativeDurationLabel(-10_000, 20, "total")).toBe("20% faster");
    expect(relativeDurationLabel(10_000, 20, "component")).toBe("20% slower");
    expect(relativeDurationLabel(0, 0, "total")).toBe("Same pace");
    expect(relativeDurationLabel(0, 0, "component")).toBe("Same");
  });
});
