import { describe, expect, it } from "vitest";
import { createUnitAurasPanel } from "./UnitAuras";

describe("Unit Auras panel", () => {
  it("uses the panel checkbox to opt into the Detailed view", () => {
    const panel = createUnitAurasPanel();

    expect(panel.supportsPerSecond).toBe(true);
    expect(panel.checkboxLabel).toBe("Detailed");
  });
});
