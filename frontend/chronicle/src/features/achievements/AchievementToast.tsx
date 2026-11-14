import { History } from "lucide-react";
import { Link } from "react-router-dom";
import type { Achievement } from "@/api/typesGenerated";
import { AchievementIcon } from "./AchievementIcon";
import { tierNumeral } from "./achievementsModel";
import { CompletionRate, PointsShield, RewardBadges } from "./AchievementParts";

export interface AchievementToastProps {
  achievement: Achievement;
  /** Category icon, used when the achievement has none. */
  categoryIcon: string;
  /** Series name and tier count, when the achievement is a tier. */
  series?: { name: string; tierCount: number };
}

/** Completion toast body: name, icon, points, tier, completion rate, reward, and a link to the category. */
export function AchievementToastCard({ achievement, categoryIcon, series }: AchievementToastProps) {
  return (
    <div className="flex w-[22rem] max-w-[calc(100vw-2rem)] gap-3 rounded-lg border border-amber-400/40 bg-popover p-3 text-popover-foreground shadow-lg shadow-amber-500/10">
      <AchievementIcon icon={achievement.icon || categoryIcon} earned />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-300">Achievement earned</div>
        <div className="font-semibold text-amber-100">{achievement.name}</div>
        {series && (
          <div className="text-xs text-muted-foreground">
            {series.name}: tier {tierNumeral(achievement.tier)} of {series.tierCount}
          </div>
        )}
        <CompletionRate rate={achievement.completion_rate} compact />
        <RewardBadges rewards={achievement.rewards} earned />
        <Link to={`/achievements?category=${encodeURIComponent(achievement.category_id)}`} className="inline-block text-xs text-sky-300 hover:underline">
          View category
        </Link>
      </div>
      <PointsShield points={achievement.points} earned />
    </div>
  );
}

/** Summary for many completions at once (backfill or migration), instead of a toast per achievement. */
export function AchievementBackfillToastCard({ count, points }: { count: number; points: number }) {
  return (
    <div className="flex w-[22rem] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-lg border border-amber-400/40 bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-amber-400/60 bg-amber-400/15 text-amber-200">
        <History className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-amber-100">
          {count} achievements from your history
        </div>
        <div className="text-xs text-muted-foreground">Awarded for things you already did in Chronicle.</div>
        <Link to="/achievements" className="text-xs text-sky-300 hover:underline">
          See what you earned
        </Link>
      </div>
      <PointsShield points={points} earned />
    </div>
  );
}
