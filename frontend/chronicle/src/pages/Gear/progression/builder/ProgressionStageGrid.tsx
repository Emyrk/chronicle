import { useState } from "react";
import { StickyNote } from "lucide-react";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import {
  BOTTOM_SLOTS,
  LEFT_SLOTS,
  RIGHT_SLOTS,
  getQualityTextClass,
} from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import {
  SlotDetailsPopover,
  type AlternateItemDisplay,
} from "@/pages/Gear/builder/BuilderSlot";
import {
  slotEquipped,
  type CharacterMatch,
} from "@/pages/Gear/builder/characterMatch";
import type { GearSlotEntry } from "@/pages/Gear/builder/gearListModel";
import { slotLabel } from "@/pages/Gear/builder/SlotEditorPanel";
import {
  itemRefKey,
  stageUsesTwoHandedWeapon,
  stageWithValidWeaponSlots,
  type HydratedItem,
} from "@/pages/Gear/builder/useListItems";
import {
  resolveProgressionStage,
  type ProgressionPayload,
} from "../progressionModel";

const GRID_SLOTS = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS];

interface ProgressionStageGridProps {
  payload: ProgressionPayload;
  items: Map<string, HydratedItem>;
  match?: CharacterMatch;
  activeStageIndex: number;
  onCellClick: (stageIndex: number, slotIndex: number) => void;
}

