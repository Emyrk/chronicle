import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuildResourceAnalyticsDay } from "@/api/typesGenerated";
import { buildSummary } from "./guildAnalytics";

function row(overrides: Partial<GuildResourceAnalyticsDay>): GuildResourceAnalyticsDay {
  return {
    resource_kind: "instance",
    resource_key: "canonical-slug",
    resource_group_key: "canonical-slug",
    resource_name: "Molten Core",
    viewed_on: new Date().toISOString().slice(0, 10),
    views: 0,
    unique_visitors: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-11T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildSummary", () => {
  it("merges duplicate instances and retains their member breakdown", () => {
    const rows = [
      row({ views: 4, unique_visitors: 2 }),
      row({
        resource_kind: "instance_member",
        resource_key: "canonical-slug",
        views: 2,
        unique_visitors: 1,
      }),
      row({
        resource_kind: "instance_member",
        resource_key: "duplicate-slug",
        views: 2,
        unique_visitors: 2,
      }),
    ];

    const total = buildSummary(rows, 7, "total");
    expect(total.instances).toHaveLength(1);
    expect(total.instances[0]).toMatchObject({
      key: "canonical-slug",
      total: 4,
    });
    expect(total.instances[0].members).toEqual([
      expect.objectContaining({ key: "canonical-slug", total: 2 }),
      expect.objectContaining({ key: "duplicate-slug", total: 2 }),
    ]);

    const unique = buildSummary(rows, 7, "unique");
    expect(unique.instances[0].total).toBe(2);
  });
});
