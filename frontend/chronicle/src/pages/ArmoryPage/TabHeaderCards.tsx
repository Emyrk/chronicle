import { Link } from "react-router-dom";
import { format } from "date-fns";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { useArmoryGearHistory } from "@/api/queries";
import { formatDuration } from "@/pages/Logs/utils/calendarUtils";
import { HeaderStatsCard } from "./overview/HeaderStatsCard";
import { useOutfitItems } from "./overview/useOutfitItems";
import { useRecentActivity } from "./overview/useRecentActivity";
import { treeName } from "./overview/util";

/** Header stats beside the identity on the Gear tab. */
export function GearHeaderCard({ player }: { player: ArmoryPlayer }) {
  const gearHistory = useArmoryGearHistory(player.realm_name, player.id);
  const { avgIlvl } = useOutfitItems(player, gearHistory.data?.snapshots[0]);
  const seen = format(new Date(player.updated_at), "MMM d");

  return (
    <HeaderStatsCard
      title="Gear"
      stats={[
        { value: avgIlvl != null ? avgIlvl.toFixed(1) : "—", label: "avg ilvl" },
        {
          value: player.updated_from_instance ? (
            <Link
              to={`/instances/${player.updated_from_instance}`}
              className="hover:underline"
            >
              {seen} ↗
            </Link>
          ) : (
            seen
          ),
          label: "as last seen",
        },
      ]}
    />
  );
}

/** Header stats beside the identity on the Talents tab. */
export function TalentsHeaderCard({ player }: { player: ArmoryPlayer }) {
  const trees = player.talents?.trees;
  const totalSpent = trees?.reduce((sum, t) => sum + t.points_spent, 0) ?? 0;
  const deepestIdx = trees
    ? trees.reduce((best, t, i) => (t.points_spent > trees[best].points_spent ? i : best), 0)
    : 0;

  return (
    <HeaderStatsCard
      title="Talents"
      stats={[
        {
          value: trees ? trees.map((t) => t.points_spent).join("/") : "—",
          label: trees && totalSpent > 0 ? treeName(player, deepestIdx) : "no talent data",
        },
        { value: String(totalSpent), label: "points spent" },
      ]}
    />
  );
}

/** Header stats beside the identity on the Activity tab. */
export function ActivityHeaderCard({ player }: { player: ArmoryPlayer }) {
  const { stats } = useRecentActivity(player);

  return (
    <HeaderStatsCard
      title="Activity"
      stats={[
        { value: String(stats.nights), label: "raid nights · 12 weeks" },
        { value: formatDuration(stats.combatMs) || "0m", label: "in combat" },
      ]}
    />
  );
}
