import { Check, X } from "lucide-react";
import { BOTTOM_SLOTS, LEFT_SLOTS, RIGHT_SLOTS, type GearSlotDef } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { slotEquipped, type CharacterMatch } from "./characterMatch";
import type { GearStage } from "./gearListModel";
import { itemRefKey } from "./useListItems";
import type { HydratedItem } from "./useListItems";
import { BuilderSlot } from "./BuilderSlot";

interface BuilderDollProps {
  stage: GearStage;
  items: Map<string, HydratedItem>;
  selectedSlot?: number;
  onSelectSlot?: (outfitIndex: number) => void;
  /** Open the enchant editor for a slot directly (edit mode only). */
  onEnchantSlot?: (outfitIndex: number) => void;
  /** Per-slot weighted scores (by outfit index), when weights are active. */
  scores?: Map<number, number>;
  /** Per-slot score difference vs the matched character's worn item. */
  wornDeltas?: Map<number, number>;
  /** Armory character match; adds owned/equipped/missing markers. */
  match?: CharacterMatch;
  /** Matched character's name, for the marker legend. */
  matchName?: string;
  /** Progression only: per-slot "next upgrade at level N" annotations. */
  nextUpgrades?: Map<number, { level: number; name: string }>;
}

/** Divider-style section label ("——— WEAPONS ———"). */
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-zinc-800" />
      <span className="text-3xs uppercase tracking-[0.2em] text-zinc-600">{label}</span>
      <span className="h-px flex-1 bg-zinc-800" />
    </div>
  );
}

/**
 * The builder paperdoll as a card grid: armor and accessory slots in two
 * columns, weapons in their own labeled section. Read-only when
 * onSelectSlot is absent.
 */
export function BuilderDoll({
  stage,
  items,
  selectedSlot,
  onSelectSlot,
  onEnchantSlot,
  scores,
  wornDeltas,
  match,
  matchName,
  nextUpgrades,
}: BuilderDollProps) {
  const equippedItemIds = new Set(
    Object.values(stage.slots)
      .filter((e) => !!e)
      .map((e) => e!.item_id),
  );

  const renderSlot = (def: GearSlotDef) => {
    const entry = stage.slots[String(def.outfitIndex)];
    const item = entry ? items.get(itemRefKey(entry.item_id, entry.enchant_id)) : undefined;
    let matchState: "equipped" | "missing" | undefined;
    if (match && entry) {
      matchState = slotEquipped(stage, def.outfitIndex, match) ? "equipped" : "missing";
    }
    return (
      <BuilderSlot
        key={def.outfitIndex}
        slotDef={def}
        entry={entry}
        item={item}
        selected={selectedSlot === def.outfitIndex}
        onSelect={onSelectSlot}
        onEnchant={onEnchantSlot}
        equippedItemIds={equippedItemIds}
        score={scores?.get(def.outfitIndex)}
        wornDelta={wornDeltas?.get(def.outfitIndex)}
        matchState={matchState}
        nextUpgrade={nextUpgrades?.get(def.outfitIndex)}
      />
    );
  };

  // Interleave the armory's left/right columns row by row so the grid
  // preserves the familiar paperdoll ordering.
  const armorRows: GearSlotDef[] = [];
  for (let i = 0; i < Math.max(LEFT_SLOTS.length, RIGHT_SLOTS.length); i++) {
    if (LEFT_SLOTS[i]) armorRows.push(LEFT_SLOTS[i]);
    if (RIGHT_SLOTS[i]) armorRows.push(RIGHT_SLOTS[i]);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {armorRows.map(renderSlot)}
      </div>
      <SectionDivider label="Weapons" />
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {BOTTOM_SLOTS.map(renderSlot)}
      </div>
      {match && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-800 pt-2 text-2xs text-zinc-400">
          <span className="text-zinc-500">{matchName ?? "Matched character"}:</span>
          <span className="inline-flex items-center gap-1">
            <MarkerDot state="equipped" /> wearing now
          </span>
          <span className="inline-flex items-center gap-1">
            <MarkerDot state="missing" /> not wearing
          </span>
        </div>
      )}
    </div>
  );
}

function MarkerDot({ state }: { state: "equipped" | "missing" }) {
  return (
    <span
      className={cn(
        "flex h-3.5 w-3.5 items-center justify-center rounded-full",
        state === "equipped" && "bg-blue-500 text-white",
        state === "missing" && "bg-amber-400 text-zinc-950",
      )}
    >
      {state === "missing" ? (
        <X className="h-2.5 w-2.5" strokeWidth={3.5} />
      ) : (
        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
      )}
    </span>
  );
}
