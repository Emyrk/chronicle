import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Loader2, Package, X, ArrowUpDown, ArrowDown, ArrowUp } from "lucide-react";
import { useSearchItems } from "@/api/gamedata";
import { useItemTooltip } from "@/api/gamedata";
import { ItemTooltip } from "@/components/ui/ItemTooltip";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { iconUrl } from "@/config/iconUrl";
import { cn } from "@/lib/utils";
import type { ItemSearchResult } from "@/api/typesGenerated";

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

const QUALITY_LABELS: Record<number, string> = {
  0: "Poor",
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Epic",
  5: "Legendary",
  6: "Artifact",
};

const INVENTORY_TYPE_LABELS: Record<number, string> = {
  0: "",
  1: "Head",
  2: "Neck",
  3: "Shoulder",
  4: "Shirt",
  5: "Chest",
  6: "Waist",
  7: "Legs",
  8: "Feet",
  9: "Wrists",
  10: "Hands",
  11: "Finger",
  12: "Trinket",
  13: "One-Hand",
  14: "Shield",
  15: "Ranged",
  16: "Back",
  17: "Two-Hand",
  18: "Bag",
  19: "Tabard",
  20: "Robe",
  21: "Main Hand",
  22: "Off Hand",
  23: "Holdable",
  24: "Ammo",
  25: "Thrown",
  26: "Ranged",
  28: "Relic",
};

const ITEM_CLASS_LABELS: Record<number, string> = {
  0: "Consumable",
  1: "Container",
  2: "Weapon",
  3: "Gem",
  4: "Armor",
  5: "Reagent",
  6: "Projectile",
  7: "Trade Goods",
  9: "Recipe",
  11: "Quiver",
  12: "Quest",
  13: "Key",
  15: "Miscellaneous",
};

// Weapon subclasses (class=2)
const WEAPON_SUBCLASS: Record<number, string> = {
  0: "Axe", 1: "Axe", 2: "Bow", 3: "Gun", 4: "Mace", 5: "Mace",
  6: "Polearm", 7: "Sword", 8: "Sword", 10: "Staff",
  13: "Fist", 14: "Misc", 15: "Dagger", 16: "Thrown",
  17: "Spear", 18: "Crossbow", 19: "Wand", 20: "Fishing Pole",
};

// Armor subclasses (class=4)
const ARMOR_SUBCLASS: Record<number, string> = {
  0: "Misc", 1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate",
  6: "Shield",
};

// Recipe subclasses (class=9)
const RECIPE_SUBCLASS: Record<number, string> = {
  0: "Book", 1: "Leatherworking", 2: "Tailoring", 3: "Engineering",
  4: "Blacksmithing", 5: "Cooking", 6: "Alchemy", 7: "First Aid",
  8: "Enchanting", 9: "Fishing",
};

// Skill IDs → profession name
const SKILL_LABELS: Record<number, string> = {
  164: "Blacksmithing", 165: "Leatherworking", 171: "Alchemy",
  182: "Herbalism", 185: "Cooking", 186: "Mining", 197: "Tailoring",
  202: "Engineering", 333: "Enchanting", 356: "Fishing", 393: "Skinning",
  129: "First Aid",
};

// --- Helpers ---

function getTypeLabel(item: ItemSearchResult): string {
  if (item.class === 2) {
    // Weapon
    const sub = WEAPON_SUBCLASS[item.subclass] ?? "";
    return sub ? `Weapon / ${sub}` : "Weapon";
  }
  if (item.class === 4) {
    // Armor
    const sub = ARMOR_SUBCLASS[item.subclass] ?? "";
    return sub ? `Armor / ${sub}` : "Armor";
  }
  if (item.class === 9) {
    const sub = RECIPE_SUBCLASS[item.subclass] ?? "";
    return sub ? `Recipe / ${sub}` : "Recipe";
  }
  if (item.class === 1 || item.class === 11) {
    // Container / Quiver
    return item.class === 1 ? "Container" : "Quiver";
  }
  return ITEM_CLASS_LABELS[item.class] ?? "";
}

