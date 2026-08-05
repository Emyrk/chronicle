import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import type { ArmoryLootItem, RecentInstance } from "@/api/typesGenerated";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card/Card";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { useItemTooltip } from "@/api/gamedata";
import { formatDuration } from "@/pages/Logs/utils/calendarUtils";
import { groupDuplicateInstances } from "@/utils/groupDuplicates";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { parseColor } from "@/pages/Instance/parseColors";
import { getQualityBorderClass } from "../types";
import { CursorTooltip, type CursorPos } from "./CursorTooltip";

const MAX_NIGHTS = 6;
const MAX_LOOT_ICONS = 4;

interface RecentNightsCardProps {
  instances?: readonly RecentInstance[];
  /** Average parse display score per instance_id. */
  nightScores: Map<string, number>;
  /** Loot received per instance_id, for per-night loot icons. */
  lootByInstance?: Map<string, ArmoryLootItem[]>;
  onOpenActivity: () => void;
}

/** The last few raid nights, newest first, with the night's best parse. */
export function RecentNightsCard({ instances, nightScores, lootByInstance, onOpenActivity }: RecentNightsCardProps) {

  const nights = useMemo(() => {
    const groups = groupDuplicateInstances([...(instances ?? [])]);
    groups.sort(
      (a, b) =>
        new Date(b[0].first_encounter_time).getTime() -
        new Date(a[0].first_encounter_time).getTime(),
    );
    return groups.slice(0, MAX_NIGHTS);
  }, [instances]);

  return (
    <Card className="gap-0 py-4">
      <CardHeader className="pb-3">
        <CardTitle>Recent nights</CardTitle>
        <CardDescription>
          {nights.length > 0
            ? `Last ${nights.length} raid ${nights.length === 1 ? "night" : "nights"}`
            : "No raids in the last 12 weeks"}
        </CardDescription>
        <CardAction>
          <button
            onClick={onOpenActivity}
            className="cursor-pointer text-xs text-link hover:underline"
          >
            All activity →
          </button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {nights.map((group) => {
          const inst = group[0];
          const date = new Date(inst.first_encounter_time);
          const duration = formatDuration(inst.duration_ms);
          // The night's average parse; duplicate uploads of the night carry
          // (near-)identical parses, so any group member's average works.
          const avg = group.reduce<number | undefined>(
            (acc, g) => acc ?? nightScores.get(g.id),
            undefined,
          );
          const url = inst.slug ? `/instances/${inst.slug}` : `/instances/${inst.id}`;
          const loot = group
            .flatMap((g) => lootByInstance?.get(g.id) ?? [])
            .slice(0, MAX_LOOT_ICONS);

          return (
            <Link
              key={inst.id}
              to={url}
              className="flex items-center gap-4 border-b border-border py-2.5 transition-colors last:border-b-0 hover:bg-muted/40"
            >
              <div className="w-14 shrink-0">
                <div className="font-mono text-xs text-foreground">{format(date, "MMM d")}</div>
                <div className="text-xs text-muted-foreground">{format(date, "EEE")}</div>
              </div>
              <div className="min-w-0 grow">
                <div className="font-wow truncate text-sm text-foreground">{inst.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {inst.boss_kills}/{inst.boss_count}{" "}
                  {inst.boss_count === 1 ? "boss" : "bosses"}
                  {duration ? ` · ${duration}` : ""}
                </div>
              </div>
              {loot.length > 0 && (
                <div className="flex shrink-0 gap-1.5">
                  {loot.map((l, i) => (
                    <NightLootIcon key={`${l.item_id}-${i}`} item={l} />
                  ))}
                </div>
              )}
              {avg !== undefined && (
                <div className="shrink-0 text-right">
                  <div className={`font-mono text-sm font-bold ${parseColor(avg)}`}>{avg}</div>
                  <div className="text-xs text-muted-foreground">avg</div>
                </div>
              )}
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** A small loot icon with a cursor-anchored item tooltip on hover. */
function NightLootIcon({ item }: { item: ArmoryLootItem }) {
  const iconBaseUrl = useIconBaseUrl();
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  // Only fetch tooltip data once the icon is actually hovered.
  const tooltip = useItemTooltip(cursor && item.item_id > 0 ? { itemId: item.item_id } : null);

  return (
    <>
      <div
        className={`size-[26px] shrink-0 rounded border bg-popover bg-cover bg-center transition-[filter] hover:brightness-125 ${getQualityBorderClass(item.quality)}`}
        style={item.icon ? { backgroundImage: `url(${iconUrl(item.icon, iconBaseUrl)})` } : undefined}
        aria-label={item.item_name}
        onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
        onMouseLeave={() => setCursor(null)}
      />
      {/* Rendered outside the icon: its hover filter would otherwise turn
          it into the containing block for this fixed-position tooltip. */}
      {cursor && tooltip.data && (
        <CursorTooltip pos={cursor}>
          <ItemTooltip item={tooltip.data} />
        </CursorTooltip>
      )}
    </>
  );
}
