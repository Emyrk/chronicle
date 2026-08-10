import { useState } from "react";
import { ArrowUp, Check, LockKeyhole, Sparkles, StickyNote, X } from "lucide-react";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import {
  CursorTooltip,
  type CursorPos,
} from "@/pages/ArmoryPage/overview/CursorTooltip";
import {
  getQualityBorderClass,
  getQualityTextClass,
  type GearSlotDef,
} from "@/pages/ArmoryPage/types";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import {
  ENCHANTABLE_SLOTS,
  type GearAlternate,
  type GearSlotEntry,
} from "./gearListModel";
import { formatScore } from "./gearScoring";
import type { HydratedItem } from "./useListItems";

export interface AlternateItemDisplay {
  entry: GearAlternate;
  item?: HydratedItem;
}

interface BuilderSlotProps {
  slotDef: GearSlotDef;
  entry?: GearSlotEntry;
  item?: HydratedItem;
  alternateItems?: AlternateItemDisplay[];
  selected?: boolean;
  /** The earlier progression stage supplying this read-only displayed item. */
  inheritedFromStage?: string;
  onSelect?: (outfitIndex: number) => void;
  /** Jump straight to the enchant editor for this slot (edit mode only). */
  onEnchant?: (outfitIndex: number) => void;
  /** Swap an alternate into the primary position. */
  onPromoteAlternate?: (itemId: number) => void;
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
  /** Progression's wide layout gives each item more visual weight. */
  size?: "default" | "large";
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
  alternateItems = [],
  selected = false,
  inheritedFromStage,
  onSelect,
  onEnchant,
  onPromoteAlternate,
  equippedItemIds,
  score,
  wornDelta,
  matchState,
  nextUpgrade,
  size = "default",
}: BuilderSlotProps) {
  const iconBaseUrl = useIconBaseUrl();
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hoveredAlternateId, setHoveredAlternateId] = useState<number | null>(
    null,
  );

  const isEmpty = !entry;
  const quality = item?.quality ?? 1;
  const displayName = isEmpty
    ? "Empty"
    : item?.name || `Item #${entry.item_id}`;
  const altCount = entry?.alternates?.length ?? 0;
  const hasDetails = altCount > 0 || !!entry?.note;
  const enchantText = item?.tooltip?.enchantment;
  const canEnchant =
    !!onEnchant && !isEmpty && ENCHANTABLE_SLOTS.has(slotDef.outfitIndex);
  const showTooltip =
    cursor != null &&
    !hasDetails &&
    !isMobile &&
    !isEmpty &&
    item?.tooltip;

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
      {...(onSelect
        ? {
            type: "button" as const,
            onClick: () => onSelect(slotDef.outfitIndex),
          }
        : {})}
      className={cn(
        "relative flex w-full min-w-0 items-center overflow-visible rounded-lg border text-left transition-colors",
        size === "large" ? "gap-3 px-3 py-3" : "gap-2.5 px-2.5 py-2",
        selected
          ? matchState === "equipped"
            ? "border-emerald-400 bg-blue-500/10 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]"
            : "border-blue-500 bg-blue-500/10"
          : matchState === "equipped"
            ? "border-emerald-400 bg-emerald-500/[0.07] shadow-[inset_0_0_0_1px_rgba(52,211,153,0.18)]"
            : inheritedFromStage
              ? "border-dashed border-zinc-700/70 bg-zinc-950/35"
              : "border-zinc-800 bg-zinc-900/70",
        inheritedFromStage && "text-zinc-500",
        onSelect && !selected && "hover:border-zinc-600 cursor-pointer",
      )}
      onMouseEnter={() => {
        if (hasDetails) setDetailsOpen(true);
      }}
      onMouseMove={(e: React.MouseEvent) =>
        setCursor({ x: e.clientX, y: e.clientY })
      }
      onMouseLeave={() => {
        setCursor(null);
        setDetailsOpen(false);
        setHoveredAlternateId(null);
      }}
      onFocus={() => {
        if (hasDetails) setDetailsOpen(true);
      }}
      onBlur={(event: React.FocusEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setDetailsOpen(false);
          setHoveredAlternateId(null);
        }
      }}
    >
      <div className="relative shrink-0">
        <div
          className={cn(
            "flex items-center justify-center overflow-hidden rounded border-2 bg-zinc-950/80",
            size === "large" ? "h-14 w-14" : "h-10 w-10",
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
        {!isEmpty && inheritedFromStage && (
          <span
            title={`Inherited from ${inheritedFromStage}`}
            className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-zinc-800 bg-zinc-950 text-zinc-500"
          >
            <LockKeyhole className="h-2.5 w-2.5" />
          </span>
        )}
        {!isEmpty && matchState && (
          <span
            title={
              matchState === "equipped"
                ? "The matched character is wearing this (or a listed alternate)"
                : "The matched character is not wearing this"
            }
            className={cn(
              "absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-950",
              matchState === "equipped" && "bg-emerald-500 text-zinc-950",
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
        <div
          className={cn(
            "uppercase tracking-wider text-zinc-500",
            size === "large" ? "text-2xs" : "text-3xs",
          )}
        >
          {slotDef.label}
        </div>
        <div
          className={cn(
            "truncate leading-tight",
            size === "large" ? "text-sm" : "text-xs",
            isEmpty ? "italic text-zinc-600" : getQualityTextClass(quality),
          )}
        >
          {displayName}
        </div>
        {(inheritedFromStage ||
          enchantText ||
          canEnchant ||
          altCount > 0 ||
          entry?.note ||
          score !== undefined ||
          wornDelta !== undefined ||
          nextUpgrade) && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-1.5 leading-tight text-zinc-500",
              size === "large" ? "text-xs" : "text-3xs",
            )}
          >
            {inheritedFromStage && (
              <span
                title={`Inherited from ${inheritedFromStage}. This item is read-only in the current stage; pick a replacement to override it.`}
                className="inline-flex min-w-0 items-center gap-1 rounded border border-zinc-700/70 bg-zinc-950/70 px-1.5 py-0.5 text-zinc-500"
              >
                <LockKeyhole className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">From {inheritedFromStage}</span>
              </span>
            )}
            {canEnchant && !enchantText && (
              <span
                role="button"
                tabIndex={0}
                title="Add an enchant"
                onClick={enchantClick}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onEnchant!(slotDef.outfitIndex);
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-medium text-emerald-400 transition-colors hover:border-emerald-400/60 hover:bg-emerald-500/20 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
              >
                <Sparkles className="h-2.5 w-2.5" />
                Enchant
              </span>
            )}
            {enchantText &&
              (canEnchant ? (
                <span
                  role="button"
                  tabIndex={0}
                  title="Change enchant"
                  onClick={enchantClick}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    onEnchant!(slotDef.outfitIndex);
                  }}
                  className="inline-flex max-w-52 cursor-pointer items-center gap-1 truncate rounded px-1 py-0.5 text-quality-uncommon transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-400"
                >
                  <Sparkles className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{enchantText}</span>
                </span>
              ) : (
                <span className="max-w-44 truncate text-quality-uncommon">
                  {enchantText}
                </span>
              ))}
            {score !== undefined && (
              <span className="font-mono text-zinc-400">
                {formatScore(score)} pts
              </span>
            )}
            {wornDelta !== undefined && Math.abs(wornDelta) >= 0.05 && (
              <span
                title={
                  wornDelta > 0
                    ? "This pick scores higher than the item they are wearing"
                    : "The item they are wearing scores higher than this pick"
                }
                className={cn(
                  "font-mono",
                  wornDelta > 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {wornDelta > 0 ? "+" : "−"}
                {formatScore(Math.abs(wornDelta))} vs worn
              </span>
            )}
            {altCount > 0 && (
              <AlternateItemsSummary
                slotLabel={slotDef.label}
                alternates={alternateItems}
                iconBaseUrl={iconBaseUrl}
                open={detailsOpen}
              />
            )}
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

      {detailsOpen && hasDetails && (
        <SlotDetailsPopover
          slotLabel={slotDef.label}
          primaryItem={item}
          primaryName={displayName}
          primaryNote={entry?.note}
          alternates={alternateItems}
          iconBaseUrl={iconBaseUrl}
          equippedItemIds={equippedItemIds}
          hoveredAlternateId={hoveredAlternateId}
          onHoveredAlternateChange={setHoveredAlternateId}
          onClose={() => setDetailsOpen(false)}
          onPromote={onPromoteAlternate}
        />
      )}

      {showTooltip && (
        <CursorTooltip pos={cursor!}>
          <ItemTooltip item={item.tooltip!} equippedItemIds={equippedItemIds} />
        </CursorTooltip>
      )}
    </Wrapper>
  );
}

function AlternateItemsSummary({
  slotLabel,
  alternates,
  iconBaseUrl,
  open,
}: {
  slotLabel: string;
  alternates: AlternateItemDisplay[];
  iconBaseUrl?: string;
  open: boolean;
}) {
  return (
    <span
      aria-label={`${alternates.length} alternates for ${slotLabel}`}
      aria-expanded={open}
      className={cn(
        "inline-flex items-center rounded px-1 py-0.5 transition-colors",
        open && "bg-zinc-800",
      )}
    >
      <span className="flex -space-x-1">
        {alternates.slice(0, 3).map(({ entry, item }) => (
          <span
            key={entry.item_id}
            className={cn(
              "h-4 w-4 overflow-hidden rounded-sm border bg-zinc-950 shadow-sm shadow-black/40",
              getQualityBorderClass(item?.quality ?? 1),
            )}
          >
            {item?.icon && (
              <img
                src={iconUrl(item.icon, iconBaseUrl)}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            )}
          </span>
        ))}
      </span>
      <span className="ml-1 font-mono text-3xs text-zinc-500">
        {alternates.length}
      </span>
    </span>
  );
}

export function SlotDetailsPopover({
  slotLabel,
  primaryItem,
  primaryName,
  primaryNote,
  alternates,
  iconBaseUrl,
  equippedItemIds,
  hoveredAlternateId,
  onHoveredAlternateChange,
  onClose,
  onPromote,
  className,
  style,
}: {
  slotLabel: string;
  primaryItem?: HydratedItem;
  primaryName: string;
  primaryNote?: string;
  alternates: AlternateItemDisplay[];
  iconBaseUrl?: string;
  equippedItemIds?: ReadonlySet<number>;
  hoveredAlternateId: number | null;
  onHoveredAlternateChange: (itemId: number | null) => void;
  onClose: () => void;
  onPromote?: (itemId: number) => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const hoveredAlternate = alternates.find(
    ({ entry }) => entry.item_id === hoveredAlternateId,
  );
  const tooltip =
    hoveredAlternateId === null
      ? primaryItem?.tooltip
      : hoveredAlternate?.item?.tooltip;

  return (
    <span
      role="dialog"
      aria-label={`${slotLabel} details`}
      className={cn(
        "absolute left-16 top-full z-50 flex max-w-[calc(100vw-2rem)] items-start gap-2 pt-2 text-left",
        className,
      )}
      style={style}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <span className="block w-80 max-w-[calc(100vw-2rem)] shrink-0 rounded-md border border-zinc-700 bg-zinc-950 p-3 shadow-2xl shadow-black/60">
        <span
          className="block"
          onMouseEnter={() => onHoveredAlternateChange(null)}
          onFocus={() => onHoveredAlternateChange(null)}
        >
          <span className="block text-3xs uppercase tracking-[0.18em] text-zinc-600">
            {slotLabel}
          </span>
          <span className="mt-1 block text-sm text-zinc-200">{primaryName}</span>
          {primaryNote && (
            <span className="mt-1 block text-xs leading-relaxed text-zinc-500">
              {primaryNote}
            </span>
          )}
        </span>

        {alternates.length > 0 && (
          <>
            <span className="my-3 block h-px bg-zinc-800" />
            <span className="mb-1.5 block text-3xs uppercase tracking-[0.18em] text-blue-300">
              Alternates
            </span>
            <span className="block space-y-1.5">
              {alternates.map(({ entry, item }, index) => (
                <span
                  key={entry.item_id}
                  tabIndex={0}
                  onMouseEnter={() => onHoveredAlternateChange(entry.item_id)}
                  onFocus={() => onHoveredAlternateChange(entry.item_id)}
                  className={cn(
                    "flex items-center gap-2 rounded px-1 py-1 outline-none transition-colors hover:bg-zinc-900 focus:bg-zinc-900",
                    hoveredAlternateId === entry.item_id && "bg-zinc-900",
                  )}
                >
                  <span className="w-4 shrink-0 text-right font-mono text-3xs text-zinc-600">
                    {index + 2}
                  </span>
                  <span
                    className={cn(
                      "h-7 w-7 shrink-0 overflow-hidden rounded border bg-zinc-900",
                      getQualityBorderClass(item?.quality ?? 1),
                    )}
                  >
                    {item?.icon && (
                      <img
                        src={iconUrl(item.icon, iconBaseUrl)}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-xs",
                        getQualityTextClass(item?.quality ?? 1),
                      )}
                    >
                      {item?.name || `Item #${entry.item_id}`}
                    </span>
                    {entry.note && (
                      <span className="block text-2xs leading-snug text-zinc-500">
                        {entry.note}
                      </span>
                    )}
                  </span>
                  {onPromote && (
                    <span
                      role="button"
                      tabIndex={0}
                      title="Use as primary"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onPromote(entry.item_id);
                        onClose();
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" && event.key !== " ") return;
                        event.preventDefault();
                        event.stopPropagation();
                        onPromote(entry.item_id);
                        onClose();
                      }}
                      className="shrink-0 cursor-pointer rounded border border-zinc-700 px-2 py-1 text-2xs text-zinc-300 transition-colors hover:border-blue-500/60 hover:bg-blue-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
                    >
                      Use
                    </span>
                  )}
                </span>
              ))}
            </span>
          </>
        )}
      </span>

      {tooltip && (
        <ItemTooltip
          item={tooltip}
          equippedItemIds={equippedItemIds}
          className="shrink-0 shadow-2xl shadow-black/60"
        />
      )}
    </span>
  );
}
