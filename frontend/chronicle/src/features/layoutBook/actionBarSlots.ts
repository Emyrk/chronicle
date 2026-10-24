import type { ActionBarSlotsResponse } from "@/api/typesGenerated";
import { LAYOUT_ACTION_BAR_KEYS, type LayoutActionBarSlots } from "./layoutBookStore";

/** Converts the API's slot_N fields to action bar slots keyed by hotkey. */
export function fromActionBarResponse(slots: ActionBarSlotsResponse | null | undefined): LayoutActionBarSlots {
  return Object.fromEntries(
    LAYOUT_ACTION_BAR_KEYS.map((key) => [key, slots?.[`slot_${key}`] ?? null]),
  ) as LayoutActionBarSlots;
}

/** Converts action bar slots keyed by hotkey to the API's slot_N fields. */
export function toActionBarResponse(slots: LayoutActionBarSlots): ActionBarSlotsResponse {
  return Object.fromEntries(
    LAYOUT_ACTION_BAR_KEYS.map((key) => [`slot_${key}`, slots[key]]),
  ) as unknown as ActionBarSlotsResponse;
}
