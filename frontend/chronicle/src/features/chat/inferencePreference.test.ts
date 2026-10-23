import { describe, expect, it } from "vitest";
import type { InferenceSettings } from "@/api/typesGenerated";
import { inferenceStatus } from "./inferencePreference";

function settings(overrides: Partial<InferenceSettings> = {}): InferenceSettings {
  return {
    available: true,
    disabled: false,
    enabled: true,
    service_available: true,
    ...overrides,
  };
}

describe("inferenceStatus", () => {
  it("reports enabled access", () => {
    expect(inferenceStatus(settings())).toBe("enabled");
  });

  it("distinguishes a user opt-out", () => {
    expect(inferenceStatus(settings({ disabled: true, enabled: false }))).toBe("disabled");
  });

  it("distinguishes account capability from deployment availability", () => {
    expect(inferenceStatus(settings({ available: false, enabled: false }))).toBe("not-capable");
    expect(inferenceStatus(settings({ service_available: false, enabled: false }))).toBe("unavailable");
  });
});
