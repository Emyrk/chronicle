import { describe, expect, it } from "vitest";
import { validateSharedViewPayload } from "./sharedViewImport";

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
