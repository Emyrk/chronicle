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
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-32">
        {/* Left column */}
        <div className="flex flex-col gap-1.5">
          {leftItems.map((entry, i) => (
            <GearSlot key={`l-${i}`} slotDef={entry.slot} item={entry.item} />
          ))}
        </div>

        {/* Center content */}
        <div className="flex items-center justify-center">
          <p className="text-xs text-zinc-600 italic">Content coming soon</p>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-1.5">
          {rightItems.map((entry, i) => (
            <GearSlot key={`r-${i}`} slotDef={entry.slot} item={entry.item} />
          ))}
        </div>
      </div>

      {/* Bottom row: weapons + ranged */}
      <div className="flex gap-1.5">
        {bottomItems.map((entry, i) => (
          <GearSlot key={`b-${i}`} slotDef={entry.slot} item={entry.item} />
        ))}
      </div>
    </div>
  );
}
