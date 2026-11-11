import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import type { Encounter, EncounterPhase } from "./InstancePage";
import { formatDurationMs, phaseWidthPercent, type EncounterOffsetRange } from "./phaseTimeRange";

function phaseTone(order: number, active: boolean): string {
  const tones = [
    active
      ? "border-violet-400/80 bg-violet-500/35 text-violet-50 shadow-[inset_0_0_0_1px_rgba(196,181,253,0.12)]"
      : "border-violet-400/55 bg-violet-500/15 text-violet-200",
    active
      ? "border-amber-400/80 bg-amber-500/30 text-amber-50 shadow-[inset_0_0_0_1px_rgba(253,230,138,0.12)]"
      : "border-amber-400/55 bg-amber-500/10 text-amber-200",
    active
      ? "border-cyan-400/80 bg-cyan-500/30 text-cyan-50"
      : "border-cyan-400/55 bg-cyan-500/10 text-cyan-200",
  ];
  return tones[order % tones.length];
}

/** Phase shortcut buttons shown under the selected boss encounter in the sidebar. */
export function EncounterPhaseStrip({
  encounter,
  phases,
  activePhaseId,
  onSelectPhase,
}: {
  encounter: Encounter;
  /** Phases sorted by order. */
  phases: readonly EncounterPhase[];
  activePhaseId: string | null;
  onSelectPhase: (range: EncounterOffsetRange, encounterId: string) => void;
}) {
  return (
    <div className="flex gap-1.5 px-2 pb-2" aria-label="Apply encounter phase time range">
      {phases.map((phase) => {
        const phaseSelected = activePhaseId === phase.id;
        const durationMs = phase.end_offset_ms - phase.start_offset_ms;
        const widthPercent = phaseWidthPercent(phase, encounter);
        return (
          <Tooltip key={phase.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => onSelectPhase(phase, encounter.id)}
                aria-label={`Filter to phase ${phase.order + 1}: ${phase.name}`}
                aria-pressed={phaseSelected}
                className={cn(
                  "flex h-7 min-w-12 cursor-pointer items-center justify-center overflow-hidden rounded border px-2 text-[11px] font-semibold transition-all duration-150",
                  "hover:-translate-y-px hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  phaseTone(phase.order, phaseSelected),
                )}
                style={{ flexGrow: Math.max(widthPercent, 16), flexBasis: 0 }}
              >
                <span className="truncate">{phase.name}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={8}
              hideArrow
              className="w-[232px] rounded-lg border border-border/80 bg-popover p-3.5 text-foreground shadow-2xl"
            >
              <div className="flex items-center justify-between gap-4">
                <p className="truncate text-sm font-semibold">
                  Phase {phase.order + 1} — {phase.name}
                </p>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatDurationMs(durationMs)}
                </span>
              </div>
              <p className="mt-2 border-t border-border/70 pt-2 text-[11px] font-medium text-amber-500">
                Click to filter this phase <span aria-hidden>→</span>
              </p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
