import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, Loader2, Shield, X } from "lucide-react";
import { useSearchItemSets, useItemSetDetail, useItemTooltip } from "@/api/gamedata";
import { ItemTooltip } from "@/components/ui/ItemTooltip";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { iconUrl } from "@/config/iconUrl";
import { cn } from "@/lib/utils";
import type { ItemSetSearchResult, ItemSetPieceInfo, ItemSetBonus } from "@/api/typesGenerated";

// --- Label maps ---

const QUALITY_COLORS: Record<number, string> = {
  0: "text-quality-poor",
  1: "text-quality-common",
  2: "text-quality-uncommon",
  3: "text-quality-rare",
  4: "text-quality-epic",
  5: "text-quality-legendary",
  6: "text-quality-artifact",
};

const QUALITY_BORDER: Record<number, string> = {
  0: "border-gray-600/60",
  1: "border-gray-500/60",
  2: "border-green-500/60",
  3: "border-blue-400/60",
  4: "border-purple-500/60",
  5: "border-orange-400/60",
  6: "border-yellow-400/60",
};

const INVENTORY_TYPE_LABELS: Record<number, string> = {
  0: "", 1: "Head", 2: "Neck", 3: "Shoulder", 4: "Shirt", 5: "Chest",
  6: "Waist", 7: "Legs", 8: "Feet", 9: "Wrists", 10: "Hands",
  11: "Finger", 12: "Trinket", 13: "One-Hand", 14: "Shield", 15: "Ranged",
  16: "Back", 17: "Two-Hand", 18: "Bag", 19: "Tabard", 20: "Robe",
  21: "Main Hand", 22: "Off Hand", 23: "Holdable", 24: "Ammo", 25: "Thrown",
  26: "Ranged", 28: "Relic",
};

const SKILL_LABELS: Record<number, string> = {
  164: "Blacksmithing", 165: "Leatherworking", 171: "Alchemy",
  182: "Herbalism", 185: "Cooking", 186: "Mining", 197: "Tailoring",
  202: "Engineering", 333: "Enchanting", 356: "Fishing", 393: "Skinning",
  129: "First Aid",
};

// --- Components ---

const GRID_COLS = "grid-cols-[1fr_60px_80px_120px]";

