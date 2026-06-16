import { useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Loader2, Shield, ArrowLeft } from "lucide-react";
import { useItemSetDetail, useItemTooltip } from "@/api/gamedata";
import { useSpell } from "@/api/queries";
import { ItemTooltip } from "@/components/ui/ItemTooltip";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { useQueries } from "@tanstack/react-query";
import { iconUrl } from "@/config/iconUrl";
import { cn } from "@/lib/utils";
import type { ItemSetPieceInfo, ItemSetBonus } from "@/api/typesGenerated";
import {
  type WoWSpell,
  getEnglishText,
  extractReferencedSpellIds,
  resolveSpellDescription,
} from "@/api/wowdb";

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
  1: "Head", 2: "Neck", 3: "Shoulder", 4: "Shirt", 5: "Chest",
  6: "Waist", 7: "Legs", 8: "Feet", 9: "Wrists", 10: "Hands",
  11: "Finger", 12: "Trinket", 13: "One-Hand", 14: "Shield",
  15: "Ranged", 16: "Back", 17: "Two-Hand", 18: "Bag", 19: "Tabard",
  20: "Robe", 21: "Main Hand", 22: "Off Hand", 23: "Holdable",
  24: "Ammo", 25: "Thrown", 26: "Ranged", 28: "Relic",
};

const SKILL_LABELS: Record<number, string> = {
  164: "Blacksmithing", 165: "Leatherworking", 171: "Alchemy",
  185: "Cooking", 186: "Mining", 197: "Tailoring",
  202: "Engineering", 333: "Enchanting", 356: "Fishing",
  129: "First Aid",
};

// --- Spell text resolution (same pattern as ItemTooltip.tsx) ---

function useResolvedSpellText(spellId: number): string {
  const { data: spellData } = useSpell(String(spellId), undefined, {
    enabled: spellId > 0,
  });

  const descTemplate = spellData ? getEnglishText(spellData.description) : "";
  const auraTemplate = spellData ? getEnglishText(spellData.aura_description) : "";

  const referencedIds = useMemo(() => {
    const ids = [
      ...extractReferencedSpellIds(descTemplate),
      ...extractReferencedSpellIds(auraTemplate),
    ];
    return [...new Set(ids)];
  }, [descTemplate, auraTemplate]);

  const refQueries = useQueries({
    queries: referencedIds.map((id) => ({
      queryKey: ["wowdb", "spell", id.toString()],
      queryFn: async () => {
        const response = await fetch(`/api/v1/wowdb/spell/${id}`);
        if (!response.ok) return null;
        return response.json() as Promise<WoWSpell>;
      },
      staleTime: 24 * 60 * 60 * 1000,
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
  return desc || auraDesc || getEnglishText(spellData.name) || `Spell #${spellId}`;
}

// --- Components ---

function PieceIcon({ piece }: { piece: ItemSetPieceInfo }) {
  const url = iconUrl(piece.icon);
  const border = QUALITY_BORDER[piece.quality] ?? QUALITY_BORDER[1];

  if (!url) {
    return (
      <div
        className={cn("rounded border bg-gray-800 flex items-center justify-center shrink-0", border)}
        style={{ width: 36, height: 36 }}
      >
        <Shield className="h-4 w-4 text-gray-500" />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt=""
      className={cn("rounded border shrink-0", border)}
      style={{ width: 36, height: 36 }}
      loading="lazy"
    />
  );
}

function PieceRow({ piece }: { piece: ItemSetPieceInfo }) {
  const { data: item } = useItemTooltip({ itemId: piece.entry });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={`/wowdb/item?id=${piece.entry}`}
          className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800/80 transition-colors group"
        >
          <PieceIcon piece={piece} />
          <div className="flex-1 min-w-0">
            <span className={cn("font-medium group-hover:underline", QUALITY_COLORS[piece.quality] ?? "text-quality-common")}>
              {piece.name}
            </span>
          </div>
          {INVENTORY_TYPE_LABELS[piece.inventory_type] && (
            <span className="text-gray-500 text-sm shrink-0">
              {INVENTORY_TYPE_LABELS[piece.inventory_type]}
            </span>
          )}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" sideOffset={8} hideArrow className="p-0 bg-transparent border-0 shadow-none max-w-none">
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

function BonusRow({ bonus }: { bonus: ItemSetBonus }) {
  const text = useResolvedSpellText(bonus.spell_id);

  return (
    <div className="flex items-start gap-2 text-sm px-3 py-1">
      <span className="text-yellow-500 font-medium shrink-0">({bonus.threshold}) Set:</span>
      <Link
        to={`/wowdb/spell/${bonus.spell_id}`}
        className="text-quality-uncommon hover:underline"
      >
        {text}
      </Link>
    </div>
  );
}

export function ItemSetDetailPage() {
  const [searchParams] = useSearchParams();
  const setId = Number(searchParams.get("id")) || 0;

  const { data: detail, isLoading, error } = useItemSetDetail(setId > 0 ? setId : null);

  const maxQuality = useMemo(() => {
    if (!detail?.pieces.length) return 1;
    return Math.max(...detail.pieces.map((p) => p.quality));
  }, [detail]);

  if (setId <= 0) {
    return (
      <div className="text-gray-500 text-center py-12">
        No item set ID provided. <Link to="/wowdb/sets" className="text-blue-400 hover:underline">Search item sets</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/wowdb/sets"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-blue-400 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Item Sets
      </Link>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 text-gray-400 py-12">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading item set...
        </div>
      )}

      {error && (
        <div className="text-red-400 text-center py-8">
          Failed to load item set
        </div>
      )}

      {detail && (
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h2 className={cn("text-xl font-bold", QUALITY_COLORS[maxQuality] ?? "text-quality-common")}>
              {detail.name}
            </h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
              <span>{detail.pieces.length} pieces</span>
              {detail.bonuses.length > 0 && (
                <span>{detail.bonuses.length} bonus{detail.bonuses.length !== 1 ? "es" : ""}</span>
              )}
              {detail.required_skill > 0 && (
                <span>
                  Requires {SKILL_LABELS[detail.required_skill] ?? `Skill ${detail.required_skill}`}
                  {detail.required_skill_rank > 0 && ` (${detail.required_skill_rank})`}
                </span>
              )}
            </div>
          </div>

          {/* Pieces */}
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-gray-400 px-3 pb-1 border-b border-gray-700/50">
              Set Pieces
            </h3>
            {detail.pieces.map((piece) => (
              <PieceRow key={piece.entry} piece={piece} />
            ))}
          </div>

          {/* Bonuses */}
          {detail.bonuses.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-gray-400 px-3 pb-1 border-b border-gray-700/50">
                Set Bonuses
              </h3>
              {detail.bonuses.map((bonus) => (
                <BonusRow key={`${bonus.threshold}-${bonus.spell_id}`} bonus={bonus} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
