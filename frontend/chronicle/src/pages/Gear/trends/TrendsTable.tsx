import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { getQualityTextClass } from "@/pages/ArmoryPage/types";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { GearTrendsSlot } from "@/api/typesGenerated";
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
            <tr key={item.item_id} className="border-t border-zinc-800/70">
              <td className="px-3 py-1.5">
                <Link
                  to={`/wowdb/item?id=${item.item_id}`}
                  className="flex items-center gap-2.5 min-w-0 hover:brightness-125"
                >
                  <ItemIcon icon={item.item_icon} quality={item.item_quality} size={28} />
                  <div className="min-w-0">
                    <div className={cn("text-sm truncate", getQualityTextClass(item.item_quality))}>
                      {item.item_name || `Item #${item.item_id}`}
                    </div>
                    {item.item_level != null && (
                      <div className="text-2xs text-zinc-500 font-mono">ilvl {item.item_level}</div>
                    )}
                  </div>
                </Link>
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
