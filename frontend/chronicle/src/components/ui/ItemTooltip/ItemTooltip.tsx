import { useMemo } from "react";
import { Link } from "react-router-dom";
import { iconUrl } from "@/config/iconUrl";
import { useQueries } from "@tanstack/react-query";
import type { ItemTooltip as ItemTooltipData, ItemSpell } from "@/api/typesGenerated";
import { useSpell } from "@/api/queries";
import {
  type WoWSpell,
  extractReferencedSpellIds,
  getEnglishText,
  resolveSpellDescription,
} from "@/api/wowdb";
import { cn } from "@/lib/utils";

// WoW item quality colors
const QUALITY_COLORS: Record<number, string> = {
  0: "text-quality-poor",
  1: "text-quality-common",
  2: "text-quality-uncommon",
  3: "text-quality-rare",
  4: "text-quality-epic",
  5: "text-quality-legendary",
  6: "text-quality-artifact",
};

const BONDING_TEXT: Record<number, string> = {
  1: "Binds when picked up",
  2: "Binds when equipped",
  3: "Binds when used",
  4: "Quest Item",
};

const INVENTORY_TYPE_TEXT: Record<number, string> = {
  1: "Head",
  2: "Neck",
  3: "Shoulder",
  4: "Shirt",
  5: "Chest",
  6: "Waist",
  7: "Legs",
  8: "Feet",
  9: "Wrist",
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

const ITEM_CLASS_TEXT: Record<string, string> = {
  "2-0": "Axe", "2-1": "Axe", "2-2": "Bow", "2-3": "Gun",
  "2-4": "Mace", "2-5": "Mace", "2-6": "Polearm", "2-7": "Sword",
  "2-8": "Sword", "2-9": "Obsolete", "2-10": "Staff",
  "2-13": "Fist Weapon", "2-14": "Miscellaneous", "2-15": "Dagger",
  "2-16": "Thrown", "2-17": "Spear", "2-18": "Crossbow", "2-19": "Wand",
  "2-20": "Fishing Pole",
  "4-0": "Miscellaneous", "4-1": "Cloth", "4-2": "Leather",
  "4-3": "Mail", "4-4": "Plate", "4-6": "Shield",
};

const STAT_TYPE_TEXT: Record<number, string> = {
  0: "Mana", 1: "Health", 3: "Agility", 4: "Strength",
  5: "Intellect", 6: "Spirit", 7: "Stamina",
};

const SCHOOL_TEXT: Record<number, string> = {
  0: "Physical", 1: "Holy", 2: "Fire", 3: "Nature",
  4: "Frost", 5: "Shadow", 6: "Arcane",
};

const SPELL_TRIGGER_TEXT: Record<number, string> = {
  0: "Use:",
  1: "Equip:",
  2: "Chance on hit:",
};

function getItemIconUrl(icon: string): string {
  return iconUrl(icon);
}

interface ItemTooltipProps {
  item: ItemTooltipData;
  className?: string;
  /** When true, spell names link to /wowdb/spell/{id} */
  includeReferenceLinks?: boolean;
  showItemLevel?: boolean;
  /** Set of item entry IDs the player has equipped (for set piece highlighting). */
  equippedItemIds?: ReadonlySet<number>;
  /** If the item is transmogrified, the name of the transmog appearance. */
  transmogName?: string;
}

/**
 * WoW-style item tooltip component.
 * Renders a full item tooltip with stats, damage, set bonuses, etc.
 * Designed to match the in-game tooltip appearance.
 */
export function ItemTooltip({ item, className, includeReferenceLinks = false, showItemLevel = false, equippedItemIds, transmogName }: ItemTooltipProps) {
  const qualityColor = QUALITY_COLORS[item.quality] ?? "text-white";
  const iconUrl = getItemIconUrl(item.icon);
  const slotText = INVENTORY_TYPE_TEXT[item.inventory_type] ?? "";
  const subtypeText = ITEM_CLASS_TEXT[`${item.item_class}-${item.item_subclass}`] ?? "";

  // Compute DPS for weapons
  const primaryDmg = item.damage_ranges?.[0];
  const dps = primaryDmg && item.delay
    ? ((primaryDmg.min + primaryDmg.max) / 2) / (item.delay / 1000)
    : null;

  const displayName = item.suffix_name
    ? `${item.name} ${item.suffix_name}`
    : item.name;

  return (
    <div className={cn(
      "bg-[#1a1a2e] border-2 border-[#4a4a6a] rounded-lg p-3 min-w-56 max-w-xs shadow-lg text-xs leading-snug font-wow",
      className
    )}>
      {/* Header: icon + name */}
      <div className="flex gap-3 items-start">
        {iconUrl && (
          <img
            src={iconUrl}
            alt=""
            width={44}
            height={44}
            className="rounded border-2 border-yellow-600/60 flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <h2 className={cn("font-medium text-sm leading-tight", qualityColor)}>
            {displayName}
          </h2>
          {transmogName && (
            <span className="text-fuchsia-400 text-xs">Transmogrified to {transmogName}</span>
          )}
          {showItemLevel && item.item_level > 0 && (
            <span className="text-yellow-400 text-xs">Item Level {item.item_level}</span>
          )}
        </div>
      </div>

      <div className="mt-2 space-y-0.5">
        {/* Bonding */}
        {item.bonding > 0 && BONDING_TEXT[item.bonding] && (
          <div className="text-white">{BONDING_TEXT[item.bonding]}</div>
        )}

        {/* Slot and subtype */}
        {(slotText || subtypeText) && (
          <div className="flex justify-between text-white">
            <span>{slotText}</span>
            <span>{subtypeText}</span>
          </div>
        )}

        {/* Damage */}
        {item.damage_ranges?.map((dmg, i) => (
          <div key={i} className="flex justify-between gap-4 text-white">
            <span>
              {dmg.min.toFixed(0)} - {dmg.max.toFixed(0)} {dmg.school > 0 ? SCHOOL_TEXT[dmg.school] : ""} Damage
            </span>
            {i === 0 && item.delay && (
              <span>Speed {(item.delay / 1000).toFixed(2)}</span>
            )}
          </div>
        ))}

        {/* DPS */}
        {dps != null && (
          <div className="text-white">({dps.toFixed(1)} damage per second)</div>
        )}

        {/* Armor */}
        {!!item.armor && (
          <div className="text-white">{item.armor} Armor</div>
        )}

        {/* Block */}
        {!!item.block && (
          <div className="text-white">{item.block} Block</div>
        )}

        {/* Stats */}
        {item.stats?.map((stat, i) => (
          <div key={i} className="text-white">
            +{stat.value} {STAT_TYPE_TEXT[stat.type] ?? `Stat ${stat.type}`}
          </div>
        ))}

        {/* Resistances */}
        {item.resistances?.map((res, i) => (
          <div key={i} className="text-white">
            +{res.value} {SCHOOL_TEXT[res.school] ?? "Unknown"} Resistance
          </div>
        ))}

        {/* Enchantment (green text) */}
        {item.enchantment && (
          <div className="text-quality-uncommon">{item.enchantment}</div>
        )}

        {/* Random enchantment effects (green text) */}
        {item.random_enchantments?.map((line, i) => (
          <div key={i} className="text-quality-uncommon">{line}</div>
        ))}

        {/* Random enchantment placeholder (no random_property param given) */}
        {item.has_random_property && (
          <div className="text-quality-uncommon">&lt;Random enchantment&gt;</div>
        )}

        {/* Required level */}
        {!!item.required_level && item.required_level > 1 && (
          <div className="text-white">Requires Level {item.required_level}</div>
        )}

        {/* Spells */}
        {item.spells?.map((spell, i) => (
          <SpellLine key={i} spell={spell} includeReferenceLinks={includeReferenceLinks} />
        ))}

        {/* Description / flavor text */}
        {item.description && (
          <div className="text-item-flavor-text mt-1">"{item.description}"</div>
        )}

        {/* Item Set */}
        {item.set && <ItemSetSection set={item.set} includeReferenceLinks={includeReferenceLinks} equippedItemIds={equippedItemIds} />}
      </div>
    </div>
  );
}

/**
 * Hook that fetches a spell and all its cross-referenced spells, then resolves
 * the description templates with full placeholder substitution ($s1, $d, $53202s1, etc).
 */
function useResolvedSpellText(spellId: number): string {
  const { data: spellData } = useSpell(String(spellId), {
    enabled: spellId > 0,
  });

  const descTemplate = spellData ? getEnglishText(spellData.description) : "";
  const auraTemplate = spellData ? getEnglishText(spellData.aura_description) : "";

  // Extract cross-spell references like $53202s1
  const referencedIds = useMemo(() => {
    const ids = [
      ...extractReferencedSpellIds(descTemplate),
      ...extractReferencedSpellIds(auraTemplate),
    ];
    return [...new Set(ids)];
  }, [descTemplate, auraTemplate]);

  // Fetch all referenced spells in parallel
  const refQueries = useQueries({
    queries: referencedIds.map((id) => ({
      queryKey: ["wowdb", "spell", id.toString()],
      queryFn: async () => {
        const response = await fetch(`/api/v1/wowdb/spell/${id}`);
        if (!response.ok) return null;
        return response.json() as Promise<WoWSpell>;
      },
      staleTime: Infinity,
      retry: false,
    })),
  });

  const referencedSpells = useMemo(() => {
    const map = new Map<number, WoWSpell>();
    referencedIds.forEach((id, i) => {
      const data = refQueries[i]?.data;
      if (data) map.set(id, data);
    });
    return map;
  }, [referencedIds, refQueries]);

  if (!spellData) return `Spell #${spellId}`;

  const desc = resolveSpellDescription(spellData, descTemplate, referencedSpells);
  const auraDesc = resolveSpellDescription(spellData, auraTemplate, referencedSpells);
  return desc || auraDesc || spellData.name?.en_us || `Spell #${spellId}`;
}

function SpellLine({ spell, includeReferenceLinks }: { spell: ItemSpell; includeReferenceLinks: boolean }) {
  const trigger = SPELL_TRIGGER_TEXT[spell.trigger] ?? "Use:";
  const charges = spell.charges ? ` (${spell.charges} Charges)` : "";
  const text = useResolvedSpellText(spell.spell_id);

  if (includeReferenceLinks) {
    return (
      <div className="text-quality-uncommon">
        {trigger}{" "}
        <Link
          to={`/wowdb/spell/${spell.spell_id}`}
          className="hover:text-[#91fc91]"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </Link>
        {charges}
      </div>
    );
  }

  return (
    <div className="text-quality-uncommon">
      {trigger} {text}{charges}
    </div>
  );
}

function ItemSetSection({ set, includeReferenceLinks, equippedItemIds }: { set: NonNullable<ItemTooltipData["set"]>; includeReferenceLinks: boolean; equippedItemIds?: ReadonlySet<number> }) {
  const items = set.items ?? [];
  // Count equipped from eligible_items (cross-tier: a Furious piece counts toward Wrathful set).
  const eligible = set.eligible_items ?? [];
  const equippedCount = equippedItemIds
    ? eligible.filter((p) => equippedItemIds.has(p.entry)).length
    : 0;

  return (
    <div className="mt-2 pt-2 border-t border-[#4a4a6a]">
      <div className="text-yellow-400 font-medium">{set.name} ({equippedCount}/{items.length})</div>
      {items.map((piece) => {
        // Check if this piece OR a cross-tier equivalent (same inventory_type) is equipped.
        const isEquipped = equippedItemIds
          ? equippedItemIds.has(piece.entry) || eligible.some((e) => e.inventory_type === piece.inventory_type && equippedItemIds.has(e.entry))
          : false;
        return (
          <div key={piece.entry} className={cn("ml-2", isEquipped ? "text-item-set-active" : "text-gray-500")}>
            {includeReferenceLinks ? (
              <Link
                to={`/wowdb/item?id=${piece.entry}`}
                className={isEquipped ? "hover:text-white" : "hover:text-gray-400"}
                onClick={(e) => e.stopPropagation()}
              >
                {piece.name}
              </Link>
            ) : (
              piece.name
            )}
          </div>
        );
      })}
      {(set.bonuses ?? []).length > 0 && (
        <div className="mt-1 space-y-0.5">
          {(set.bonuses ?? []).map((bonus, i) => (
            <SetBonusLine key={i} threshold={bonus.threshold} spellId={bonus.spell_id} includeReferenceLinks={includeReferenceLinks} active={bonus.threshold <= equippedCount} />
          ))}
        </div>
      )}
    </div>
  );
}

function SetBonusLine({ threshold, spellId, includeReferenceLinks, active = false }: { threshold: number; spellId: number; includeReferenceLinks: boolean; active?: boolean }) {
  const text = useResolvedSpellText(spellId);

  return (
    <div className={active ? "text-quality-uncommon" : "text-gray-500"}>
      ({threshold}) Set:{" "}
      {includeReferenceLinks ? (
        <Link
          to={`/wowdb/spell/${spellId}`}
          className="hover:text-gray-300"
          onClick={(e) => e.stopPropagation()}
        >
          {text}
        </Link>
      ) : (
        text
      )}
    </div>
  );
}

export default ItemTooltip;
