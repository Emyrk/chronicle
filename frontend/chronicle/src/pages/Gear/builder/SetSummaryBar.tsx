import { COSMETIC_SLOTS, SLOT_COUNT, type GearStage } from "./gearListModel";
import { formatScore } from "./gearScoring";
import { itemRefKey, type HydratedItem } from "./useListItems";

interface SetSummaryBarProps {
  stage: GearStage;
  items: Map<string, HydratedItem>;
  /** Total weighted score across filled slots, when weights are active. */
  totalScore?: number;
}

/** Filled-slot count, average item level, and set score for one stage. */
export function SetSummaryBar({ stage, items, totalScore }: SetSummaryBarProps) {
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
      {totalScore !== undefined && (
        <span>
          set score <span className="font-mono text-zinc-200">{formatScore(totalScore)}</span>
          <span className="text-zinc-600"> (item stats only)</span>
        </span>
      )}
    </div>
  );
}
