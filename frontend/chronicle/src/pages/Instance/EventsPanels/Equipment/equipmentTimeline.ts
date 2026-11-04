import type { PlayerSnapshot } from "./equipment.processor";

export const EQUIPMENT_TIMELINE_SLOTS = [
  { index: 0, label: "Head" },
  { index: 1, label: "Neck" },
  { index: 2, label: "Shoulder" },
  { index: 14, label: "Back" },
  { index: 4, label: "Chest" },
  { index: 8, label: "Wrist" },
  { index: 9, label: "Hands" },
  { index: 5, label: "Waist" },
  { index: 6, label: "Legs" },
  { index: 7, label: "Feet" },
  { index: 10, label: "Finger" },
  { index: 11, label: "Finger" },
  { index: 12, label: "Trinket" },
  { index: 13, label: "Trinket" },
  { index: 15, label: "Main Hand" },
  { index: 16, label: "Off Hand" },
  { index: 17, label: "Ranged" },
] as const;

const PAIRED_SLOTS: readonly (readonly [number, number])[] = [[10, 11], [12, 13]];

type GearItem = PlayerSnapshot["gear"][number];
export interface EquipmentTimelineSegment {
  item: GearItem;
  start: number;
  end: number;
  lastSeen: number;
}

export interface EquipmentSlotTimeline {
  slot: number;
  label: string;
  segments: EquipmentTimelineSegment[];
}

export interface EquipmentSpecSegment {
  talents: PlayerSnapshot["talents"];
  start: number;
  end: number;
  lastSeen: number;
}

export interface EquipmentTimeline {
  start: number;
  end: number;
  snapshotCount: number;
  changedSlots: number;
  itemLevels: { time: number; value: number }[];
  slots: EquipmentSlotTimeline[];
  specs: EquipmentSpecSegment[];
}

function itemKey(item: GearItem | undefined): string {
  if (!item || item.itemId <= 0) return "";
  return [
    item.itemId,
    item.enchantId ?? 0,
    item.temporaryEnchantId ?? 0,
    item.gemEnchantIds.join("."),
    item.gems.map((gem) => `${gem.itemId}.${gem.itemLevel}`).join("."),
    item.bonusIds.join("."),
  ].join(":");
}

function talentsKey(talents: PlayerSnapshot["talents"]): string {
  if (!talents) return "";
  return `${talents.summary.join("/")}:${talents.trees.join("-")}`;
}

function averageItemLevel(gear: readonly GearItem[]): number | null {
  const levels = gear.flatMap((item) => item.itemId > 0 && item.itemLevel != null ? [item.itemLevel] : []);
  if (levels.length === 0) return null;
  return levels.reduce((sum, level) => sum + level, 0) / levels.length;
}

/** Builds the in-instance gear and talent timeline from combatant-info snapshots. */
export function buildEquipmentTimeline(snapshots: readonly PlayerSnapshot[]): EquipmentTimeline | null {
  if (snapshots.length === 0) return null;

  const ordered = [...snapshots].sort((left, right) => left.offsetMilli - right.offsetMilli);
  let previousGear: GearItem[] | null = null;
  const normalized = ordered.map((snapshot) => {
    const gear = snapshot.gear.map((item) => ({ ...item }));
    if (previousGear) {
      for (const [left, right] of PAIRED_SLOTS) {
        const leftKey = itemKey(gear[left]);
        const rightKey = itemKey(gear[right]);
        const kept = leftKey === itemKey(previousGear[left]) || rightKey === itemKey(previousGear[right]);
        const crossed = leftKey === itemKey(previousGear[right]) || rightKey === itemKey(previousGear[left]);
        if (crossed && !kept) [gear[left], gear[right]] = [gear[right], gear[left]];
      }
    }
    previousGear = gear;
    return { ...snapshot, gear };
  });

  const start = normalized[0].offsetMilli;
  const end = Math.max(...normalized.map((snapshot) => snapshot.endOffsetMilli ?? snapshot.offsetMilli));
  const slots = EQUIPMENT_TIMELINE_SLOTS.map(({ index, label }) => {
    const segments: EquipmentTimelineSegment[] = [];
    let active: EquipmentTimelineSegment | null = null;
    let activeKey = "";
    for (const snapshot of normalized) {
      const item = snapshot.gear[index];
      const key = itemKey(item);
      const observedUntil = snapshot.endOffsetMilli ?? snapshot.offsetMilli;
      if (active && key === activeKey) {
        active.end = observedUntil;
        active.lastSeen = observedUntil;
        continue;
      }
      if (active) active.end = snapshot.offsetMilli;
      active = key && item ? {
        item,
        start: snapshot.offsetMilli,
        end: observedUntil,
        lastSeen: observedUntil,
      } : null;
      activeKey = key;
      if (active) segments.push(active);
    }
    return { slot: index, label, segments };
  });

  const specs: EquipmentSpecSegment[] = [];
  let activeSpec: EquipmentSpecSegment | null = null;
  let activeSpecKey = "";
  for (const snapshot of normalized) {
    const key = talentsKey(snapshot.talents);
    const observedUntil = snapshot.endOffsetMilli ?? snapshot.offsetMilli;
    if (activeSpec && key === activeSpecKey) {
      activeSpec.end = observedUntil;
      activeSpec.lastSeen = observedUntil;
      continue;
    }
    if (activeSpec) activeSpec.end = snapshot.offsetMilli;
    activeSpec = {
      talents: snapshot.talents,
      start: snapshot.offsetMilli,
      end: observedUntil,
      lastSeen: observedUntil,
    };
    activeSpecKey = key;
    specs.push(activeSpec);
  }

  return {
    start,
    end,
    snapshotCount: normalized.length,
    changedSlots: slots.filter((slot) => slot.segments.length > 1).length,
    itemLevels: normalized.flatMap((snapshot) => {
      const value = averageItemLevel(snapshot.gear);
      return value == null ? [] : [{ time: snapshot.offsetMilli, value }];
    }),
    slots,
    specs,
  };
}
