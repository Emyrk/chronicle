import { useMemo, useState } from "react";
import type { ArmoryGearSnapshot, ArmoryPlayer } from "@/api/typesGenerated";
import { Card, CardContent } from "@/components/ui/Card/Card";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { getQualityBorderClass } from "../types";
import { CursorTooltip, type CursorPos } from "./CursorTooltip";
import { useOutfitItems } from "./useOutfitItems";

interface GearStripCardProps {
  player: ArmoryPlayer;
  /** Newest gear-history snapshot; avg ilvl fallback for older profiles. */
  latestSnapshot?: ArmoryGearSnapshot;
  onOpenGear: () => void;
}

/** Average item level and one icon per equipped slot, linking to the paperdoll. */
export function GearStripCard({ player, latestSnapshot, onOpenGear }: GearStripCardProps) {
  const iconBaseUrl = useIconBaseUrl();
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [cursor, setCursor] = useState<CursorPos | null>(null);

  const { items, avgIlvl } = useOutfitItems(player, latestSnapshot);
  const equippedItemIds = useMemo(
    () => new Set(items.map((item) => item.itemId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player.gear],
  );

  const hoveredItem = hoveredIdx !== null ? items[hoveredIdx] : undefined;
  const hoveredTooltip = hoveredItem?.tooltip;

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
          {items.map((item, i) => (
            <div
              key={`${item.itemId}-${i}`}
              className={`size-[34px] shrink-0 rounded border bg-popover bg-cover bg-center transition-[filter] hover:brightness-125 ${getQualityBorderClass(item.quality)}`}
              style={
                item.icon
                  ? { backgroundImage: `url(${iconUrl(item.icon, iconBaseUrl)})` }
                  : undefined
              }
              aria-label={item.name}
              onMouseMove={(e) => {
                setHoveredIdx(i);
                setCursor({ x: e.clientX, y: e.clientY });
              }}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}
        </div>
        <div className="shrink-0 text-xs text-link">View paperdoll →</div>
      </CardContent>

      {hoveredTooltip && cursor && (
        <CursorTooltip pos={cursor}>
          <ItemTooltip item={hoveredTooltip} gemIds={hoveredItem?.gemIds} equippedItemIds={equippedItemIds} />
        </CursorTooltip>
      )}
    </Card>
  );
}
