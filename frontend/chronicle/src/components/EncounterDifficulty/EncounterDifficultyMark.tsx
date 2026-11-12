import { HeroicBadge } from "@/components/HeroicBadge";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { difficultyLabel } from "@/lib/wowUtils";
import { type DifficultyEncounter, summarizeDifficulty } from "./encounterDifficulty";

const CHIP = "inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ring-1 ring-inset";
const HEROIC_CHIP = "bg-purple-500/20 text-purple-200 ring-purple-400/40";
const VARIANT_CHIP = "bg-amber-500/15 text-amber-200 ring-amber-400/40";

export function EncounterDifficultyMark({ difficulty, tooltipSide = "top", className }: {
  difficulty: string;
  tooltipSide?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  if (difficulty === "") return null;
  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <span className={cn(CHIP, difficulty === "heroic" ? HEROIC_CHIP : VARIANT_CHIP, "cursor-help max-w-24", className)}>
          <span className="truncate">{difficulty === "heroic" ? "H" : difficultyLabel(difficulty)}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>
        <EncounterDifficultyTooltipBody difficulty={difficulty} />
      </TooltipContent>
    </HintTooltip>
  );
}

export function EncounterDifficultyTooltipBody({ difficulty }: { difficulty: string }) {
  return <span className="text-xs font-semibold">{difficultyLabel(difficulty)}</span>;
}

/** Mixed is authoritative API metadata, including boss wipes, not inferred from successful kills. */
export function EncounterDifficultySummary({ encounters, mixedDifficulty }: {
  encounters: readonly DifficultyEncounter[];
  mixedDifficulty: boolean;
}) {
  const { kills, counts } = summarizeDifficulty(encounters);
  const allHeroic = !mixedDifficulty && kills.length > 0 && counts.get("heroic") === kills.length;
  const visibleCounts = [...counts].filter(([difficulty]) => mixedDifficulty || difficulty !== "");

  if (allHeroic) return <HeroicBadge />;

  if (mixedDifficulty) {
    const breakdown = visibleCounts
      .map(([difficulty, count]) => `${difficultyLabel(difficulty)} kills ${count}/${kills.length}`)
      .join(", ");

    return (
      <HintTooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(CHIP, HEROIC_CHIP, "cursor-help gap-1 px-2 text-xs")}
            aria-label={breakdown ? `Mixed difficulty, ${breakdown}` : "Mixed difficulty"}
          >
            <span>Mixed</span>
            {visibleCounts.length > 0 && (
              <span className="font-medium text-purple-100/80">
                {visibleCounts.map(([difficulty, count]) => (
                  <span key={difficulty} className="before:mx-1 before:content-['·']">
                    {count}{difficulty === "" ? "N" : difficulty === "heroic" ? "H" : ` ${difficultyLabel(difficulty)}`}
                  </span>
                ))}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="space-y-1">
          <p className="text-xs font-semibold">Mixed difficulty</p>
          {visibleCounts.map(([difficulty, count]) => (
            <p key={difficulty} className="text-xs text-muted-foreground">
              {difficultyLabel(difficulty)} kills {count}/{kills.length}
            </p>
          ))}
        </TooltipContent>
      </HintTooltip>
    );
  }

  return visibleCounts.map(([difficulty, count]) => (
    <span key={difficulty} className={cn(CHIP, difficulty === "heroic" ? HEROIC_CHIP : VARIANT_CHIP, "px-2 text-xs")}>
      {difficultyLabel(difficulty)} kills {count}/{kills.length}
    </span>
  ));
}