/** Slots × stages overview. Empty stored cells are displayed as carried gear. */
export function ProgressionStageGrid({
  payload,
  items,
  match,
  activeStageIndex,
  onCellClick,
}: ProgressionStageGridProps) {
  const resolvedStages = payload.stages.map((_, index) => {
    const resolved = resolveProgressionStage(payload, index);
    return {
      ...resolved,
      offHandBlocked: stageUsesTwoHandedWeapon(resolved.stage, items),
      stage: stageWithValidWeaponSlots(resolved.stage, items),
    };
  });

  return (
    <div className="overflow-x-auto rounded-md border border-zinc-700/60 bg-zinc-950/40 styled-scrollbar">
      <table className="w-full min-w-max table-fixed border-collapse text-left">
        <thead>
          <tr className="border-b border-zinc-700/70 bg-zinc-900/95">
            <th className="sticky left-0 z-20 w-32 border-r border-zinc-800 bg-zinc-900 px-3 py-2 text-3xs font-medium uppercase tracking-[0.18em] text-zinc-600">
              Slot
            </th>
            {payload.stages.map((stage, stageIndex) => (
              <th
                key={stageIndex}
                className={cn(
                  "w-56 border-r border-zinc-800 px-3 py-2 align-top last:border-r-0",
                  stageIndex === activeStageIndex && "bg-blue-500/[0.04]",
                )}
              >
                <button
                  type="button"
                  onClick={() => onCellClick(stageIndex, -1)}
                  className="block w-full text-left"
                >
                  <span
                    className={cn(
                      "block truncate text-xs font-semibold text-zinc-300 transition-colors hover:text-white",
                      stageIndex === activeStageIndex && "text-amber-300",
                    )}
                  >
                    {stage.name || `Stage ${stageIndex + 1}`}
                  </span>
                  <span className="mt-0.5 block text-3xs font-normal text-zinc-600">
                    Stage {stageIndex + 1}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {GRID_SLOTS.map((slotDef) => {
            const slotKey = String(slotDef.outfitIndex);
            const anyFilled = resolvedStages.some(
              ({ stage }) => !!stage.slots[slotKey],
            );
            if (!anyFilled) return null;

            return (
              <tr
                key={slotDef.outfitIndex}
                className="border-b border-zinc-800/80 last:border-b-0"
              >
                <th className="sticky left-0 z-10 w-32 border-r border-zinc-800 bg-zinc-950/95 px-3 py-2 text-3xs font-medium uppercase tracking-[0.12em] text-zinc-500">
                  {slotLabel(slotDef.outfitIndex)}
                </th>
                {payload.stages.map((stage, stageIndex) => {
                  const resolved = resolvedStages[stageIndex];
                  const offHandBlocked =
                    slotDef.outfitIndex === 16 && resolved.offHandBlocked;
                  const entry = resolved.stage.slots[slotKey];
                  const explicit = !!entry && !!stage.slots[slotKey];
                  const sourceIndex = resolved.inheritedFrom.get(
                    slotDef.outfitIndex,
                  );
                  const item = entry
                    ? items.get(itemRefKey(entry.item_id, entry.enchant_id))
                    : undefined;

                  return (
                    <td
                      key={stageIndex}
                      className={cn(
                        "h-[3.75rem] w-56 border-r border-zinc-800 p-0 align-top last:border-r-0",
                        stageIndex === activeStageIndex && "bg-blue-500/[0.025]",
                      )}
                    >
                      {offHandBlocked ? (
                        <span
                          aria-label="Off hand unavailable with a two-handed weapon"
                          className="block h-full w-full bg-zinc-950/25"
                        />
                      ) : (
                        <GridItemCell
                          slotName={slotLabel(slotDef.outfitIndex)}
                          entry={entry}
                          item={item}
                          alternateItems={(entry?.alternates ?? []).map(
                            (alternate) => ({
                              entry: alternate,
                              item: items.get(itemRefKey(alternate.item_id)),
                            }),
                          )}
                          matched={
                            !!match &&
                            slotEquipped(
                              resolved.stage,
                              slotDef.outfitIndex,
                              match,
                            )
                          }
                          explicit={explicit}
                          sourceName={
                            sourceIndex != null
                              ? payload.stages[sourceIndex]?.name ||
                                `Stage ${sourceIndex + 1}`
                              : undefined
                          }
                          equippedItemIds={new Set(
                            Object.values(resolved.stage.slots)
                              .filter((value) => !!value)
                              .map((value) => value!.item_id),
                          )}
                          onClick={() =>
                            onCellClick(stageIndex, slotDef.outfitIndex)
                          }
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface GridTooltipPosition {
  left: number;
  top: number;
}

function GridItemCell({
  slotName,
  entry,
  item,
  alternateItems,
  explicit,
  matched,
  sourceName,
  equippedItemIds,
  onClick,
}: {
  slotName: string;
  entry?: GearSlotEntry;
  item?: HydratedItem;
  alternateItems: AlternateItemDisplay[];
  explicit: boolean;
  matched: boolean;
  sourceName?: string;
  equippedItemIds: ReadonlySet<number>;
  onClick: () => void;
}) {
  const iconBaseUrl = useIconBaseUrl();
  const [tooltipPosition, setTooltipPosition] =
    useState<GridTooltipPosition | null>(null);
  const [hoveredAlternateId, setHoveredAlternateId] = useState<number | null>(
    null,
  );
  const hasDetails = !!entry?.note || alternateItems.length > 0;

  const openTooltip = (element: HTMLElement) => {
    if (!entry || !item?.tooltip) return;
    const rect = element.getBoundingClientRect();
    const estimatedWidth = hasDetails ? 660 : 340;
    setTooltipPosition({
      // Leave a visible strip of this and the following row on the left.
      left: Math.max(
        16,
        Math.min(rect.left + 48, window.innerWidth - estimatedWidth - 16),
      ),
      top: Math.max(16, Math.min(rect.top + 8, window.innerHeight - 440)),
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={(event) => openTooltip(event.currentTarget)}
      onMouseLeave={() => {
        setTooltipPosition(null);
        setHoveredAlternateId(null);
      }}
      onFocus={(event) => openTooltip(event.currentTarget)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setTooltipPosition(null);
          setHoveredAlternateId(null);
        }
      }}
      className={cn(
        "group flex h-full w-full min-w-0 items-start gap-2 border-l-2 px-2.5 py-2 text-left transition-colors",
        matched
          ? "border-emerald-400 ring-1 ring-inset ring-emerald-500/55 bg-emerald-500/[0.04] hover:bg-emerald-500/[0.08]"
          : explicit
            ? "border-sky-400/70 hover:bg-zinc-900/90"
            : entry
              ? "border-zinc-800 hover:bg-zinc-900/50"
              : "border-transparent hover:bg-zinc-900/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 h-4 w-0.5 shrink-0",
          entry && !explicit
            ? "bg-zinc-800 group-hover:bg-zinc-700"
            : "bg-transparent",
        )}
      />

      <span className="min-w-0 flex-1">
        {!entry ? (
          <span className="block text-xs text-zinc-700">Empty</span>
        ) : explicit ? (
          <>
            <span
              className={cn(
                "block truncate text-xs leading-tight",
                getQualityTextClass(item?.quality ?? 1),
              )}
            >
              {item?.name || `Item #${entry.item_id}`}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-1">
              {!!entry.alternates?.length && (
                <span className="rounded border border-sky-500/35 bg-sky-500/5 px-1.5 py-0.5 text-3xs text-sky-300">
                  +{entry.alternates.length} alternates
                </span>
              )}
              {entry.note && (
                <span
                  title={entry.note}
                  className="inline-flex max-w-28 items-center gap-1 rounded border border-zinc-700 px-1.5 py-0.5 text-3xs text-zinc-500"
                >
                  <StickyNote className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">Note</span>
                </span>
              )}
            </span>
          </>
        ) : (
          <>
            <span className="block pt-0.5 text-xs text-zinc-600 group-hover:text-zinc-400">
              Keep
            </span>
            {sourceName && (
              <span className="mt-0.5 block truncate text-3xs text-zinc-700">
                {sourceName}
              </span>
            )}
          </>
        )}
      </span>

      {tooltipPosition && item?.tooltip &&
        (hasDetails ? (
          <SlotDetailsPopover
            slotLabel={slotName}
            primaryItem={item}
            primaryName={item.name || `Item #${entry!.item_id}`}
            primaryNote={entry?.note}
            alternates={alternateItems}
            iconBaseUrl={iconBaseUrl}
            equippedItemIds={equippedItemIds}
            hoveredAlternateId={hoveredAlternateId}
            onHoveredAlternateChange={setHoveredAlternateId}
            onClose={() => setTooltipPosition(null)}
            className="z-[70] pt-0"
            style={{ ...tooltipPosition, position: "fixed" }}
          />
        ) : (
          <span
            className="pointer-events-none fixed z-[70]"
            style={tooltipPosition}
          >
            <ItemTooltip
              item={item.tooltip}
              equippedItemIds={equippedItemIds}
              className="shadow-2xl shadow-black/60"
            />
          </span>
        ))}
    </button>
  );
}
