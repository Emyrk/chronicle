import { CornerDownRight } from "lucide-react";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { BOTTOM_SLOTS, LEFT_SLOTS, RIGHT_SLOTS, getQualityTextClass } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import type { GearPayload } from "./gearListModel";
import { slotLabel } from "./SlotEditorPanel";
import { itemRefKey, type HydratedItem } from "./useListItems";

/** Matrix row order: armory paperdoll order, weapons last. */
const MATRIX_SLOTS = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS];

interface ProgressionMatrixProps {
  payload: GearPayload;
  items: Map<string, HydratedItem>;
  /** Jump to a (stage, slot) in the stage view. */
  onCellClick?: (stageIndex: number, slotIndex: number) => void;
}

/**
 * Read-only slots × stages overview for multi-stage lists. A cell whose
 * item matches the previous stage renders dimmed as "carried forward";
 * the first stage that introduces an item shows it in full color.
 */
export function ProgressionMatrix({ payload, items, onCellClick }: ProgressionMatrixProps) {
  return (
    <div className="overflow-x-auto rounded-md border border-zinc-700/60">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-zinc-900/70">
            <th className="sticky left-0 bg-zinc-900 px-3 py-2 text-2xs uppercase tracking-wide text-zinc-500 font-medium">
              Slot
            </th>
            {payload.stages.map((s, i) => (
              <th key={i} className="px-3 py-2 text-xs text-zinc-300 font-semibold whitespace-nowrap">
                {s.name || `Stage ${i + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MATRIX_SLOTS.map((def, rowIdx) => {
            const key = String(def.outfitIndex);
            // Skip cosmetic rows entirely when no stage fills them.
            const anyFilled = payload.stages.some((s) => s.slots[key]);
            if (!anyFilled) return null;
            return (
              <tr key={`${def.outfitIndex}-${rowIdx}`} className="border-t border-zinc-800/70">
                <td className="sticky left-0 bg-zinc-950/95 px-3 py-1.5 text-2xs uppercase tracking-wide text-zinc-500 whitespace-nowrap">
                  {slotLabel(def.outfitIndex)}
                </td>
                {payload.stages.map((stage, stageIdx) => {
                  const entry = stage.slots[key];
                  const prev = stageIdx > 0 ? payload.stages[stageIdx - 1].slots[key] : undefined;
                  const carried = !!entry && !!prev && entry.item_id === prev.item_id;
                  const item = entry
                    ? items.get(itemRefKey(entry.item_id, entry.enchant_id))
                    : undefined;
                  return (
                    <td key={stageIdx} className="px-3 py-1.5 align-middle">
                      {!entry ? (
                        <span className="text-zinc-700">—</span>
                      ) : carried ? (
                        <button
                          type="button"
                          onClick={() => onCellClick?.(stageIdx, def.outfitIndex)}
                          className="flex items-center gap-1.5 text-2xs text-zinc-600 hover:text-zinc-400"
                          title={item?.name || `Item #${entry.item_id}`}
                        >
                          <CornerDownRight className="h-3 w-3" />
                          carried
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onCellClick?.(stageIdx, def.outfitIndex)}
                          className="flex items-center gap-2 min-w-0 max-w-52 hover:brightness-125"
                        >
                          <ItemIcon icon={item?.icon} quality={item?.quality ?? 1} size={22} />
                          <span
                            className={cn(
                              "text-xs truncate",
                              getQualityTextClass(item?.quality ?? 1),
                            )}
                          >
                            {item?.name || `Item #${entry.item_id}`}
                          </span>
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
