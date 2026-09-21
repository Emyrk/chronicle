import { useMemo, useState, useCallback } from "react";
import { X, Box } from "lucide-react";
import type { PlayerOutfit } from "@/api/typesGenerated";
import { LEFT_SLOTS, RIGHT_SLOTS, BOTTOM_SLOTS } from "./types";
import { GearSlot } from "./GearSlot";
import { CharacterModelViewer } from "./CharacterModelViewer";

const STORAGE_KEY = "armory-3d-model";

function get3dEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function set3dEnabled(enabled: boolean) {
  try {
    if (enabled) {
      localStorage.setItem(STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

interface GearDisplayProps {
  gear: PlayerOutfit;
  race: string;
  gender: string;
}

/**
 * Classic WoW paper-doll gear layout.
 * Gear is a fixed 19-element array indexed by equipment slot.
 */
export function GearDisplay({ gear, race, gender }: GearDisplayProps) {
  const [modelEnabled, setModelEnabled] = useState(get3dEnabled);
  const [failedSlots, setFailedSlots] = useState<ReadonlySet<number>>(new Set());

  const toggle3d = useCallback((enabled: boolean) => {
    set3dEnabled(enabled);
    setModelEnabled(enabled);
    if (!enabled) setFailedSlots(new Set());
  }, []);

  const handleSlotErrors = useCallback((slots: Set<number>) => {
    setFailedSlots(slots);
  }, []);

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
            <GearSlot key={`l-${i}`} slotDef={entry.slot} item={entry.item} side="left" equippedItemIds={equippedItemIds} modelError={failedSlots.has(entry.slot.outfitIndex)} />
          ))}
        </div>

        {/* Center — 3D model or "coming soon" placeholder */}
        <div className="hidden md:flex items-center justify-center w-90 h-[450px] overflow-hidden relative">
          {modelEnabled ? (
            <>
              <button
                onClick={() => toggle3d(false)}
                className="absolute top-1 right-1 z-10 p-1 rounded bg-zinc-800/70 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
                title="Disable 3D model"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="w-full h-full scale-125 origin-center">
                <CharacterModelViewer race={race} gender={gender} gear={gear} onSlotErrors={handleSlotErrors} />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-zinc-600 italic">Content coming soon</p>
              <button
                onClick={() => toggle3d(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-zinc-700 bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <Box className="h-3.5 w-3.5" />
                Try 3D Model
                <span className="text-2xs text-zinc-500">(experimental)</span>
              </button>
            </div>
          )}
        </div>

        {/* Right column — names on the right (outside) */}
        <div className="flex flex-col gap-1.5">
          {rightItems.map((entry, i) => (
            <GearSlot key={`r-${i}`} slotDef={entry.slot} item={entry.item} side="right" equippedItemIds={equippedItemIds} modelError={failedSlots.has(entry.slot.outfitIndex)} />
          ))}
        </div>
      </div>

      {/* Bottom row: weapons + ranged */}
      <div className="flex gap-4">
        <GearSlot slotDef={bottomItems[0].slot} item={bottomItems[0].item} side="left" equippedItemIds={equippedItemIds} modelError={failedSlots.has(bottomItems[0].slot.outfitIndex)} />
        <GearSlot slotDef={bottomItems[1].slot} item={bottomItems[1].item} side="right" equippedItemIds={equippedItemIds} modelError={failedSlots.has(bottomItems[1].slot.outfitIndex)} />
        <GearSlot slotDef={bottomItems[2].slot} item={bottomItems[2].item} side="right" equippedItemIds={equippedItemIds} modelError={failedSlots.has(bottomItems[2].slot.outfitIndex)} />
      </div>
    </div>
  );
}
