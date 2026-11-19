import { toast } from "sonner";
import { AchievementBackfillToastCard, AchievementToastCard, type AchievementToastProps } from "./AchievementToast";

export function showAchievementToast(props: AchievementToastProps) {
  toast.custom(() => <AchievementToastCard {...props} />, { duration: 6000 });
}

export function showAchievementBackfillToast(count: number, points: number) {
  toast.custom(() => <AchievementBackfillToastCard count={count} points={points} />, { duration: 8000 });
}
