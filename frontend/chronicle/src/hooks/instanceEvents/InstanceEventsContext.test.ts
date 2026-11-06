import { describe, expect, it } from "vitest";

import { getStreamEndpoint } from "./eventStreamLocation";

describe("getStreamEndpoint", () => {
  it("uses the Chronicle compatibility endpoint for database streams", () => {
    expect(getStreamEndpoint("instance-id", "damage", { storage: "database" })).toBe(
      "/api/v1/raidlogs/instances/instance-id/events/damage",
    );
  });

  it("uses the external object URL for R2 streams", () => {
    expect(getStreamEndpoint("instance-id", "heal", {
      storage: "r2",
      baseUrl: "https://events.chronicleclassic.com/",
      path: "/events/group-id/instance-id",
    })).toBe("https://events.chronicleclassic.com/events/group-id/instance-id/heal");
  });

  it("falls back to Chronicle until the external location is fully configured", () => {
    expect(getStreamEndpoint("instance-id", "aura", {
      storage: "r2",
      baseUrl: "https://events.chronicleclassic.com",
    })).toBe("/api/v1/raidlogs/instances/instance-id/events/aura");
  });
});
