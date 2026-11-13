import type { ReactNode } from "react";
import { RepairReceipts } from "@/components/EventRepair/RepairDetails";
import { Clock } from "lucide-react";
import { EncounterDifficultySummary } from "@/components/EncounterDifficulty/EncounterDifficultyMark";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import type { DifficultyEncounter } from "@/components/EncounterDifficulty/encounterDifficulty";
import { InstanceTimingTooltip } from "./InstanceTimingTooltip";
import { formatDurationMs } from "./phaseTimeRange";

interface InstanceHeaderDifficulty {
  maxPlayers: number;
  encounters: readonly DifficultyEncounter[];
  mixedDifficulty: boolean;
}

export interface InstanceHeaderProps {
  isMobile: boolean;
  name: string;
  nameAttributes?: {
    "data-entity"?: string;
    "data-entity-kind"?: string;
  };
  backgroundUrl?: string;
  heroic?: boolean;
  titleBadges?: ReactNode;
  repairs?: unknown;
  difficulty?: InstanceHeaderDifficulty;
  guild?: ReactNode;
  realm?: string;
  startTimeLabel: string;
  elapsedDurationMs?: number | null;
  combatDurationMs?: number;
  rankedDurationMs?: number;
  bossToBossDurationMs?: number;
  desktopModeSwitch?: ReactNode;
  mobileMenu?: ReactNode;
  desktopActions?: ReactNode;
}

function DifficultySummary({ difficulty }: { difficulty: InstanceHeaderDifficulty }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
      <span className="text-xs font-medium text-muted-foreground sm:text-sm">
        {difficulty.maxPlayers} Player
      </span>
      <EncounterDifficultySummary
        encounters={difficulty.encounters}
        mixedDifficulty={difficulty.mixedDifficulty}
      />
    </div>
  );
}

export function InstanceHeader({
  isMobile,
  name,
  nameAttributes,
  backgroundUrl,
  heroic = false,
  titleBadges,
  repairs,
  difficulty,
  guild,
  realm,
  startTimeLabel,
  elapsedDurationMs,
  combatDurationMs = 0,
  rankedDurationMs,
  bossToBossDurationMs,
  desktopModeSwitch,
  mobileMenu,
  desktopActions,
}: InstanceHeaderProps) {
  return (
    <div className={cn("relative mb-6 overflow-hidden rounded-lg border", heroic && "border-purple-500/30")}>
      {backgroundUrl && (
        <div className="absolute inset-0 z-0 overflow-hidden rounded-lg">
          <img src={backgroundUrl} alt="" className="h-full w-full object-cover opacity-70" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/70 to-background/50" />
          {heroic && (
            <div className="absolute inset-0 bg-gradient-to-r from-purple-900/10 via-purple-900/5 to-transparent" />
          )}
        </div>
      )}

      <div className={cn("relative z-10", isMobile ? "p-3" : "p-4")}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h1
            className={cn(
              "flex min-w-0 flex-wrap items-center gap-2 font-bold",
              isMobile ? "text-xl" : "text-2xl",
              heroic && "drop-shadow-[0_0_8px_rgba(147,51,234,0.3)]",
            )}
          >
            <span className="min-w-0 truncate" {...nameAttributes}>{name}</span>
            {titleBadges}
          </h1>

          {isMobile ? (
            <div className="shrink-0">{mobileMenu}</div>
          ) : (
            <div className="flex shrink-0 items-center gap-3">
              {difficulty && <DifficultySummary difficulty={difficulty} />}
              {desktopModeSwitch}
            </div>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          {isMobile && guild && <p>{guild}</p>}
          <p>
            {!isMobile && guild}
            {!isMobile && guild && realm && " • "}
            {realm}
            {(isMobile ? Boolean(realm) : Boolean(guild || realm)) && " • "}
            {startTimeLabel}
          </p>
        </div>

        <RepairReceipts repairs={repairs} />

        {isMobile && difficulty && (
          <div className="mt-2 flex flex-wrap items-center">
            <DifficultySummary difficulty={difficulty} />
          </div>
        )}

        <div className={cn("mt-2 flex items-end justify-between gap-3", isMobile && "flex-wrap")}>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {elapsedDurationMs != null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex cursor-help items-center gap-1.5 whitespace-nowrap">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDurationMs(elapsedDurationMs)}</span>
                    <span className="text-xs opacity-60">elapsed</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  className="pointer-events-none border border-white/10 bg-zinc-950 p-3 text-zinc-100 shadow-xl"
                  sideOffset={6}
                  hideArrow
                >
                  <InstanceTimingTooltip
                    elapsedDurationMs={elapsedDurationMs}
                    rankedDurationMs={rankedDurationMs}
                    bossToBossDurationMs={bossToBossDurationMs}
                  />
                </TooltipContent>
              </Tooltip>
            )}
            {combatDurationMs > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{formatDurationMs(combatDurationMs)}</span>
                    <span className="text-xs opacity-60">combat</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  className="pointer-events-none border border-white/10 bg-zinc-950 text-zinc-100 shadow-xl"
                  sideOffset={6}
                  hideArrow
                >
                  Sum of all encounter durations (active combat time)
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {!isMobile && <div className="flex shrink-0 items-center gap-2">{desktopActions}</div>}
        </div>
      </div>
    </div>
  );
}
