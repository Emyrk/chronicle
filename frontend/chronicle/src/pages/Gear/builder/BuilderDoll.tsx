import { BOTTOM_SLOTS, LEFT_SLOTS, RIGHT_SLOTS } from "@/pages/ArmoryPage/types";
import type { GearStage } from "./gearListModel";
import { itemRefKey } from "./useListItems";
import type { HydratedItem } from "./useListItems";
import { BuilderSlot } from "./BuilderSlot";

interface BuilderDollProps {
  stage: GearStage;
  items: Map<string, HydratedItem>;
  selectedSlot?: number;
  onSelectSlot?: (outfitIndex: number) => void;
}

/**
 * The builder paperdoll: two slot columns plus the weapon row, mirroring
 * the armory layout. Read-only when onSelectSlot is absent.
 */
export function BuilderDoll({ stage, items, selectedSlot, onSelectSlot }: BuilderDollProps) {
  const equippedItemIds = new Set(
    Object.values(stage.slots)
      .filter((e) => !!e)
      .map((e) => e!.item_id),
  );

  const slotFor = (outfitIndex: number) => {
    const entry = stage.slots[String(outfitIndex)];
    const item = entry ? items.get(itemRefKey(entry.item_id, entry.enchant_id)) : undefined;
    return { entry, item };
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          {LEFT_SLOTS.map((def) => {
            const { entry, item } = slotFor(def.outfitIndex);
            return (
              <BuilderSlot
                key={def.outfitIndex}
                slotDef={def}
                entry={entry}
                item={item}
                side="left"
                selected={selectedSlot === def.outfitIndex}
                onSelect={onSelectSlot}
                equippedItemIds={equippedItemIds}
              />
            );
          })}
        </div>
        <div className="flex flex-col gap-1.5">
          {RIGHT_SLOTS.map((def) => {
            const { entry, item } = slotFor(def.outfitIndex);
            return (
              <BuilderSlot
                key={def.outfitIndex}
                slotDef={def}
                entry={entry}
                item={item}
                side="right"
                selected={selectedSlot === def.outfitIndex}
                onSelect={onSelectSlot}
                equippedItemIds={equippedItemIds}
              />
            );
          })}
        </div>
      </div>
      <div className="flex justify-center gap-6">
        {BOTTOM_SLOTS.map((def) => {
          const { entry, item } = slotFor(def.outfitIndex);
          return (
            <BuilderSlot
              key={def.outfitIndex}
              slotDef={def}
              entry={entry}
              item={item}
              side="bottom"
              selected={selectedSlot === def.outfitIndex}
              onSelect={onSelectSlot}
              equippedItemIds={equippedItemIds}
            />
          );
        })}
      </div>
    </div>
  );
}
