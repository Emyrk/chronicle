import { describe, expect, it } from "vitest";
import type { ArmoryGearSnapshot, PlayerGear, PlayerOutfit } from "@/api/typesGenerated";
import { buildGearTimeline, gearAt } from "./gearTimeline";

function outfit(items: Record<number, number>): PlayerOutfit {
  return Array.from({ length: 19 }, (_, slot): PlayerGear => ({ item_id: items[slot] ?? 0 })) as unknown as PlayerOutfit;
}

function snapshot(day: number, items: Record<number, number>, overrides: Partial<ArmoryGearSnapshot> = {}): ArmoryGearSnapshot {
  return {
    instance_id: `instance-${day}`,
    instance_name: "Molten Core",
    equipped_at: `2026-07-${String(day).padStart(2, "0")}T20:00:00Z`,
    avg_ilvl: 60 + day,
    gear: outfit(items),
    ...overrides,
  };
}

const slot = (timeline: ReturnType<typeof buildGearTimeline>, index: number) =>
  timeline!.slots.find((item) => item.slot === index)!;

describe("buildGearTimeline", () => {
  it("builds one segment per run of the same item, oldest first", () => {
    // Snapshots arrive newest first from the endpoint.
    const timeline = buildGearTimeline([
      snapshot(3, { 0: 200 }),
      snapshot(2, { 0: 100 }),
      snapshot(1, { 0: 100 }),
    ], null, null);

    expect(timeline).toMatchObject({ snapshotCount: 3, changedSlots: 1 });
    expect(slot(timeline, 0).segments.map((segment) => [segment.item.item_id, segment.snapshotCount])).toEqual([[100, 2], [200, 1]]);
    expect(slot(timeline, 0).segments[0].end).toBe(Date.parse("2026-07-03T20:00:00Z"));
    expect(timeline!.itemLevels.map((point) => point.value)).toEqual([61, 62, 63]);
  });

  it("does not count rings or trinkets trading places as a change", () => {
    const timeline = buildGearTimeline([
      snapshot(1, { 10: 1, 11: 2, 12: 3, 13: 4 }),
      snapshot(2, { 10: 2, 11: 1, 12: 4, 13: 3 }),
      snapshot(3, { 10: 5, 11: 1 }),
    ], null, null);

    expect(slot(timeline, 11).segments.map((segment) => segment.item.item_id)).toEqual([2, 5]);
    expect(slot(timeline, 10).segments.map((segment) => segment.item.item_id)).toEqual([1]);
    expect(slot(timeline, 12).segments.map((segment) => segment.item.item_id)).toEqual([3]);
  });

  it("finds the item worn at a time", () => {
    const timeline = buildGearTimeline([
      snapshot(1, { 0: 100 }),
      snapshot(2, {}),
      snapshot(3, { 0: 200 }),
    ], null, null)!;
    const head = slot(timeline, 0);
    expect(timeline.times).toHaveLength(3);
    expect(gearAt(head, timeline.times[0])?.item.item_id).toBe(100);
    expect(gearAt(head, timeline.times[1])).toBeNull();
    expect(head.segments.map((segment) => [segment.item.item_id, segment.end])).toEqual([[100, timeline.times[1]], [200, timeline.times[2]]]);
    expect(gearAt(head, timeline.times[2])?.item.item_id).toBe(200);
  });

  it("filters by raid and start time", () => {
    const snapshots = [
      snapshot(1, { 0: 100 }),
      snapshot(2, { 0: 999 }, { instance_name: "Blackwing Lair" }),
      snapshot(3, { 0: 200 }),
    ];
    expect(slot(buildGearTimeline(snapshots, "Molten Core", null), 0).segments.map((segment) => segment.item.item_id)).toEqual([100, 200]);
    expect(buildGearTimeline(snapshots, "Molten Core", 1, Date.parse("2026-07-04T00:00:00Z"))?.snapshotCount).toBe(1);
    expect(buildGearTimeline(snapshots, "Naxxramas", null)).toBeNull();
  });
});
