import { Flame } from "lucide-react";
import type { WoWEncounterDifficulty } from "@/api/typesGenerated";
import { HeroicBadge } from "@/components/HeroicBadge";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import {
  HARD_MODES,
  type DifficultyEncounter,
  type HardModeScale,
  hardModeTierLabel,
  summarizeDifficulty,
} from "./encounterDifficulty";

const CHIP = "inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ring-1 ring-inset";
const HEROIC_CHIP = "bg-purple-500/20 text-purple-200 ring-purple-400/40";
const HARD_MODE_CHIP = "bg-amber-500/15 text-amber-200 ring-amber-400/40";

type TooltipSide = "top" | "right" | "bottom" | "left";

/**
 * Soft-tint chip marking one boss's difficulty: purple "H" for Heroic, amber
 * "HM" (or the tier, e.g. "2 elders") for an Ulduar hard mode. Renders nothing
 * for normal pulls.
 */
export function EncounterDifficultyMark({
  encounterName,
  difficulty,
  tooltipSide = "top",
  className,
}: {
  encounterName: string;
  difficulty: WoWEncounterDifficulty | undefined;
  tooltipSide?: TooltipSide;
  className?: string;
}) {
  if (!difficulty) return null;
  const heroic = difficulty.mode === "heroic";
  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <span className={cn(CHIP, heroic ? HEROIC_CHIP : HARD_MODE_CHIP, "cursor-help", className)}>
          {heroic ? "H" : <><Flame className="h-2.5 w-2.5" />{hardModeTierLabel(encounterName, difficulty) ?? "HM"}</>}
        </span>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} className={heroic ? undefined : "p-3"}>
        <EncounterDifficultyTooltipBody encounterName={encounterName} difficulty={difficulty} />
      </TooltipContent>
    </HintTooltip>
  );
}

/** Heroic is self-explanatory; a hard mode explains its trigger and, if tiered, where this kill sits. */
export function EncounterDifficultyTooltipBody({
  encounterName,
  difficulty,
}: {
  encounterName: string;
  difficulty: WoWEncounterDifficulty;
}) {
  if (difficulty.mode === "heroic") {
    return <span className="text-xs font-semibold text-purple-300">Heroic</span>;
  }
  const info = HARD_MODES[encounterName];
  const tier = hardModeTierLabel(encounterName, difficulty);
  return (
    <div className="max-w-64 text-xs">
      <div className="flex items-center gap-1.5 font-semibold text-amber-300">
        <Flame className="h-3.5 w-3.5" /> Hard mode{tier && <span className="text-zinc-100">· {tier}</span>}
      </div>
      {info && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <div className="text-[10px] uppercase tracking-wide text-zinc-400">How it's triggered</div>
          <p className="text-zinc-400">{info.trigger}</p>
        </div>
      )}
      {info?.scale && difficulty.tier !== undefined && <TierScale scale={info.scale} tier={difficulty.tier} />}
    </div>
  );
}

/** Pips from easiest to hardest, filled up to this kill's tier. */
function TierScale({ scale, tier }: { scale: HardModeScale; tier: number }) {
  const steps = Array.from({ length: scale.max - scale.min + 1 }, (_, i) => scale.min + i);
  // Order easiest → hardest so "more filled" always means "harder".
  const ordered = scale.hardest === "max" ? steps : [...steps].reverse();
  const reached = ordered.indexOf(tier);
  return (
    <div className="mt-2">
      <div className="flex gap-1">
        {ordered.map((step, i) => (
          <div key={step} className="flex flex-col items-center gap-0.5">
            <span className={cn("h-1.5 w-6 rounded-full", i <= reached ? "bg-amber-500" : "bg-white/15")} />
            <span className={cn("font-mono text-[10px]", step === tier ? "font-bold text-amber-300" : "text-zinc-400")}>
              {step}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] text-zinc-400">
        <span>easier</span>
        <span>hardest</span>
      </div>
    </div>
  );
}

/**
 * Instance header summary. With per-boss data: the Heroic badge when every
 * kill was Heroic, "Heroic 7/12" for a mixed run, and "N hard modes" with a
 * per-boss list. Without it, falls back to the instance-level Heroic flag.
 */
export function EncounterDifficultySummary({
  encounters,
  instanceHeroic,
}: {
  encounters: readonly DifficultyEncounter[];
  instanceHeroic: boolean;
}) {
  const summary = summarizeDifficulty(encounters);
  if (!summary.hasDifficulty) return instanceHeroic ? <HeroicBadge /> : null;
  const { kills, heroicKills, hardModeKills } = summary;
  return (
    <>
      {heroicKills > 0 && heroicKills === kills.length && <HeroicBadge />}
      {heroicKills > 0 && heroicKills < kills.length && (
        <span className={cn(CHIP, HEROIC_CHIP, "px-2 text-xs")}>Heroic {heroicKills}/{kills.length}</span>
      )}
      {hardModeKills > 0 && (
        <HintTooltip>
          <TooltipTrigger asChild>
            <span className={cn(CHIP, HARD_MODE_CHIP, "cursor-help gap-1 px-2 text-xs")}>
              <Flame className="h-3 w-3" /> {hardModeKills} hard mode{hardModeKills === 1 ? "" : "s"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="p-3">
            <HardModeList kills={kills} />
          </TooltipContent>
        </HintTooltip>
      )}
    </>
  );
}

/** Every killed boss that has a hard mode, and whether this run did it. */
export function HardModeList({ kills }: { kills: readonly DifficultyEncounter[] }) {
  const withHardMode = kills.filter((k) => HARD_MODES[k.name] || k.difficulty?.mode === "hard_mode");
  return (
    <div className="w-60 text-xs">
      <div className="mb-1.5 font-semibold">Hard modes this run</div>
      <ul className="space-y-1">
        {withHardMode.map((k) => {
          const hard = k.difficulty?.mode === "hard_mode";
          return (
            <li key={k.name} className={cn("flex items-center gap-2", !hard && "text-zinc-400")}>
              {hard
                ? <Flame className="h-3 w-3 shrink-0 text-amber-400" />
                : <span className="h-3 w-3 shrink-0 text-center leading-3">–</span>}
              <span className="flex-1 truncate">{k.name}</span>
              <span className={cn("shrink-0", hard && "text-amber-300")}>
                {hard ? (k.difficulty && hardModeTierLabel(k.name, k.difficulty)) ?? "Hard" : "Normal"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
