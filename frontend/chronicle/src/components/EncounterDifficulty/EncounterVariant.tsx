import { cn } from "@/lib/utils";
import { CHIP, difficultyChipClassName } from "./encounterDifficulty";
import { encounterVariantLabel, type EncounterVariant } from "./encounterVariant";

/** Report-only annotation. Unknown and historical kills remain unclassified. */
export function EncounterVariantMark({ variant }: { variant?: string }) {
  if (variant !== "normal" && variant !== "hard") return null;
  return <span className={difficultyChipClassName(variant === "normal" ? "" : "hard")} title={`Encounter variant: ${encounterVariantLabel(variant)}`}>
    {variant === "hard" ? "HM" : "N"}
  </span>;
}

export function EncounterVariantChips({ boss, active, onSelect }: {
  boss: string; active?: EncounterVariant; onSelect: (variant?: EncounterVariant) => void;
}) {
  return <div role="group" aria-label={`${boss} variants`} className="mb-2 ml-9 mr-1 flex flex-wrap items-center gap-1">
    {([undefined, "normal", "hard"] as const).map(variant => <button
      key={variant ?? "combined"} type="button" aria-pressed={active === variant}
      aria-label={`${boss} ${variant ? encounterVariantLabel(variant) : "Combined"}`}
      title={variant ? encounterVariantLabel(variant) : "Combined, including unclassified history"}
      onClick={() => onSelect(variant)}
      className={cn(variant ? difficultyChipClassName(variant === "normal" ? "" : "hard") : cn(CHIP, "bg-sky-500/15 text-sky-200 ring-sky-400/40"),
        "cursor-pointer transition-opacity", active === variant ? "ring-2" : "opacity-35 hover:opacity-80")}
    >{variant === "normal" ? "N" : variant === "hard" ? "Hard" : "All"}</button>)}
  </div>;
}
