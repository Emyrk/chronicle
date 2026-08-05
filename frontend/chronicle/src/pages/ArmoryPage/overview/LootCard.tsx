import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import type { ArmoryLootItem } from "@/api/typesGenerated";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { useItemTooltip } from "@/api/gamedata";
import { CursorTooltip, type CursorPos } from "./CursorTooltip";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { getQualityBorderClass, getQualityTextClass } from "../types";

const MAX_ITEMS = 8;

interface LootCardProps {
  items?: readonly ArmoryLootItem[];
  isLoading: boolean;
}

/** Most recent loot the character received. */
export function LootCard({ items, isLoading }: LootCardProps) {
  const loot = (items ?? []).slice(0, MAX_ITEMS);

  return (
    <Card className="h-full gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>Loot received</CardTitle>
        <CardDescription>
          {loot.length > 0 ? "Most recent items" : "No loot recorded"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        {loot.length === 0 && (
          <div className="py-2 text-sm text-muted-foreground">
            {isLoading ? "Loading loot…" : "No loot has been recorded for this character."}
          </div>
        )}
        {loot.map((l, i) => (
          <LootRow key={`${l.instance_id}-${l.item_id}-${i}`} item={l} />
        ))}
      </CardContent>
    </Card>
  );
}

function LootRow({ item }: { item: ArmoryLootItem }) {
  const iconBaseUrl = useIconBaseUrl();
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  const tooltip = useItemTooltip(item.item_id > 0 ? { itemId: item.item_id } : null);

  return (
    <Link
      to={`/instances/${item.instance_slug || item.instance_id}`}
      className="flex items-center gap-3 rounded transition-colors hover:bg-muted/40"
      onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setCursor(null)}
    >
      <div
        className={`size-[30px] shrink-0 rounded border bg-popover bg-cover bg-center ${getQualityBorderClass(item.quality)}`}
        style={item.icon ? { backgroundImage: `url(${iconUrl(item.icon, iconBaseUrl)})` } : undefined}
      />
      <div className="min-w-0 grow">
        <div className={`truncate text-sm ${getQualityTextClass(item.quality)}`}>
          {item.item_name}
          {item.quantity > 1 ? ` ×${item.quantity}` : ""}
        </div>
        <div className="truncate text-xs text-muted-foreground">{item.instance_name}</div>
      </div>
      <div className="font-mono shrink-0 text-xs text-muted-foreground">
        {format(new Date(item.received_at), "MMM d")}
      </div>

      {cursor && tooltip.data && (
        <CursorTooltip pos={cursor}>
          <ItemTooltip item={tooltip.data} />
        </CursorTooltip>
      )}
    </Link>
  );
}
