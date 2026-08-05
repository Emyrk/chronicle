import { ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { getQualityTextClass } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import type { GearSlotEntry } from "./gearListModel";
import { itemRefKey, type HydratedItem } from "./useListItems";

interface AlternatesEditorProps {
  entry: GearSlotEntry;
  items: Map<string, HydratedItem>;
  readOnly?: boolean;
  onSlotNote?: (note: string) => void;
  onAlternateNote?: (itemId: number, note: string) => void;
  onPromote?: (itemId: number) => void;
  onRemove?: (itemId: number) => void;
}

/**
 * The slot's author note and its ranked alternates (with per-alternate
 * notes, promote-to-primary, and removal). Order in the list is the rank.
 */
export function AlternatesEditor({
  entry,
  items,
  readOnly = false,
  onSlotNote,
  onAlternateNote,
  onPromote,
  onRemove,
}: AlternatesEditorProps) {
  const alternates = entry.alternates ?? [];

  return (
    <div className="space-y-3">
      <div>
        <div className="text-2xs uppercase tracking-wide text-zinc-500 mb-1">Slot note</div>
        {readOnly ? (
          entry.note ? (
            <p className="text-xs text-zinc-300 whitespace-pre-wrap">{entry.note}</p>
          ) : (
            <p className="text-xs text-zinc-600">No note for this slot.</p>
          )
        ) : (
          <textarea
            value={entry.note ?? ""}
            onChange={(e) => onSlotNote?.(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Why this piece, and what it assumes…"
            className="w-full resize-y rounded border border-zinc-700 bg-zinc-950/60 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
          />
        )}
      </div>

      <div>
        <div className="text-2xs uppercase tracking-wide text-zinc-500 mb-1">
          Alternates {alternates.length > 0 && `(ranked, ${alternates.length})`}
        </div>
        {alternates.length === 0 ? (
          <p className="text-xs text-zinc-600">
            {readOnly
              ? "No alternates listed for this slot."
              : "No alternates yet. Use “Add alt” on a search result in the Pick item tab."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {alternates.map((alt, i) => {
              const item = items.get(itemRefKey(alt.item_id));
              return (
                <div
                  key={alt.item_id}
                  className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5"
                >
                  <span className="font-mono text-2xs text-zinc-600 pt-2 w-4 text-right shrink-0">
                    {i + 2}
                  </span>
                  <ItemIcon icon={item?.icon} quality={item?.quality ?? 1} size={26} />
                  <div className="min-w-0 flex-1">
                    <span className={cn("text-xs", getQualityTextClass(item?.quality ?? 1))}>
                      {item?.name || `Item #${alt.item_id}`}
                    </span>
                    {readOnly ? (
                      alt.note && <p className="text-2xs text-zinc-400 whitespace-pre-wrap">{alt.note}</p>
                    ) : (
                      <textarea
                        value={alt.note ?? ""}
                        onChange={(e) => onAlternateNote?.(alt.item_id, e.target.value)}
                        rows={1}
                        maxLength={500}
                        placeholder="When would someone take this instead?"
                        className="mt-1 w-full resize-y rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-1 text-2xs text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                      />
                    )}
                  </div>
                  {!readOnly && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-1.5 text-2xs"
                        title="Make primary"
                        onClick={() => onPromote?.(alt.item_id)}
                      >
                        <ArrowUp className="h-3 w-3 mr-0.5" />
                        Primary
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-2xs text-zinc-500 hover:text-red-400"
                        onClick={() => onRemove?.(alt.item_id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
