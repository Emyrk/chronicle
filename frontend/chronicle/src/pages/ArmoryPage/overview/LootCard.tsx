import { Link } from "react-router-dom";
import { format } from "date-fns";
import type { ArmoryLootItem } from "@/api/typesGenerated";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
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
  const iconBaseUrl = useIconBaseUrl();
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
          <Link
            key={`${l.instance_id}-${l.item_id}-${i}`}
            to={`/instances/${l.instance_slug || l.instance_id}`}
            className="flex items-center gap-3 rounded transition-colors hover:bg-muted/40"
          >
            <div
              title={l.item_name}
              className={`size-[30px] shrink-0 rounded border bg-popover bg-cover bg-center ${getQualityBorderClass(l.quality)}`}
              style={l.icon ? { backgroundImage: `url(${iconUrl(l.icon, iconBaseUrl)})` } : undefined}
            />
            <div className="min-w-0 grow">
              <div className={`truncate text-sm ${getQualityTextClass(l.quality)}`}>
                {l.item_name}
                {l.quantity > 1 ? ` ×${l.quantity}` : ""}
              </div>
              <div className="truncate text-xs text-muted-foreground">{l.instance_name}</div>
            </div>
            <div className="font-mono shrink-0 text-xs text-muted-foreground">
              {format(new Date(l.received_at), "MMM d")}
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
