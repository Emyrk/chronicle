import { useState } from "react";
import { ArrowUp, Check, Sparkles, StickyNote, X } from "lucide-react";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { CursorTooltip, type CursorPos } from "@/pages/ArmoryPage/overview/CursorTooltip";
import { getQualityBorderClass, getQualityTextClass, type GearSlotDef } from "@/pages/ArmoryPage/types";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { ENCHANTABLE_SLOTS, type GearSlotEntry } from "./gearListModel";
import { formatScore } from "./gearScoring";
import type { HydratedItem } from "./useListItems";

interface BuilderSlotProps {
  slotDef: GearSlotDef;
  entry?: GearSlotEntry;
  item?: HydratedItem;
  selected?: boolean;
  onSelect?: (outfitIndex: number) => void;
  /** Jump straight to the enchant editor for this slot (edit mode only). */
  onEnchant?: (outfitIndex: number) => void;
  equippedItemIds?: ReadonlySet<number>;
  /** Weighted stat score for the equipped item, when weights are active. */
  score?: number;
  /** Score difference vs the matched character's worn item (pick − worn). */
  wornDelta?: number;
  /** Character-match state for this slot, when a character is matched. */
  matchState?: "equipped" | "missing";
  /**
   * Progression only: the next level at which this slot changes, and what
   * it changes to. Rendered even on empty slots — "nothing yet, but a
   * helm arrives at 24" is the useful part while levelling.
   */
  nextUpgrade?: { level: number; name: string };
}

/**
 * One slot of the builder paperdoll, as a card: quality-bordered icon,
 * uppercase slot label, item name (or empty state), and score/alternate
 * annotations. Clicking selects the slot for editing when onSelect is
 * provided.
 */
export function BuilderSlot({
  slotDef,
  entry,
  item,
  selected = false,
  onSelect,
  onEnchant,
  equippedItemIds,
  score,
  wornDelta,
  matchState,
  nextUpgrade,
}: BuilderSlotProps) {
  const iconBaseUrl = useIconBaseUrl();
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState<CursorPos | null>(null);

  const isEmpty = !entry;
  const quality = item?.quality ?? 1;
  const displayName = isEmpty ? "Empty" : item?.name || `Item #${entry.item_id}`;
  const altCount = entry?.alternates?.length ?? 0;
  const enchantText = item?.tooltip?.enchantment;
  const canEnchant = !!onEnchant && !isEmpty && ENCHANTABLE_SLOTS.has(slotDef.outfitIndex);
  const showTooltip = cursor != null && !isMobile && !isEmpty && item?.tooltip;

  // The card itself is a <button> in edit mode, so the enchant shortcut
  // must be a non-button interactive element to stay valid HTML.
  const enchantClick = canEnchant
    ? (e: React.MouseEvent) => {
        e.stopPropagation();
        onEnchant!(slotDef.outfitIndex);
      }
    : undefined;

  const Wrapper = onSelect ? "button" : "div";

  return (
    <Wrapper
      {...(onSelect ? { type: "button" as const, onClick: () => onSelect(slotDef.outfitIndex) } : {})}
      className={cn(
        "flex w-full min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors",
        selected ? "border-blue-500 bg-blue-500/10" : "border-zinc-800 bg-zinc-900/70",
        onSelect && !selected && "hover:border-zinc-600 cursor-pointer",
      )}
      onMouseMove={(e: React.MouseEvent) => setCursor({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setCursor(null)}
    >
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center overflow-hidden rounded border-2 bg-zinc-950/80",
            isEmpty ? "border-zinc-800" : getQualityBorderClass(quality),
          )}
        >
          {!isEmpty && item?.icon && (
            <img
              src={iconUrl(item.icon, iconBaseUrl)}
              alt={displayName}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          )}
        </div>
        {!isEmpty && matchState && (
          <span
            title={
              matchState === "equipped"
                ? "The matched character is wearing this (or a listed alternate)"
                : "The matched character is not wearing this"
            }
            className={cn(
              "absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-950",
              matchState === "equipped" && "bg-blue-500 text-white",
              matchState === "missing" && "bg-amber-400 text-zinc-950",
            )}
          >
            {matchState === "missing" ? (
              <X className="h-2.5 w-2.5" strokeWidth={3.5} />
            ) : (
              <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
            )}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-3xs uppercase tracking-wider text-zinc-500">{slotDef.label}</div>
        <div
          className={cn(
            "truncate text-xs leading-tight",
            isEmpty ? "italic text-zinc-600" : getQualityTextClass(quality),
          )}
        >
          {displayName}
        </div>
        {(enchantText || canEnchant || altCount > 0 || entry?.note || score !== undefined || wornDelta !== undefined || nextUpgrade) && (
          <div className="flex flex-wrap items-center gap-x-1.5 text-3xs leading-tight text-zinc-500">
            {enchantText ? (
              <span
                role={enchantClick ? "button" : undefined}
                title={enchantClick ? "Change enchant" : undefined}
                onClick={enchantClick}
                className={cn(
                  "truncate text-quality-uncommon max-w-32",
                  enchantClick && "cursor-pointer hover:underline",
                )}
              >
                {enchantText}
              </span>
            ) : (
              canEnchant && (
                <span
                  role="button"
                  title="Add an enchant"
                  onClick={enchantClick}
                  className="inline-flex cursor-pointer items-center gap-0.5 text-zinc-600 hover:text-quality-uncommon"
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  Enchant
                </span>
              )
            )}
            {score !== undefined && (
              <span className="font-mono text-zinc-400">{formatScore(score)} pts</span>
            )}
            {wornDelta !== undefined && Math.abs(wornDelta) >= 0.05 && (
              <span
                title={
                  wornDelta > 0
                    ? "This pick scores higher than the item they are wearing"
                    : "The item they are wearing scores higher than this pick"
                }
                className={cn("font-mono", wornDelta > 0 ? "text-emerald-400" : "text-red-400")}
              >
                {wornDelta > 0 ? "+" : "−"}{formatScore(Math.abs(wornDelta))} vs worn
              </span>
            )}
            {altCount > 0 && <span>+{altCount} alt{altCount === 1 ? "" : "s"}</span>}
            {entry?.note && <StickyNote className="h-2.5 w-2.5 shrink-0" />}
            {nextUpgrade && (
              <span
                title={`At level ${nextUpgrade.level} this slot becomes ${nextUpgrade.name}`}
                className="inline-flex min-w-0 items-center gap-0.5 text-amber-500/80"
              >
                <ArrowUp className="h-2.5 w-2.5 shrink-0" />
                <span className="font-mono">{nextUpgrade.level}</span>
                <span className="truncate max-w-28">{nextUpgrade.name}</span>
              </span>
            )}
          </div>
        )}
      </div>

      {showTooltip && (
        <CursorTooltip pos={cursor!}>
          <ItemTooltip item={item.tooltip!} equippedItemIds={equippedItemIds} />
        </CursorTooltip>
      )}
    </Wrapper>
  );
}