function getDetailsLabel(item: ItemSearchResult): string {
  // Weapon: speed + DPS
  if (item.class === 2 && item.delay > 0 && item.dmg_max1 > 0) {
    const speed = item.delay / 1000;
    const avgDmg = (item.dmg_min1 + item.dmg_max1) / 2;
    const dps = avgDmg / speed;
    return `${speed.toFixed(1)}s · ${dps.toFixed(1)} DPS`;
  }
  // Bag / Quiver: # slots
  if ((item.class === 1 || item.class === 11) && item.container_slots > 0) {
    return `${item.container_slots} Slot`;
  }
  // Recipe / Pattern: profession + skill level
  if (item.class === 9 && item.required_skill > 0) {
    const prof = SKILL_LABELS[item.required_skill] ?? `Skill ${item.required_skill}`;
    return item.required_skill_rank > 0 ? `${prof} (${item.required_skill_rank})` : prof;
  }
  // Armor with armor value
  if (item.class === 4 && item.armor > 0) {
    return `${item.armor} Armor`;
  }
  // Projectile
  if (item.class === 6 && item.dmg_max1 > 0) {
    const avgDmg = (item.dmg_min1 + item.dmg_max1) / 2;
    return `${avgDmg.toFixed(1)} DPS`;
  }
  return "";
}

// --- Components ---

