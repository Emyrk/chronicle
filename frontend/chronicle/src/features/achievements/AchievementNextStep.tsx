import { Lightbulb, X } from "lucide-react";
import type { Achievement } from "@/api/typesGenerated";
import { PointsShield } from "./AchievementParts";

/**
 * In-context "next step" suggestion, e.g. after opening layout editing suggest saving.
 * Dismissible; callers stop rendering it once the achievement is earned.
 */
export function AchievementNextStep({
  achievement,
  hint,
  onDismiss,
}: {
  achievement: Achievement;
  /** Contextual sentence, such as "Save this layout to keep it in your Layout Book." */
  hint: string;
  onDismiss: () => void;
}) {
  return (
    <div className="flex max-w-sm items-start gap-2.5 rounded-lg border border-sky-400/30 bg-sky-400/[0.07] p-2.5 text-sm">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
      <div className="min-w-0 flex-1">
        <div className="text-foreground/90">{hint}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Next achievement: <span className="text-amber-200">{achievement.name}</span>
        </div>
      </div>
      <PointsShield points={achievement.points} earned={false} className="h-8 w-7 text-xs" />
      <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss suggestion">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
