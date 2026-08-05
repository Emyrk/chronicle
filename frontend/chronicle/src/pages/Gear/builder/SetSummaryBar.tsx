import { COSMETIC_SLOTS, SLOT_COUNT, type GearStage } from "./gearListModel";
import { itemRefKey, type HydratedItem } from "./useListItems";

interface SetSummaryBarProps {
  stage: GearStage;
  items: Map<string, HydratedItem>;
}

/** Filled-slot count and average item level for one stage. */
export function SetSummaryBar({ stage, items }: SetSummaryBarProps) {
  const entries = Object.entries(stage.slots).filter(([, e]) => !!e);
  const nonCosmetic = SLOT_COUNT - COSMETIC_SLOTS.size;
  const filled = entries.filter(([key]) => !COSMETIC_SLOTS.has(Number(key))).length;

  const levels = entries
    .filter(([key]) => !COSMETIC_SLOTS.has(Number(key)))
    .map(([, e]) => items.get(itemRefKey(e!.item_id, e!.enchant_id))?.itemLevel)
    .filter((lvl): lvl is number => lvl != null);
  const avgIlvl = levels.length > 0 ? levels.reduce((a, b) => a + b, 0) / levels.length : null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-400">
      <span>
        <span className="font-mono text-zinc-200">{filled}</span>
        <span className="text-zinc-500">/{nonCosmetic} slots</span>
      </span>
      <span>
        avg ilvl{" "}
        <span className="font-mono text-zinc-200">{avgIlvl != null ? avgIlvl.toFixed(1) : "—"}</span>
      </span>
    </div>
  );
}