function ItemIcon({ icon, quality, size = 32 }: { icon: string; quality: number; size?: number }) {
  const url = iconUrl(icon);
  const border = QUALITY_BORDER[quality] ?? QUALITY_BORDER[0];

  if (!url) {
    return (
      <div
        className={cn("rounded border bg-gray-800 flex items-center justify-center shrink-0", border)}
        style={{ width: size, height: size }}
      >
        <Package className="h-4 w-4 text-gray-500" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={cn("rounded border shrink-0", border)}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}

function HoverTooltip({ itemId, children }: { itemId: number; children: React.ReactNode }) {
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

function ExpandedTooltip({ itemId, onClose }: { itemId: number; onClose: () => void }) {
  const { data: item, isLoading, error } = useItemTooltip({ itemId });

  return (
    <div className="border border-gray-700 rounded-lg bg-gray-900/95 p-4 mt-1 mb-2">
      <div className="flex justify-end mb-2">
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors"
          aria-label="Close tooltip"
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
      {error && <div className="text-red-400 text-sm">Failed to load item tooltip</div>}
      {item && <ItemTooltip item={item} includeReferenceLinks showItemLevel />}
    </div>
  );
}

const GRID_COLS = "grid-cols-[36px_1fr_50px_50px_90px_130px_140px]";

function ResultRow({
  item,
  isExpanded,
  onToggle,
}: {
  item: ItemSearchResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const qualityClass = QUALITY_COLORS[item.quality] ?? "text-quality-common";
  const slotLabel = INVENTORY_TYPE_LABELS[item.inventory_type] ?? "";
  const typeLabel = getTypeLabel(item);
  const details = getDetailsLabel(item);

  return (
    <>
      <HoverTooltip itemId={item.entry}>
        <button
          onClick={onToggle}
          className={cn(
            "w-full text-left grid gap-3 items-center px-3 py-1.5 rounded-md transition-colors",
            GRID_COLS,
            "hover:bg-gray-800/80",
            isExpanded && "bg-gray-800/60"
          )}
        >
          <ItemIcon icon={item.icon} quality={item.quality} size={28} />
          <span className={cn("font-medium truncate", qualityClass)}>
            {item.name}
          </span>
          <span className="text-gray-500 text-xs text-right tabular-nums">
            {item.item_level || ""}
          </span>
          <span className="text-gray-500 text-xs text-right tabular-nums">
            {item.required_level > 0 ? item.required_level : ""}
          </span>
          <span className="text-gray-500 text-xs text-right truncate">{slotLabel}</span>
          <span className="text-gray-500 text-xs truncate">{typeLabel}</span>
          <span className="text-gray-500 text-xs truncate">{details}</span>
        </button>
      </HoverTooltip>
      {isExpanded && <ExpandedTooltip itemId={item.entry} onClose={onToggle} />}
    </>
  );
}

const selectClasses = "bg-gray-800 border border-gray-600 rounded px-2 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors";

export function ItemExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get("q") ?? "");
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const q = searchParams.get("q") ?? "";
  const quality = searchParams.get("quality") ? Number(searchParams.get("quality")) : undefined;
  const slot = searchParams.get("slot") ? Number(searchParams.get("slot")) : undefined;
  const itemClass = searchParams.get("class") ? Number(searchParams.get("class")) : undefined;
  const sort = searchParams.get("sort") ?? undefined;

  const { data: results, isLoading, isFetching, error } = useSearchItems(
    q.length >= 2 ? { q, quality, slot, class: itemClass, sort } : null
  );

  const updateParams = useCallback(
    (updates: Record<string, string | undefined>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value === undefined || value === "" || value === "-1") {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        }
        return next;
      });
      setExpandedItem(null);
    },
    [setSearchParams]
  );

  // Cycle through sort states: unsorted → desc → asc → unsorted
  const toggleSort = useCallback(
    (field: string) => {
      const descKey = `${field}_desc`;
      const ascKey = `${field}_asc`;
      let next: string | undefined;
      if (sort === descKey) next = ascKey;
      else if (sort === ascKey) next = undefined;
      else next = descKey;
      updateParams({ sort: next });
    },
    [sort, updateParams]
  );

  function SortIcon({ field }: { field: string }) {
    if (sort === `${field}_desc`) return <ArrowDown className="h-3 w-3" />;
    if (sort === `${field}_asc`) return <ArrowUp className="h-3 w-3" />;
    return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  }

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateParams({ q: inputValue || undefined });
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [inputValue, updateParams]);

  return (
    <div className="space-y-6">
      {/* Search + Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Search items by name..."
            className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            autoFocus
          />
          {inputValue && (
            <button
              onClick={() => {
                setInputValue("");
                updateParams({ q: undefined });
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <select
            value={quality ?? -1}
            onChange={(e) => updateParams({ quality: e.target.value })}
            className={selectClasses}
          >
            <option value="-1">Any Quality</option>
            {Object.entries(QUALITY_LABELS).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>

          <select
            value={slot ?? -1}
            onChange={(e) => updateParams({ slot: e.target.value })}
            className={selectClasses}
          >
            <option value="-1">Any Slot</option>
            {Object.entries(INVENTORY_TYPE_LABELS)
              .filter(([, label]) => label !== "")
              .map(([v, label]) => (
                <option key={v} value={v}>{label}</option>
              ))}
          </select>

          <select
            value={itemClass ?? -1}
            onChange={(e) => updateParams({ class: e.target.value })}
            className={selectClasses}
          >
            <option value="-1">Any Type</option>
            {Object.entries(ITEM_CLASS_LABELS).map(([v, label]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
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
              <span className="text-xs text-gray-500">Hover for tooltip · click to expand</span>
            </div>
            <div className={cn("grid gap-3 items-center px-3 text-xs text-gray-500 font-medium", GRID_COLS)}>
              <span />
              <span>Name</span>
              <button
                onClick={() => toggleSort("item_level")}
                className="flex items-center justify-end gap-1 hover:text-gray-300 transition-colors"
              >
                iLvl <SortIcon field="item_level" />
              </button>
              <button
                onClick={() => toggleSort("required_level")}
                className="flex items-center justify-end gap-1 hover:text-gray-300 transition-colors"
              >
                Req <SortIcon field="required_level" />
              </button>
              <span className="text-right">Slot</span>
              <span>Type</span>
              <span>Details</span>
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
            {error instanceof Error ? error.message : "Failed to search items"}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && q.length >= 2 && results && results.length === 0 && (
          <div className="text-gray-500 text-center py-12">
            No items found matching &ldquo;{q}&rdquo;
          </div>
        )}

        {/* Prompt */}
        {q.length < 2 && (
          <div className="text-gray-500 text-center py-12 space-y-2">
            <Package className="h-10 w-10 mx-auto text-gray-600" />
            <p>Type at least 2 characters to search</p>
            <div className="text-xs text-gray-600 space-x-3 pt-2">
              <span>Try:</span>
              <button
                className="text-blue-400/70 hover:text-blue-400"
                onClick={() => setInputValue("Thunderfury")}
              >
                Thunderfury
              </button>
              <button
                className="text-blue-400/70 hover:text-blue-400"
                onClick={() => setInputValue("Ashkandi")}
              >
                Ashkandi
              </button>
              <button
                className="text-blue-400/70 hover:text-blue-400"
                onClick={() => setInputValue("Cenarion")}
              >
                Cenarion
              </button>
            </div>
          </div>
        )}

        {/* Results list */}
        {results && results.length > 0 && (
          <div className="space-y-0.5 pt-2">
            {results.map((item) => (
              <ResultRow
                key={item.entry}
                item={item}
                isExpanded={expandedItem === item.entry}
                onToggle={() =>
                  setExpandedItem((prev) => (prev === item.entry ? null : item.entry))
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
