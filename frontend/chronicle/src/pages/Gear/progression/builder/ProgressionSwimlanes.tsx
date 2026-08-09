import { CornerDownRight } from "lucide-react";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { BOTTOM_SLOTS, LEFT_SLOTS, RIGHT_SLOTS, getQualityTextClass } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { slotLabel } from "@/pages/Gear/builder/SlotEditorPanel";
import { itemRefKey, type HydratedItem } from "@/pages/Gear/builder/useListItems";
import type { ProgressionColumn } from "../progressionModel";

/** Lane order: armory paperdoll order, weapons last. */
const LANES = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS];

interface ProgressionSwimlanesProps {
  columns: readonly ProgressionColumn[];
  items: Map<string, HydratedItem>;
  /** Highlights the column nearest the scrubber's current level. */
  currentLevel?: number;
  /** Jump the scrubber to a level and select a slot. */
  onCellClick?: (level: number, slotIndex: number) => void;
}

/**
 * Slots × levels: one lane per equipment slot, one column per level at
 * which the pool delivers something. A cell that repeats the previous
 * column renders as dimmed "carried", the same language the gear-list
 * progression matrix uses, so the columns that matter stand out.
 */
export function ProgressionSwimlanes({
  columns,
  items,
  currentLevel,
  onCellClick,
}: ProgressionSwimlanesProps) {
  if (columns.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
        Add items to the pool to see the progression laid out by level.
      </p>
    );
  }

  // The column the scrubber currently sits in: the last one at or below
  // the current level.
  const activeIndex = currentLevel == null
    ? -1
    : columns.reduce((best, col, i) => (col.level <= currentLevel ? i : best), -1);

  return (
    <div className="styled-scrollbar overflow-x-auto rounded-md border border-zinc-700/60">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="bg-zinc-900/70">
            <th className="sticky left-0 z-10 bg-zinc-900 px-3 py-2 text-2xs font-medium uppercase tracking-wide text-zinc-500">
              Slot
            </th>
            {columns.map((col, i) => (
              <th
                key={col.level}
                className={cn(
                  "whitespace-nowrap px-3 py-2 text-xs font-semibold",
                  i === activeIndex ? "bg-blue-500/10 text-white" : "text-zinc-300",
                )}
              >
                Lv {col.level}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LANES.map((def) => {
            const anyFilled = columns.some((col) => col.equipped[def.outfitIndex] != null);
            if (!anyFilled) return null;
            return (
              <tr key={def.outfitIndex} className="border-t border-zinc-800/70">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-zinc-950/95 px-3 py-1.5 text-2xs uppercase tracking-wide text-zinc-500">
                  {slotLabel(def.outfitIndex)}
                </td>
                {columns.map((col, i) => {
                  const itemId = col.equipped[def.outfitIndex];
                  const prevItemId = i > 0 ? columns[i - 1].equipped[def.outfitIndex] : undefined;
                  const carried = itemId != null && itemId === prevItemId;
                  const item = itemId != null ? items.get(itemRefKey(itemId)) : undefined;
                  return (
                    <td
                      key={col.level}
                      className={cn("px-3 py-1.5 align-middle", i === activeIndex && "bg-blue-500/5")}
                    >
                      {itemId == null ? (
                        <span className="text-zinc-700">—</span>
                      ) : carried ? (
                        <button
                          type="button"
                          onClick={() => onCellClick?.(col.level, def.outfitIndex)}
                          className="flex items-center gap-1.5 text-2xs text-zinc-600 hover:text-zinc-400"
                          title={item?.name || `Item #${itemId}`}
                        >
                          <CornerDownRight className="h-3 w-3" />
                          carried
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onCellClick?.(col.level, def.outfitIndex)}
                          className="flex min-w-0 max-w-52 items-center gap-2 hover:brightness-125"
                        >
                          <ItemIcon icon={item?.icon} quality={item?.quality ?? 1} size={22} />
                          <span
                            className={cn(
                              "truncate text-xs",
                              getQualityTextClass(item?.quality ?? 1),
                            )}
                          >
                            {item?.name || `Item #${itemId}`}
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
