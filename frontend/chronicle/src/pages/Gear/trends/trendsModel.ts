/**
 * Pure helpers for the observed-gear-trends UI. No React imports.
 */
import type { GearTrendsResponse, GearTrendsSlot } from "@/api/typesGenerated";

export function formatEquipRate(percent: number): string {
  if (percent >= 10) return `${Math.round(percent)}%`;
  return `${percent.toFixed(1)}%`;
}

/** Slots ordered for tab display: armory paperdoll order, weapons last. */
export const TREND_SLOT_ORDER = [0, 1, 2, 14, 4, 8, 9, 5, 6, 7, 10, 11, 12, 13, 15, 16, 17] as const;

/** Slots with data, in display order. */
export function orderedSlots(resp: GearTrendsResponse): GearTrendsSlot[] {
  const bySlot = new Map(resp.slots.map((s) => [s.slot, s]));
  const ordered: GearTrendsSlot[] = [];
  for (const idx of TREND_SLOT_ORDER) {
    const slot = bySlot.get(idx);
    if (slot && slot.items.length > 0) ordered.push(slot);
  }
  return ordered;
}

/**
 * The state the page should render: loading → table | insufficient |
 * empty (no data at all despite a big enough cohort).
 */
export function trendsState(
  resp: GearTrendsResponse | undefined,
  isLoading: boolean,
): "loading" | "insufficient" | "empty" | "ready" {
  if (isLoading) return "loading";
  if (!resp) return "loading";
  if (resp.insufficient_sample) return "insufficient";
  if (orderedSlots(resp).length === 0) return "empty";
  return "ready";
}
