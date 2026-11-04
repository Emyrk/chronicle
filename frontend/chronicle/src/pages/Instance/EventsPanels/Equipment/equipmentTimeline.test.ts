import { describe, expect, it } from "vitest";
import type { PlayerSnapshot } from "./equipment.processor";
import { buildEquipmentTimeline } from "./equipmentTimeline";

function item(itemId: number, itemLevel = 60): PlayerSnapshot["gear"][number] {
  return {
    itemId,
    enchantId: null,
    temporaryEnchantId: null,
    gemEnchantIds: [],
    itemLevel: itemId > 0 ? itemLevel : null,
    bonusIds: [],
    gems: [],
  };
}

function snapshot(offsetMilli: number, overrides?: {
  head?: number;
  ringA?: number;
  ringB?: number;
  talents?: { summary: number[]; trees: string[] } | null;
}): PlayerSnapshot {
  const gear = Array.from({ length: 19 }, () => item(0));
  gear[0] = item(overrides?.head ?? 100, overrides?.head === 200 ? 70 : 60);
  gear[10] = item(overrides?.ringA ?? 300);
  gear[11] = item(overrides?.ringB ?? 400);
  return {
    guid: "player",
    name: "Player",
    heroClass: "Mage",
    offsetMilli,
    race: "Human",
    gender: 0,
    guildName: null,
    gear,
    gearCount: gear.length,
    talents: overrides?.talents === undefined
      ? { summary: [31, 0, 20], trees: ["500", "", "300"] }
      : overrides.talents,
  };
}

describe("buildEquipmentTimeline", () => {
  it("builds gear and talent change segments in timestamp order", () => {
    const timeline = buildEquipmentTimeline([
      snapshot(20_000, { head: 200, ringA: 400, ringB: 300, talents: { summary: [0, 31, 20], trees: ["", "500", "300"] } }),
      snapshot(0),
      snapshot(10_000),
    ]);

    expect(timeline).not.toBeNull();
    expect(timeline?.start).toBe(0);
    expect(timeline?.end).toBe(20_000);
    expect(timeline?.snapshotCount).toBe(3);
    expect(timeline?.changedSlots).toBe(1);
    expect(timeline?.slots.find((slot) => slot.slot === 0)?.segments.map((segment) => segment.item.itemId)).toEqual([100, 200]);
    expect(timeline?.slots.find((slot) => slot.slot === 10)?.segments).toHaveLength(1);
    expect(timeline?.slots.find((slot) => slot.slot === 11)?.segments).toHaveLength(1);
    expect(timeline?.specs.map((segment) => segment.talents?.summary ?? null)).toEqual([[31, 0, 20], [0, 31, 20]]);
  });

  it("tracks missing talents and gem-only changes as timeline transitions", () => {
    const first = snapshot(0);
    const second = snapshot(10_000, { talents: null });
    second.gear[0].gems = [{ itemId: 111, itemLevel: 60 }];

    const timeline = buildEquipmentTimeline([first, second]);

    expect(timeline?.specs.map((segment) => segment.talents?.summary ?? null)).toEqual([[31, 0, 20], null]);
    expect(timeline?.slots.find((slot) => slot.slot === 0)?.segments).toHaveLength(2);
  });

  it("returns a single full-state timeline for one snapshot", () => {
    const only = snapshot(5_000);
    only.endOffsetMilli = 15_000;
    const timeline = buildEquipmentTimeline([only]);

    expect(timeline?.start).toBe(5_000);
    expect(timeline?.end).toBe(15_000);
    expect(timeline?.changedSlots).toBe(0);
    expect(timeline?.specs).toHaveLength(1);
  });
});