function PieceIcon({ piece }: { piece: ItemSetPieceInfo }) {
  const url = iconUrl(piece.icon);
  const border = QUALITY_BORDER[piece.quality] ?? QUALITY_BORDER[1];

  if (!url) {
    return (
      <div
        className={cn("rounded border bg-gray-800 flex items-center justify-center shrink-0", border)}
        style={{ width: 24, height: 24 }}
      >
        <Shield className="h-3 w-3 text-gray-500" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={cn("rounded border shrink-0", border)}
      style={{ width: 24, height: 24 }}
      loading="lazy"
    />
  );
}

function PieceHoverTooltip({ itemId, children }: { itemId: number; children: React.ReactNode }) {
  const { data: item } = useItemTooltip({ itemId });

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" align="start" sideOffset={4} hideArrow className="p-0 bg-transparent border-0 shadow-none max-w-none">
        {item ? (
          <ItemTooltip item={item} includeReferenceLinks showItemLevel />
        ) : (
          <div className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-gray-400 text-sm">
            Loading…
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

function ExpandedSetDetail({ setId, onClose }: { setId: number; onClose: () => void }) {
  const { data: detail, isLoading, error } = useItemSetDetail(setId);

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900/95 p-4 mt-1 mb-2">
      <div className="flex justify-end mb-2">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-400 py-4 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading...
        </div>
      )}
      {error && <div className="text-red-400 text-sm">Failed to load item set details</div>}

      {detail && (
        <div className="space-y-4">
          <h3 className="text-green-400 font-medium text-sm">{detail.name}</h3>

          {/* Pieces */}
          <div className="space-y-1">
            {detail.pieces.map((piece) => (
              <PieceHoverTooltip key={piece.entry} itemId={piece.entry}>
                <Link
                  to={`/wowdb/item?id=${piece.entry}`}
                  className="flex items-center gap-2 px-2 py-1 rounded hover:bg-gray-800/80 transition-colors group"
                >
                  <PieceIcon piece={piece} />
                  <span className={cn("text-sm group-hover:underline", QUALITY_COLORS[piece.quality] ?? "text-quality-common")}>
                    {piece.name}
                  </span>
                  {INVENTORY_TYPE_LABELS[piece.inventory_type] && (
                    <span className="text-gray-600 text-xs ml-auto">
                      {INVENTORY_TYPE_LABELS[piece.inventory_type]}
                    </span>
                  )}
                </Link>
              </PieceHoverTooltip>
            ))}
          </div>

          {/* Bonuses */}
          {detail.bonuses.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-gray-700/50">
              {detail.bonuses.map((bonus: ItemSetBonus) => (
                <div key={bonus.threshold} className="text-sm text-gray-400">
                  <span className="text-gray-500">({bonus.threshold}) Set: </span>
                  <Link
                    to={`/wowdb/spells?q=${bonus.spell_id}`}
                    className="text-green-400 hover:underline"
                  >
                    Spell #{bonus.spell_id}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  set,
  isExpanded,
  onToggle,
}: {
  set: ItemSetSearchResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const skillLabel = set.required_skill > 0
    ? SKILL_LABELS[set.required_skill] ?? `Skill ${set.required_skill}`
    : "";

  return (
    <>
      <button
        onClick={onToggle}
        className={cn(
          "w-full text-left grid gap-3 items-center px-3 py-1.5 rounded-md transition-colors",
          GRID_COLS,
          "hover:bg-gray-800/80",
          isExpanded && "bg-gray-800/60"
        )}
      >
        <span className="font-medium text-green-400 truncate">{set.name}</span>
        <span className="text-gray-400 text-xs text-right tabular-nums">
          {set.piece_count}
        </span>
        <span className="text-gray-400 text-xs text-right tabular-nums">
          {set.bonus_count}
        </span>
        <span className="text-gray-500 text-xs truncate">{skillLabel}</span>
      </button>
      {isExpanded && <ExpandedSetDetail setId={set.id} onClose={onToggle} />}
    </>
  );
}

export function ItemSetExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get("q") ?? "");
  const [expandedSet, setExpandedSet] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const q = searchParams.get("q") ?? "";

  const { data: results, isLoading, isFetching, error } = useSearchItemSets(
    q.length >= 2 ? q : null
  );

  const updateQ = useCallback(
    (value: string | undefined) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set("q", value);
        } else {
          next.delete("q");
        }
        return next;
      });
      setExpandedSet(null);
    },
    [setSearchParams]
  );

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateQ(inputValue || undefined);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, updateQ]);

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search item sets by name..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            autoFocus
          />
          {inputValue && (
            <button
              onClick={() => {
                setInputValue("");
                updateQ(undefined);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="space-y-1">
        {/* Column headers */}
        {results && results.length > 0 && (
          <div className="space-y-2 pb-2 border-b border-gray-700/50">
            <div className="flex items-center justify-between text-sm text-gray-400 px-3">
              <span>
                {results.length >= 25 ? "25+ results" : `${results.length} result${results.length !== 1 ? "s" : ""}`}
                {isFetching && <Loader2 className="inline h-3 w-3 animate-spin ml-2" />}
              </span>
              <span className="text-xs text-gray-500">Click to expand set details</span>
            </div>
            <div className={cn("grid gap-3 items-center px-3 text-xs text-gray-500 font-medium", GRID_COLS)}>
              <span>Name</span>
              <span className="text-right">Pieces</span>
              <span className="text-right">Bonuses</span>
              <span>Profession</span>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && q.length >= 2 && (
          <div className="flex items-center justify-center gap-2 text-gray-400 py-12">
            <Loader2 className="h-5 w-5 animate-spin" />
            Searching...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="text-red-400 text-center py-8">
            {error instanceof Error ? error.message : "Failed to search item sets"}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && q.length >= 2 && results && results.length === 0 && (
          <div className="text-gray-500 text-center py-12">
            No item sets found matching &ldquo;{q}&rdquo;
          </div>
        )}

        {/* Prompt */}
        {q.length < 2 && (
          <div className="text-gray-500 text-center py-12 space-y-2">
            <Shield className="h-10 w-10 mx-auto text-gray-600" />
            <p>Type at least 2 characters to search</p>
            <div className="text-xs text-gray-600 space-x-3 pt-2">
              <span>Try:</span>
              {["Might", "Cenarion", "Netherwind"].map((name) => (
                <button
                  key={name}
                  className="text-blue-400/70 hover:text-blue-400"
                  onClick={() => setInputValue(name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results list */}
        {results && results.length > 0 && (
          <div className="space-y-0.5 pt-2">
            {results.map((set) => (
              <ResultRow
                key={set.id}
                set={set}
                isExpanded={expandedSet === set.id}
                onToggle={() =>
                  setExpandedSet((prev) => (prev === set.id ? null : set.id))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
