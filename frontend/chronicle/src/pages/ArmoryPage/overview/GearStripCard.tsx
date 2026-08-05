import { useQueries } from "@tanstack/react-query";
import type { ArmoryGearSnapshot, ArmoryPlayer } from "@/api/typesGenerated";
import { Card, CardContent } from "@/components/ui/Card/Card";
import { fetchItemTooltip } from "@/api/gamedata";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { getQualityBorderClass } from "../types";

/** Paperdoll display order for the compact strip (shirt/tabard excluded). */
const STRIP_ORDER = [0, 1, 2, 14, 4, 8, 9, 5, 6, 7, 10, 11, 12, 13, 15, 16, 17];

interface GearStripCardProps {
  player: ArmoryPlayer;
  /** Newest gear-history snapshot; avg ilvl fallback for older profiles. */
  latestSnapshot?: ArmoryGearSnapshot;
  onOpenGear: () => void;
}

/** Average item level and one icon per equipped slot, linking to the paperdoll. */
export function GearStripCard({ player, latestSnapshot, onOpenGear }: GearStripCardProps) {
  const iconBaseUrl = useIconBaseUrl();

  const items = STRIP_ORDER.map((i) => player.gear[i]).filter((item) => item.item_id > 0);

  // Some outfits store only item IDs; the tooltip endpoint fills in icon,
  // quality, and item level. Query keys match useItemTooltip so the cache is
  // shared with the paperdoll tab.
  const tooltips = useQueries({
    queries: items.map((item) => ({
      queryKey: ["item-tooltip", item.item_id, undefined, undefined],
      queryFn: () => fetchItemTooltip({ itemId: item.item_id }),
      staleTime: 5 * 60 * 1000,
      retry: false,
      enabled: !item.item_icon || item.item_level == null,
    })),
  });

  const merged = items.map((item, i) => ({
    name: item.item_name || tooltips[i].data?.name || "",
    icon: item.item_icon || tooltips[i].data?.icon || "",
    quality: item.item_quality ?? tooltips[i].data?.quality ?? 1,
    itemLevel: item.item_level ?? tooltips[i].data?.item_level ?? null,
  }));

  const knownLevels = merged.filter((m) => m.itemLevel != null);
  const avgIlvl =
    knownLevels.length > 0
      ? knownLevels.reduce((sum, m) => sum + m.itemLevel!, 0) / knownLevels.length
      : (latestSnapshot?.avg_ilvl ?? null);

  return (
    <Card
      className="cursor-pointer gap-0 py-4 transition-colors hover:bg-muted/40"
      onClick={onOpenGear}
      role="button"
      aria-label="View paperdoll"
    >
      <CardContent className="flex items-center gap-5">
        <div className="shrink-0">
          <div className="text-xs tracking-widest text-muted-foreground uppercase">Gear</div>
          <div className="mt-1 font-mono text-2xl leading-none font-bold text-foreground">
            {avgIlvl != null ? avgIlvl.toFixed(1) : "—"}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">avg ilvl</div>
        </div>
        <div className="flex grow flex-wrap gap-1.5 border-l border-border pl-5">
          {items.length === 0 && (
            <div className="py-2 text-sm text-muted-foreground">No gear recorded yet.</div>
          )}
          {merged.map((item, i) => (
            <div
              key={i}
              title={item.name}
              className={`size-[34px] shrink-0 rounded border bg-popover bg-cover bg-center ${getQualityBorderClass(item.quality)}`}
              style={
                item.icon
                  ? { backgroundImage: `url(${iconUrl(item.icon, iconBaseUrl)})` }
                  : undefined
              }
            />
          ))}
        </div>
        <div className="shrink-0 text-xs text-link">View paperdoll →</div>
      </CardContent>
    </Card>
  );
}
