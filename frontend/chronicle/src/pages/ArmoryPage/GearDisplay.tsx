import { useMemo } from "react";
import type { PlayerOutfit } from "@/api/typesGenerated";
import { LEFT_SLOTS, RIGHT_SLOTS, BOTTOM_SLOTS } from "./types";
import { GearSlot } from "./GearSlot";

interface GearDisplayProps {
  gear: PlayerOutfit;
}

/**
 * Classic WoW paper-doll gear layout.
 * Gear is a fixed 19-element array indexed by equipment slot.
 */
export function GearDisplay({ gear }: GearDisplayProps) {
  const equippedItemIds = useMemo(
    () => new Set(gear.filter((g) => g.item_id > 0).map((g) => g.item_id)),
    [gear],
  );

  const leftItems = LEFT_SLOTS.map((slot) => ({
    slot,
    item: gear[slot.outfitIndex],
  }));

  const rightItems = RIGHT_SLOTS.map((slot) => ({
    slot,
    item: gear[slot.outfitIndex],
  }));

  const bottomItems = BOTTOM_SLOTS.map((slot) => ({
    slot,
    item: gear[slot.outfitIndex],
  }));

  return (
    <div className="flex min-w-0 flex-col items-center gap-3">
      <div className="flex w-full max-w-sm justify-between gap-4 md:w-auto md:max-w-none md:justify-center md:gap-10">
        {/* Left column — names on the left (outside) */}
        <div className="flex flex-col gap-1.5">
          {leftItems.map((entry, i) => (
            <GearSlot key={`l-${i}`} slotDef={entry.slot} item={entry.item} side="left" equippedItemIds={equippedItemIds} />
          ))}
        </div>

        {/* Right column — names on the right (outside) */}
        <div className="flex flex-col gap-1.5">
          {rightItems.map((entry, i) => (
            <GearSlot key={`r-${i}`} slotDef={entry.slot} item={entry.item} side="right" equippedItemIds={equippedItemIds} />
          ))}
        </div>
      </div>

      {/* Bottom row: weapons + ranged */}
      <div className="flex gap-4">
        <GearSlot slotDef={bottomItems[0].slot} item={bottomItems[0].item} side="left" equippedItemIds={equippedItemIds} />
        <GearSlot slotDef={bottomItems[1].slot} item={bottomItems[1].item} side="right" equippedItemIds={equippedItemIds} />
        <GearSlot slotDef={bottomItems[2].slot} item={bottomItems[2].item} side="right" equippedItemIds={equippedItemIds} />
      </div>
    </div>
  );
}
