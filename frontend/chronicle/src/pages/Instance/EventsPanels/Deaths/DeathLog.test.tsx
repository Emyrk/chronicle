import { describe, expect, it } from "vitest";
import { createDeathLogPanel } from "./DeathLog";

describe("Death Log filters", () => {
  it("defaults to hiding zero-effective heals with an editable filter", () => {
    const panel = createDeathLogPanel();

    expect(panel.supportsFiltering).toBe(true);
    expect(panel.defaultFilters).toContainEqual({
      type: "event_value",
      value: "!=:0",
      applyTo: ["heal"],
    });
    expect(panel.fixedFilters).toBeUndefined();
  });
});
