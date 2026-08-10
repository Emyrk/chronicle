import { LockKeyhole, X } from "lucide-react";
import { BuilderDoll } from "./BuilderDoll";
import {
  characterMatchStage,
  equippedItemStageMatches,
  type CharacterMatch,
} from "./characterMatch";
import type { GearStage } from "./gearListModel";
import { useListItems, type ItemRef } from "./useListItems";

interface ArmoryDollProps {
  match: CharacterMatch;
  characterName: string;
  progressionStages: readonly GearStage[];
  onClear?: () => void;
}

/** Compact, deliberately non-interactive reference view of Armory gear. */
export function ArmoryDoll({
  match,
  characterName,
  progressionStages,
  onClear,
}: ArmoryDollProps) {
  const stage = characterMatchStage(match);
  const acceptedFromStages = equippedItemStageMatches(progressionStages, match);
  const itemRefs: ItemRef[] = match.equippedSlots.flatMap((equipped) =>
    equipped
      ? [{ itemId: equipped.item_id, enchantId: equipped.enchant_id }]
      : [],
  );
  const items = useListItems(itemRefs);

  return (
    <section className="rounded-md border border-dashed border-zinc-700/70 bg-zinc-950/35 p-3 shadow-inner">
      <div className="mb-3 flex items-start gap-2 border-b border-zinc-800/80 pb-2.5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-500">
          <LockKeyhole className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-xs font-medium text-zinc-300">
            {characterName}&apos;s current gear
          </h3>
          <p className="text-2xs text-zinc-600">
            Armory snapshot · reference only · not editable
          </p>
        </div>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label={`Stop comparing with ${characterName}`}
            title="Choose another character"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div
        className="select-none"
        aria-label={`${characterName}'s read-only Armory paperdoll`}
        aria-readonly="true"
      >
        <BuilderDoll
          stage={stage}
          items={items}
          acceptedFromStages={acceptedFromStages}
        />
      </div>
    </section>
  );
}
