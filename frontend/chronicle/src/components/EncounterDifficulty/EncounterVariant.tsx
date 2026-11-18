import type { EncounterVariantTooltipData } from "@/api/typesGenerated";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { CHIP, difficultyChipClassName } from "./encounterDifficulty";
import { encounterVariantLabel, encounterVariantOptions, isEncounterVariant, isHardEncounterVariant, type EncounterVariant } from "./encounterVariant";

const YOGG_AURAS: Record<number, { keeper: string; name: string }> = {
  62670: { keeper: "Freya", name: "Resilience of Nature" },
  62650: { keeper: "Hodir", name: "Fortitude of Frost" },
  62702: { keeper: "Thorim", name: "Fury of the Storm" },
  62671: { keeper: "Mimiron", name: "Speed of Invention" },
};

function supportsRichTooltip(data?: EncounterVariantTooltipData): data is EncounterVariantTooltipData {
  return data?.type === "yogg-light" && Array.isArray(data.auras) && data.auras.every(id => Number.isInteger(id) && Object.hasOwn(YOGG_AURAS, id));
}

/** Display-only content. SpellIdTooltip resolves icons against the instance dataset. */
export function EncounterVariantTooltipContent({ data, fallback }: { data: EncounterVariantTooltipData; fallback?: string }) {
  if (!supportsRichTooltip(data)) return <span>{fallback}</span>;
  const auras = [...new Set(data.auras)];
  if (auras.length === 0) return <p>No keepers assisting.</p>;
  return <ul className="space-y-2">
    {auras.map(id => <li key={id} className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{YOGG_AURAS[id].keeper}</span>
      <SpellIdTooltip spellId={id} name={YOGG_AURAS[id].name} size={24} />
    </li>)}
  </ul>;
}

/** Report-only annotation. Text remains available to consumers without rich tooltip support. */
export function EncounterVariantMark({ variant, tooltip, tooltipData }: {
  variant?: string; tooltip?: string; tooltipData?: EncounterVariantTooltipData;
}) {
  if (!isEncounterVariant(variant)) return null;
  const description = tooltip ? `Encounter variant: ${encounterVariantLabel(variant)}\n${tooltip}` : `Encounter variant: ${encounterVariantLabel(variant)}`;
  const rich = supportsRichTooltip(tooltipData);
  const badge = <span className={difficultyChipClassName(isHardEncounterVariant(variant) ? "hard" : "")}
    title={rich ? undefined : description} aria-label={description} tabIndex={rich ? 0 : undefined}>
    {variant === "hard" ? "HM" : variant === "normal" ? "N" : encounterVariantLabel(variant)}
  </span>;
  if (!rich) return badge;
  return <HintTooltip>
    <TooltipTrigger asChild>{badge}</TooltipTrigger>
    <TooltipContent side="right" sideOffset={6} className="max-w-xs p-3">
      <div className="mb-2 font-semibold">{encounterVariantLabel(variant)}</div>
      <EncounterVariantTooltipContent data={tooltipData} fallback={tooltip} />
    </TooltipContent>
  </HintTooltip>;
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
