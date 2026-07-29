import { describe, expect, it } from "vitest";
import { createRolesPanel } from "./Roles";

describe("Roles panel", () => {
  it("manages full encounter aggregation independently of Sync mode", () => {
    const panel = createRolesPanel();

    expect(panel.selfManagesAggregation).toBe(true);
    expect(panel.syncDataMode).toBe("full");
  });
});
