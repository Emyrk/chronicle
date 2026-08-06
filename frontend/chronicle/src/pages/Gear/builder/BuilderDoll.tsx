import { BOTTOM_SLOTS, LEFT_SLOTS, RIGHT_SLOTS } from "@/pages/ArmoryPage/types";
import { slotOwned, type CharacterMatch } from "./characterMatch";
import type { GearStage } from "./gearListModel";
import { itemRefKey } from "./useListItems";
import type { HydratedItem } from "./useListItems";
import { BuilderSlot } from "./BuilderSlot";

interface BuilderDollProps {
  stage: GearStage;
  items: Map<string, HydratedItem>;
  selectedSlot?: number;
  onSelectSlot?: (outfitIndex: number) => void;
  /** Per-slot weighted scores (by outfit index), when weights are active. */
  scores?: Map<number, number>;
  /** Armory character match; adds owned/equipped/missing markers. */
  match?: CharacterMatch;
}

/**
 * The builder paperdoll: two slot columns plus the weapon row, mirroring
 * the armory layout. Read-only when onSelectSlot is absent.
 */
export function BuilderDoll({ stage, items, selectedSlot, onSelectSlot, scores, match }: BuilderDollProps) {
  const equippedItemIds = new Set(
    Object.values(stage.slots)
      .filter((e) => !!e)
      .map((e) => e!.item_id),
  );

  const slotFor = (outfitIndex: number) => {
    const entry = stage.slots[String(outfitIndex)];
    const item = entry ? items.get(itemRefKey(entry.item_id, entry.enchant_id)) : undefined;
    let matchState: "equipped" | "owned" | "missing" | undefined;
    if (match && entry) {
      matchState = match.equippedIds.has(entry.item_id)
        ? "equipped"
        : slotOwned(stage, outfitIndex, match)
          ? "owned"
          : "missing";
    }
    return { entry, item, matchState };
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          {LEFT_SLOTS.map((def) => {
            const { entry, item, matchState } = slotFor(def.outfitIndex);
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
                score={scores?.get(def.outfitIndex)}
                matchState={matchState}
              />
            );
          })}
        </div>
        <div className="flex flex-col gap-1.5">
          {RIGHT_SLOTS.map((def) => {
            const { entry, item, matchState } = slotFor(def.outfitIndex);
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
                score={scores?.get(def.outfitIndex)}
                matchState={matchState}
              />
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {BOTTOM_SLOTS.map((def) => {
          const { entry, item, matchState } = slotFor(def.outfitIndex);
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
              score={scores?.get(def.outfitIndex)}
              matchState={matchState}
            />
          );
        })}
      </div>
    </div>
  );
}
