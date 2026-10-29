import type { ArmoryGearSnapshot, PlayerGear } from "@/api/typesGenerated";
import { BOTTOM_SLOTS, LEFT_SLOTS, RIGHT_SLOTS } from "../types";
import { STRIP_ORDER } from "./useOutfitItems";

/** Ring and trinket slots are interchangeable, so moving an item between the pair isn't a change. */
const PAIRED_SLOTS: readonly (readonly [number, number])[] = [[10, 11], [12, 13]];

const SLOT_LABELS = new Map([...LEFT_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS].map((slot) => [slot.outfitIndex, slot.label]));

export interface GearSegment {
  item: PlayerGear;
  /** When the item first appears in this run of snapshots (ms). */
  start: number;
  /** When the next item replaced it or the slot emptied, else its last snapshot (ms); bars run to here. */
  end: number;
  /** The last snapshot that recorded this item (ms). */
  lastSeen: number;
  snapshotCount: number;
}

export interface GearSlotTimeline {
  slot: number;
  label: string;
  /** Oldest first; an empty slot has no segment for that stretch. */
  segments: GearSegment[];
}

export interface GearTimeline {
  start: number;
  end: number;
  snapshotCount: number;
  /** Each snapshot's time, oldest first. */
  times: number[];
  /** Slots where the item changed at least once in the window. */
  changedSlots: number;
  slots: GearSlotTimeline[];
  itemLevels: { time: number; value: number }[];
}

/** The item worn in a slot at a snapshot's time, or null when the slot was empty then. */
export function gearAt(slot: GearSlotTimeline, time: number): GearSegment | null {
  let segment: GearSegment | undefined;
  for (const candidate of slot.segments) {
    if (candidate.start > time) break;
    segment = candidate;
  }
  return segment && segment.lastSeen >= time ? segment : null;
}

/**
 * Turns gear snapshots (any order) into per-slot item segments over time,
 * optionally limited to one raid and the last `rangeDays`. Null when nothing matches.
 */
export function buildGearTimeline(
  snapshots: readonly ArmoryGearSnapshot[],
  instanceName: string | null,
  rangeDays: number | null,
  now = Date.now(),
): GearTimeline | null {
  const since = rangeDays === null ? -Infinity : now - rangeDays * 24 * 60 * 60 * 1000;
  const ordered = snapshots
    .map((snapshot) => ({ time: Date.parse(snapshot.equipped_at), snapshot }))
    .filter(({ time, snapshot }) => time >= since && (!instanceName || snapshot.instance_name === instanceName))
    .sort((a, b) => a.time - b.time);
  if (ordered.length === 0) return null;

  let previous: PlayerGear[] | null = null;
  const outfits = ordered.map(({ time, snapshot }) => {
    const gear = [...snapshot.gear];
    if (previous) {
      for (const [a, b] of PAIRED_SLOTS) {
        const kept = gear[a].item_id === previous[a].item_id || gear[b].item_id === previous[b].item_id;
        const crossed = gear[a].item_id === previous[b].item_id || gear[b].item_id === previous[a].item_id;
        if (crossed && !kept) [gear[a], gear[b]] = [gear[b], gear[a]];
      }
    }
    previous = gear;
    return { time, gear };
  });

  const start = outfits[0].time;
  const end = outfits[outfits.length - 1].time;
  const slots = STRIP_ORDER.map((slot) => {
    const segments: GearSegment[] = [];
    // The item being worn as of the previous snapshot; null while the slot is empty.
    let worn: GearSegment | null = null;
    for (const { time, gear } of outfits) {
      const item = gear[slot];
      if (worn && worn.item.item_id === item.item_id) {
        worn.snapshotCount += 1;
        worn.end = time;
        worn.lastSeen = time;
        continue;
      }
      if (worn) worn.end = time;
      worn = item.item_id > 0 ? { item, start: time, end: time, lastSeen: time, snapshotCount: 1 } : null;
      if (worn) segments.push(worn);
    }
    return { slot, label: SLOT_LABELS.get(slot) ?? `Slot ${slot}`, segments };
  });

  return {
    start,
    end,
    snapshotCount: outfits.length,
    times: outfits.map((outfit) => outfit.time),
    changedSlots: slots.filter((slot) => slot.segments.length > 1).length,
    slots,
    itemLevels: ordered.flatMap(({ time, snapshot }) => snapshot.avg_ilvl == null ? [] : [{ time, value: snapshot.avg_ilvl }]),
  };
}
