import { describe, expect, it } from "vitest";
import {
  dismissMapTelemetryWarning,
  hasLimitedHostilePositionTelemetry,
  isMapTelemetryWarningDismissed,
  MAP_TELEMETRY_WARNING_CACHE_SIZE,
} from "./mapTelemetryWarning";

describe("map telemetry warning", () => {
  it("warns for allied-only position telemetry", () => {
    expect(hasLimitedHostilePositionTelemetry({
      capabilities: ["unit-position"],
      versions: { superwow: "2.2" },
    })).toBe(true);

    expect(hasLimitedHostilePositionTelemetry({
      capabilities: ["unit-position"],
      versions: { superwow: "2.2", classicapi: "1.13.2" },
    })).toBe(false);

    expect(hasLimitedHostilePositionTelemetry({
      capabilities: ["unit-position"],
      format: "3.3.5a-cc-addon",
      versions: { wow: "3.3.5a" },
    })).toBe(true);

    expect(hasLimitedHostilePositionTelemetry({
      capabilities: [],
      format: "3.3.5a-cc-addon",
      versions: { wow: "3.3.5a" },
    })).toBe(false);

    expect(hasLimitedHostilePositionTelemetry({
      capabilities: ["unit-position"],
      format: "azerothcore-mod",
      versions: { wow: "3.3.5a" },
    })).toBe(false);

    expect(hasLimitedHostilePositionTelemetry({
      capabilities: ["unit-position"],
      versions: { classicapi: "1.13.2" },
    })).toBe(false);
  });

  it("keeps the newest 20 dismissed instance ids and moves repeats to the front", () => {
    let dismissed = Array.from({ length: MAP_TELEMETRY_WARNING_CACHE_SIZE }, (_, index) => `instance-${index}`);

    dismissed = dismissMapTelemetryWarning(dismissed, "instance-new");
    expect(dismissed).toHaveLength(MAP_TELEMETRY_WARNING_CACHE_SIZE);
    expect(dismissed[0]).toBe("instance-new");
    expect(dismissed).not.toContain("instance-19");

    dismissed = dismissMapTelemetryWarning(dismissed, "instance-5");
    expect(dismissed[0]).toBe("instance-5");
    expect(dismissed.filter((id) => id === "instance-5")).toHaveLength(1);
  });

  it("ignores malformed stored values", () => {
    expect(isMapTelemetryWarningDismissed({ instance: "one" }, "one")).toBe(false);
    expect(dismissMapTelemetryWarning(["one", 2, "", null], "two")).toEqual(["two", "one"]);
  });
});
