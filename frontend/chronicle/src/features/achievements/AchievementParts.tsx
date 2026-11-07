import { Lock, Sparkles } from "lucide-react";
import type { AchievementCompletionRate, AchievementRequirement, AchievementReward } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { completionPercent, completionRateLabel, keybindKeys } from "./achievementsModel";

/** Small building blocks shared by rows, series, toasts, and hints. */

export function PointsShield({ points, earned, className }: { points: number; earned: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "flex h-10 w-9 shrink-0 items-center justify-center text-sm font-bold tabular-nums",
        "[clip-path:polygon(50%_0,100%_14%,100%_62%,50%_100%,0_62%,0_14%)]",
        earned ? "bg-gradient-to-b from-amber-300 to-amber-600 text-amber-950" : "bg-foreground/10 text-muted-foreground",
        className,
      )}
      title={`${points} achievement points`}
    >
      {points}
    </div>
  );
}

/** "12.4% of users have this achievement", with a hairline bar unless compact. Required everywhere an achievement appears. */
export function CompletionRate({
  rate,
  compact = false,
  className,
}: {
  rate: AchievementCompletionRate;
  compact?: boolean;
  className?: string;
}) {
  const percent = completionPercent(rate);
  return (
    <div className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)} title={completionRateLabel(rate)}>
      {!compact && (
        <div className="h-1 w-16 overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${Math.max(percent, percent > 0 ? 2 : 0)}%` }} />
        </div>
      )}
      <span className="tabular-nums">{completionRateLabel(rate)}</span>
    </div>
  );
}

export function RequirementBadges({ requirements }: { requirements: readonly AchievementRequirement[] }) {
  if (requirements.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {requirements.map((requirement) => (
        <span
          key={requirement.label}
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
            requirement.met
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/30 bg-rose-500/10 text-rose-300",
          )}
        >
          {!requirement.met && <Lock className="h-3 w-3" />}
          {requirement.label}
        </span>
      ))}
    </div>
  );
}

const REWARD_KIND_LABEL: Record<AchievementReward["kind"], string> = {
  name: "Name mark",
  background: "Background mark",
  border: "Border mark",
  title: "Title",
  badge: "Badge",
};

export function RewardBadges({ rewards, earned }: { rewards: readonly AchievementReward[]; earned: boolean }) {
  if (rewards.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rewards.map((reward) => (
        <span
          key={reward.id}
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
            earned ? "border-violet-400/40 bg-violet-500/15 text-violet-200" : "border-violet-400/20 bg-violet-500/5 text-violet-300/70",
          )}
        >
          <Sparkles className="h-3 w-3" />
          {REWARD_KIND_LABEL[reward.kind]}: {reward.name}
        </span>
      ))}
    </div>
  );
}

export function Keybind({ keybind, isMac }: { keybind: string; isMac: boolean }) {
  const keys = keybindKeys(keybind, isMac);
  return (
    <span className="inline-flex items-center gap-0.5">
      {keys.map((key, index) => (
        <span key={`${key}-${index}`} className="inline-flex items-center gap-0.5">
          {index > 0 && <span className="text-muted-foreground">+</span>}
          <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-b-2 border-zinc-500 bg-zinc-800 px-1 font-mono text-[11px] font-semibold leading-tight text-zinc-100">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}
