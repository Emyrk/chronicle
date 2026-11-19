import { Check, ExternalLink, History, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AchievementIcon } from "./AchievementIcon";
import { formatEarnedDate, tierNumeral, type AchievementView, type SeriesView } from "./achievementsModel";
import {
  CompletionRate,
  Keybind,
  PointsShield,
  RequirementBadges,
  RewardBadges,
} from "./AchievementParts";

/** One achievement, WoW-style: icon, name, criteria, points, completion rate, and earned date. */
export function AchievementRow({
  view,
  categoryIcon,
  isMac,
  nested = false,
}: {
  view: AchievementView;
  categoryIcon: string;
  isMac: boolean;
  /** Rendered inside a series card: lighter chrome, tier numeral instead of icon. */
  nested?: boolean;
}) {
  const { achievement, progress, state, concealed, setMembers } = view;
  const earned = state === "earned";
  const icon = achievement.icon || categoryIcon;

  return (
    <div
      data-state={state}
      className={cn(
        "relative flex gap-3 rounded-lg border p-3 transition-colors",
        nested ? "border-transparent bg-transparent px-2 py-2.5" : "bg-card",
        !nested && earned && "border-amber-400/30 bg-gradient-to-r from-amber-400/[0.07] to-transparent",
        !nested && !earned && "border-border",
      )}
    >
      {nested && achievement.tier > 0 ? (
        <TierMark tier={achievement.tier} earned={earned} />
      ) : (
        <AchievementIcon icon={concealed ? "" : icon} earned={earned} size={nested ? "sm" : "md"} />
      )}

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className={cn("font-semibold", earned ? "text-amber-100" : "text-foreground/90", concealed && "italic text-muted-foreground")}>
            {concealed ? "Hidden achievement" : achievement.name}
          </h3>
          {state === "locked" && <Lock className="h-3.5 w-3.5 text-rose-300" aria-label="Locked" />}
          {achievement.keybind && !concealed && <Keybind keybind={achievement.keybind} isMac={isMac} />}
        </div>
        <p className={cn("text-sm", earned ? "text-foreground/80" : "text-muted-foreground")}>
          {concealed ? "Keep exploring Chronicle to discover this one." : achievement.description}
        </p>

        {setMembers && <SetChecklist members={setMembers} />}
        {progress && progress.required > 0 && !earned && <ProgressBar current={progress.current} required={progress.required} />}
        <RequirementBadges requirements={achievement.requirements} />
        <RewardBadges rewards={achievement.rewards} earned={earned} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <CompletionRate rate={achievement.completion_rate} />
          {achievement.feature_url && !earned && state !== "locked" && (
            <Link to={achievement.feature_url} className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline">
              Show me <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <PointsShield points={achievement.points} earned={earned} />
        {earned && progress?.earned_at && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground" title={progress.retroactive ? "Awarded from your existing history" : undefined}>
            {progress.retroactive ? <History className="h-3 w-3" /> : <Check className="h-3 w-3 text-amber-300" />}
            {formatEarnedDate(progress.earned_at)}
          </span>
        )}
      </div>
    </div>
  );
}

function TierMark({ tier, earned }: { tier: number; earned: boolean }) {
  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border font-serif text-xs font-bold",
        earned ? "border-amber-400/70 bg-amber-400/20 text-amber-200" : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {tierNumeral(tier)}
    </div>
  );
}

function ProgressBar({ current, required }: { current: number; required: number }) {
  return (
    <div className="flex max-w-xs items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
        <div className="h-full rounded-full bg-amber-400/80" style={{ width: `${(current / required) * 100}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {current}/{required}
      </span>
    </div>
  );
}

function SetChecklist({ members }: { members: { id: string; name: string; earned: boolean }[] }) {
  const earned = members.filter((member) => member.earned).length;
  return (
    <div className="space-y-1">
      <ProgressBar current={earned} required={members.length} />
      <ul className="flex flex-wrap gap-1.5">
        {members.map((member) => (
          <li
            key={member.id}
            className={cn(
              "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
              member.earned ? "border-amber-400/40 text-amber-200" : "border-border text-muted-foreground",
            )}
          >
            {member.earned && <Check className="h-3 w-3" />}
            {member.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A tiered series: one header with tier pips, then each tier as a nested row. */
export function AchievementSeriesCard({
  view,
  categoryIcon,
  isMac,
}: {
  view: SeriesView;
  categoryIcon: string;
  isMac: boolean;
}) {
  const complete = view.earnedCount === view.tiers.length;
  return (
    <section
      className={cn(
        "rounded-lg border bg-card",
        complete ? "border-amber-400/30" : view.earnedCount > 0 ? "border-amber-400/15" : "border-border",
      )}
    >
      <header className="flex items-center gap-3 border-b border-border/60 p-3">
        <AchievementIcon icon={categoryIcon} earned={view.earnedCount > 0} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{view.series.name}</h3>
          <p className="text-sm text-muted-foreground">{view.series.description}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <div className="flex gap-1" aria-label={`${view.earnedCount} of ${view.tiers.length} tiers earned`}>
            {view.tiers.map((tier) => (
              <span
                key={tier.achievement.id}
                className={cn(
                  "h-2 w-4 rounded-sm",
                  tier.state === "earned" ? "bg-amber-400" : tier.state === "locked" ? "bg-rose-500/30" : "bg-foreground/10",
                )}
              />
            ))}
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {view.earnedPoints}/{view.totalPoints} pts
          </span>
        </div>
      </header>
      <div className="divide-y divide-border/40 px-1">
        {view.tiers.map((tier) => (
          <AchievementRow key={tier.achievement.id} view={tier} categoryIcon={categoryIcon} isMac={isMac} nested />
        ))}
      </div>
    </section>
  );
}
