import { cn } from "@/lib/utils";
import { CHIP, difficultyChipClassName } from "./encounterDifficulty";
import { encounterVariantLabel, encounterVariantOptions, isEncounterVariant, isHardEncounterVariant, type EncounterVariant } from "./encounterVariant";

/** Report-only annotation. Unknown and historical kills remain unclassified. */
export function EncounterVariantMark({ variant, tooltip }: { variant?: string; tooltip?: string }) {
  if (!isEncounterVariant(variant)) return null;
  return <span className={difficultyChipClassName(isHardEncounterVariant(variant) ? "hard" : "")} title={tooltip ? `Encounter variant: ${encounterVariantLabel(variant)}\n${tooltip}` : `Encounter variant: ${encounterVariantLabel(variant)}`}>
    {variant === "hard" ? "HM" : variant === "normal" ? "N" : encounterVariantLabel(variant)}
  </span>;
}

export function EncounterVariantChips({ boss, active, onSelect, disabledReason }: {
  disabledReason?: string; boss: string; active?: EncounterVariant; onSelect: (variant?: EncounterVariant) => void;
}) {
  return <div role="group" aria-label={`${boss} variants`} className="mb-2 ml-9 mr-1 flex flex-wrap items-center gap-1">
    {([undefined, ...encounterVariantOptions(boss)]).map(variant => <button
      key={variant ?? "combined"} type="button" aria-pressed={active === variant}
      aria-label={`${boss} ${variant ? encounterVariantLabel(variant) : "Combined"}`}
      disabled={!!disabledReason}
      title={disabledReason ?? (variant ? encounterVariantLabel(variant) : "Combined, including unclassified history")}
      onClick={() => onSelect(variant)}
      className={cn(variant ? difficultyChipClassName(isHardEncounterVariant(variant) ? "hard" : "") : cn(CHIP, "bg-sky-500/15 text-sky-200 ring-sky-400/40"),
        "cursor-pointer transition-opacity disabled:cursor-not-allowed disabled:opacity-25 disabled:grayscale", active === variant ? "ring-2" : "opacity-35 hover:opacity-80")}
    >{variant === "normal" ? "N" : variant === "hard" ? "Hard" : variant ? encounterVariantLabel(variant) : "All"}</button>)}
    {disabledReason && <span role="note" className="w-full text-[10px] leading-snug text-muted-foreground" title={disabledReason}>Combined only in this view. Your choices are retained.</span>}
  </div>;
}
