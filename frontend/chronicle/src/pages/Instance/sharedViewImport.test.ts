import { describe, expect, it } from "vitest";
import { readSharedTimeRange, sameEncounterSelection, validateSharedViewPayload } from "./sharedViewImport";

describe("validateSharedViewPayload", () => {
  it("ignores a stale instance ID embedded before a reparse", () => {
    const payload = {
      version: 1,
      instanceId: "old-instance-id",
      layout: { items: [{ id: "panel-1" }] },
    };

    const validated = validateSharedViewPayload(payload, "current-instance-id", "current-instance-id");

    expect(validated).toBe(payload);
    expect(validated.instanceId).toBe("old-instance-id");
  });

  it("rejects a share that resolves to a different loaded instance", () => {
    expect(() => validateSharedViewPayload({}, "shared-instance-id", "loaded-instance-id"))
      .toThrow("Shared view belongs to a different instance");
  });

  it("rejects non-object payloads", () => {
    expect(() => validateSharedViewPayload(null, "instance-id", "instance-id"))
      .toThrow("Shared view payload is invalid");
  });
});

describe("readSharedTimeRange", () => {
  it("returns a valid shared time range", () => {
    expect(readSharedTimeRange({
      view: { timeRange: { startMs: 5000, endMs: 15000 } },
    })).toEqual({ startMs: 5000, endMs: 15000 });
  });

  it.each([
    {},
    { view: {} },
    { view: { timeRange: { startMs: -1, endMs: 1000 } } },
    { view: { timeRange: { startMs: 1000, endMs: 1000 } } },
    { view: { timeRange: { startMs: "1000", endMs: 2000 } } },
  ])("rejects a missing or invalid shared time range", (payload) => {
    expect(readSharedTimeRange(payload)).toBeNull();
  });
});

describe("sameEncounterSelection", () => {
  it("matches the imported encounter selection regardless of order", () => {
    expect(sameEncounterSelection(["encounter-2", "encounter-1"], ["encounter-1", "encounter-2"])).toBe(true);
  });

  it("rejects a different encounter selection", () => {
    expect(sameEncounterSelection(["encounter-1"], ["encounter-1", "encounter-2"])).toBe(false);
    expect(sameEncounterSelection(["encounter-1"], ["encounter-2"])).toBe(false);
  });
});
