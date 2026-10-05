import { useState } from "react";
import { Link } from "react-router-dom";
import { useItemTooltip } from "@/api/gamedata";
import type { GearTrendsItem, GearTrendsSlot } from "@/api/typesGenerated";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import {
  CursorTooltip,
  type CursorPos,
} from "@/pages/ArmoryPage/overview/CursorTooltip";
import { getQualityTextClass } from "@/pages/ArmoryPage/types";
import { formatEquipRate } from "./trendsModel";

interface TrendsTableProps {
  slot: GearTrendsSlot;
  cohortSize: number;
}

/** One slot's observed items: equip rate bars, sample counts, enchants. */
export function TrendsTable({ slot, cohortSize }: TrendsTableProps) {
  const topEnchant = slot.enchants?.[0];

  return (
    <div className="rounded-md border border-zinc-700/60 overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-zinc-900/70 text-2xs uppercase tracking-wide text-zinc-500">
            <th className="px-3 py-2 font-medium">Item</th>
            <th className="px-3 py-2 font-medium text-right w-24">Equip rate</th>
            <th className="px-3 py-2 font-medium text-right w-28">Players</th>
          </tr>
        </thead>
        <tbody>
          {slot.items.map((item) => (
            <TrendsItemRow
              key={item.item_id}
              item={item}
              cohortSize={cohortSize}
            />
          ))}
        </tbody>
      </table>
      {topEnchant && (
        <div className="border-t border-zinc-800 bg-zinc-900/40 px-3 py-2 text-2xs text-zinc-500">
          Most common enchant:{" "}
          <span className="text-quality-uncommon">{topEnchant.name}</span>{" "}
          <span className="font-mono">({formatEquipRate(topEnchant.percent)})</span>
          {slot.enchants && slot.enchants.length > 1 && (
            <span>
              {" "}
              · then{" "}
              {slot.enchants
                .slice(1, 4)
                .map((e) => `${e.name} (${formatEquipRate(e.percent)})`)
                .join(", ")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function TrendsItemRow({
  item,
  cohortSize,
}: {
  item: GearTrendsItem;
  cohortSize: number;
}) {
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  const tooltip = useItemTooltip(
    cursor && !isMobile ? { itemId: item.item_id } : null,
  );

  return (
    <tr
      className="border-t border-zinc-800/70"
      onMouseMove={(event) =>
        setCursor({ x: event.clientX, y: event.clientY })
      }
      onMouseLeave={() => setCursor(null)}
    >
      <td className="px-3 py-1.5">
        <Link
          to={`/wowdb/item?id=${item.item_id}`}
          className="flex items-center gap-2.5 min-w-0 hover:brightness-125"
        >
          <ItemIcon
            icon={item.item_icon}
            quality={item.item_quality}
            size={28}
          />
          <div className="min-w-0">
            <div
              className={cn(
                "text-sm truncate",
                getQualityTextClass(item.item_quality),
              )}
            >
              {item.item_name || `Item #${item.item_id}`}
            </div>
            {item.item_level != null && (
              <div className="text-2xs text-zinc-500 font-mono">
                ilvl {item.item_level}
              </div>
            )}
          </div>
        </Link>
        {cursor && !isMobile && tooltip.data && (
          <CursorTooltip pos={cursor}>
            <ItemTooltip item={tooltip.data} showItemLevel />
          </CursorTooltip>
        )}
      </td>
      <td className="px-3 py-1.5 text-right">
        <div className="inline-flex flex-col items-end gap-0.5">
          <span className="font-mono text-sm text-zinc-200">
            {formatEquipRate(item.percent)}
          </span>
          <span className="block h-1 w-20 rounded bg-zinc-800 overflow-hidden">
            <span
              className="block h-1 bg-blue-500/70"
              style={{ width: `${Math.min(100, item.percent)}%` }}
            />
          </span>
        </div>
      </td>
      <td className="px-3 py-1.5 text-right font-mono text-xs text-zinc-500">
        {item.wearer_count} of {cohortSize}
      </td>
    </tr>
  );
}
