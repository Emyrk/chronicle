import type { ArmoryGearItem } from "./types";
import { LEFT_SLOTS, RIGHT_SLOTS, BOTTOM_SLOTS } from "./types";
import { GearSlot } from "./GearSlot";

interface GearDisplayProps {
  gear: ArmoryGearItem[];
}

/**
 * Classic WoW paper-doll gear layout.
 *
 * For slots that appear twice (ring, trinket), items are matched in
 * order of appearance in the gear array. The first matching item fills
 * the first slot, the second matching item fills the second slot.
 */
export function GearDisplay({ gear }: GearDisplayProps) {
  // Build a lookup: inventoryType → items (array for duplicate slots like rings)
  const bySlot = new Map<number, ArmoryGearItem[]>();
  for (const item of gear) {
    const existing = bySlot.get(item.slot) ?? [];
    existing.push(item);
    bySlot.set(item.slot, existing);
  }

  // Track consumption index per slot type for duplicate slots
  const slotIndex = new Map<number, number>();

  function getItem(inventoryType: number): ArmoryGearItem | undefined {
    const items = bySlot.get(inventoryType);
    if (!items) return undefined;
    const idx = slotIndex.get(inventoryType) ?? 0;
    slotIndex.set(inventoryType, idx + 1);
    return items[idx];
  }

  // Reset index for each column render
  const leftItems = LEFT_SLOTS.map((slot) => ({
    slot,
    item: getItem(slot.inventoryType),
  }));

  const rightItems = RIGHT_SLOTS.map((slot) => ({
    slot,
    item: getItem(slot.inventoryType),
  }));

  const bottomItems = BOTTOM_SLOTS.map((slot) => ({
    slot,
    item: getItem(slot.inventoryType),
  }));

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-16">
        {/* Left column */}
        <div className="flex flex-col gap-1.5">
          {leftItems.map((entry, i) => (
            <GearSlot key={`l-${i}`} slotDef={entry.slot} item={entry.item} />
          ))}
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
