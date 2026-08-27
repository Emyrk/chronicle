import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Search, Loader2, Package, X, ArrowUpDown, ArrowDown, ArrowUp, ChevronDown, Check } from "lucide-react";
import { useCurrentItemPrices, useItemPricingRealms, useSearchItems } from "@/api/gamedata";
import { useItemTooltip } from "@/api/gamedata";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { ItemTooltip } from "@/components/ui/ItemTooltip";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import type { AuctionHouseFaction, ItemSearchResult } from "@/api/typesGenerated";

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

const GRID_COLS = "grid-cols-[36px_1fr_50px_50px_90px_130px_140px]";
const GRID_COLS_WITH_PRICE = "grid-cols-[36px_1fr_50px_50px_90px_130px_140px_100px]";

function formatPrice(copper: number): string {
  const gold = Math.floor(copper / 10000);
  const silver = Math.floor((copper % 10000) / 100);
  const remainingCopper = copper % 100;
  if (gold > 0) return `${gold}g ${silver}s ${remainingCopper}c`;
  if (silver > 0) return `${silver}s ${remainingCopper}c`;
  return `${remainingCopper}c`;
}

function ResultRow({
  item,
  priceCopper,
  showPrice,
  pricingRealmId,
  pricingFaction,
}: {
  item: ItemSearchResult;
  priceCopper?: number;
  showPrice: boolean;
  pricingRealmId?: string;
  pricingFaction?: AuctionHouseFaction;
}) {
  const qualityClass = QUALITY_COLORS[item.quality] ?? "text-quality-common";
  const slotLabel = INVENTORY_TYPE_LABELS[item.inventory_type] ?? "";
  const typeLabel = getTypeLabel(item);
  const details = getDetailsLabel(item);
  const itemParams = new URLSearchParams({ id: String(item.entry) });
  if (pricingRealmId) itemParams.set("pricing_realm", pricingRealmId);
  if (pricingFaction && pricingFaction !== "merged") itemParams.set("pricing_faction", pricingFaction);

  return (
    <HoverTooltip itemId={item.entry}>
      <Link
        to={`/wowdb/item?${itemParams}`}
        className={cn(
          "w-full text-left grid gap-3 items-center px-3 py-1.5 rounded-md transition-colors",
          showPrice ? GRID_COLS_WITH_PRICE : GRID_COLS,
          "hover:bg-gray-800/80"
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
        {showPrice && (
          <span className="text-amber-300/90 text-xs text-right tabular-nums">
            {priceCopper === undefined ? "—" : formatPrice(priceCopper)}
          </span>
        )}
      </Link>
    </HoverTooltip>
  );
}

// --- Multi-select dropdown ---

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const summary = selected.size === 0
    ? label
    : selected.size === 1
      ? options.find((o) => o.value === [...selected][0])?.label ?? label
      : `${selected.size} selected`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 bg-gray-800 border border-gray-600 rounded px-2.5 py-2 text-sm text-white hover:border-gray-500 transition-colors min-w-[120px]"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-48 max-h-64 overflow-auto rounded-md border border-gray-600 bg-gray-800 py-1 shadow-lg">
          {selected.size > 0 && (
            <button
              onClick={() => onChange(new Set())}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-700 transition-colors"
            >
              Clear all
            </button>
          )}
          {options.map((opt) => {
            const isSelected = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm text-white hover:bg-gray-700 transition-colors"
              >
                <span className={cn(
                  "flex items-center justify-center h-4 w-4 rounded border shrink-0",
                  isSelected ? "bg-gray-500 border-gray-400" : "border-gray-500"
                )}>
                  {isSelected && <Check className="h-3 w-3" />}
                </span>
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ItemExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get("q") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const q = searchParams.get("q") ?? "";
  const qualityParam = searchParams.get("quality") ?? "";
  const slotParam = searchParams.get("slot") ?? "";
  const classParam = searchParams.get("class") ?? "";
  const pricingRealmParam = searchParams.get("pricing_realm") ?? "";
  const pricingFactionParam = searchParams.get("pricing_faction") ?? "";
  const sort = searchParams.get("sort") ?? undefined;

  const qualitySet = useMemo(() => new Set(qualityParam ? qualityParam.split(",") : []), [qualityParam]);
  const slotSet = useMemo(() => new Set(slotParam ? slotParam.split(",") : []), [slotParam]);
  const classSet = useMemo(() => new Set(classParam ? classParam.split(",") : []), [classParam]);

  const { data: results, isLoading, isFetching, error } = useSearchItems(
    q.length >= 2 ? {
      q,
      quality: qualityParam || undefined,
      slot: slotParam || undefined,
      class: classParam || undefined,
      sort,
    } : null
  );

  const { data: pricingRealms } = useItemPricingRealms();
  const selectedPricingRealm = pricingRealms?.find((realm) => realm.id === pricingRealmParam);
  const pricingFaction: AuctionHouseFaction | "" = selectedPricingRealm?.auction_house === "merged"
    ? "merged"
    : pricingFactionParam === "alliance" || pricingFactionParam === "horde"
      ? pricingFactionParam
      : selectedPricingRealm?.auction_house === "split"
        ? "alliance"
        : "";
  const { data: itemPrices, isFetching: pricesFetching } = useCurrentItemPrices(
    selectedPricingRealm?.id ?? "",
    pricingFaction,
    (results ?? []).map((item) => item.entry),
  );
  const priceByItem = useMemo(
    () => new Map((itemPrices ?? []).flatMap((price) =>
      price.price_copper === undefined ? [] : [[price.item_id, price.price_copper] as const],
    )),
    [itemPrices],
  );
  const showPrice = selectedPricingRealm !== undefined;

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

  const sortIcon = (field: string) => {
    if (sort === `${field}_desc`) return <ArrowDown className="h-3 w-3" />;
    if (sort === `${field}_asc`) return <ArrowUp className="h-3 w-3" />;
    return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  };

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
            className="w-full bg-gray-800 border border-gray-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-gray-400 transition-colors"
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
          <MultiSelect
            label="Any Quality"
            options={Object.entries(QUALITY_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            selected={qualitySet}
            onChange={(s) => updateParams({ quality: [...s].join(",") || undefined })}
          />
          <MultiSelect
            label="Any Slot"
            options={Object.entries(INVENTORY_TYPE_LABELS)
              .filter(([, l]) => l !== "")
              .map(([v, l]) => ({ value: v, label: l }))}
            selected={slotSet}
            onChange={(s) => updateParams({ slot: [...s].join(",") || undefined })}
          />
          <MultiSelect
            label="Any Type"
            options={Object.entries(ITEM_CLASS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
            selected={classSet}
            onChange={(s) => updateParams({ class: [...s].join(",") || undefined })}
          />

        {(pricingRealms?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Pricing realm"
              value={selectedPricingRealm?.id ?? ""}
              onChange={(event) => {
                const realm = pricingRealms?.find((candidate) => candidate.id === event.target.value);
                updateParams({
                  pricing_realm: realm?.id,
                  pricing_faction: realm?.auction_house === "split" ? "alliance" : undefined,
                });
              }}
              className="bg-gray-800 border border-gray-600 rounded px-2.5 py-2 text-sm text-white hover:border-gray-500 transition-colors"
            >
              <option value="">No price realm</option>
              {pricingRealms?.map((realm) => (
                <option key={realm.id} value={realm.id}>
                  {realm.server_name} · {realm.realm_name}
                </option>
              ))}
            </select>
            {selectedPricingRealm?.auction_house === "split" && (
              <select
                aria-label="Auction house faction"
                value={pricingFaction}
                onChange={(event) => updateParams({ pricing_faction: event.target.value })}
                className="bg-gray-800 border border-gray-600 rounded px-2.5 py-2 text-sm text-white hover:border-gray-500 transition-colors"
              >
                <option value="alliance">Alliance</option>
                <option value="horde">Horde</option>
              </select>
            )}
            {selectedPricingRealm && (
              <span className="text-xs text-gray-500">Average price from the last 24 hours</span>
            )}
          </div>
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
              <span className="text-xs text-gray-500">Hover for tooltip · click to view</span>
            </div>
            <div className={cn("grid gap-3 items-center px-3 text-xs text-gray-500 font-medium", showPrice ? GRID_COLS_WITH_PRICE : GRID_COLS)}>
              <span />
              <span>Name</span>
              <button
                onClick={() => toggleSort("item_level")}
                className="flex items-center justify-end gap-1 hover:text-gray-300 transition-colors"
              >
                iLvl {sortIcon("item_level")}
              </button>
              <button
                onClick={() => toggleSort("required_level")}
                className="flex items-center justify-end gap-1 hover:text-gray-300 transition-colors"
              >
                Req {sortIcon("required_level")}
              </button>
              <span className="text-right">Slot</span>
              <span>Type</span>
              <span>Details</span>
              {showPrice && (
                <span className="flex items-center justify-end gap-1">
                  Price {pricesFetching && <Loader2 className="h-3 w-3 animate-spin" />}
                </span>
              )}
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
                priceCopper={priceByItem.get(item.entry)}
                showPrice={showPrice}
                pricingRealmId={selectedPricingRealm?.id}
                pricingFaction={pricingFaction || undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
