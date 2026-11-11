import type { ReactNode } from "react";
import { List } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { cn } from "@/lib/utils";
import type { Encounter, EncounterPhase } from "./InstancePage";
import { formatDurationMs, phaseWidthPercent, rangeStartPercent, type EncounterOffsetRange } from "./phaseTimeRange";

const SHOW_PHASE_LIST_STORAGE_KEY = "instance-show-phase-list";

/** Bar slices narrower than this share of the fight show no label. */
const MIN_LABELED_PERCENT = 14;

const PHASE_FILLS = [
  { idle: "bg-violet-500/30", active: "bg-violet-500/70", text: "text-violet-100" },
  { idle: "bg-amber-500/25", active: "bg-amber-500/65", text: "text-amber-100" },
  { idle: "bg-cyan-500/25", active: "bg-cyan-500/65", text: "text-cyan-100" },
];

function phaseFill(order: number) {
  return PHASE_FILLS[order % PHASE_FILLS.length];
}

function phaseDurationMs(phase: EncounterPhase): number {
  return phase.end_offset_ms - phase.start_offset_ms;
}

function PhaseTooltip({ phase, children }: { phase: EncounterPhase; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
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
            {formatDurationMs(phaseDurationMs(phase))}
          </span>
        </div>
        <p className="mt-2 border-t border-border/70 pt-2 text-[11px] font-medium text-amber-500">
          Click to filter this phase <span aria-hidden>→</span>
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Phase shortcuts under the selected boss encounter in the sidebar: a timeline
 * bar split by phase duration, with an optional list of every phase by name.
 */
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
  const [showList, setShowList] = useLocalStorage(SHOW_PHASE_LIST_STORAGE_KEY, false);
  const active = phases.find((p) => p.id === activePhaseId);

  return (
    <div className="px-2 pb-2" aria-label="Apply encounter phase time range">
      <div className="flex gap-1">
        <div className="flex h-6 min-w-0 flex-1 overflow-hidden rounded border border-white/15">
          {phases.map((phase) => {
            const phaseSelected = activePhaseId === phase.id;
            const fill = phaseFill(phase.order);
            const widthPercent = phaseWidthPercent(phase, encounter);
            return (
              <PhaseTooltip key={phase.id} phase={phase}>
                <button
                  type="button"
                  onClick={() => onSelectPhase(phase, encounter.id)}
                  aria-label={`Filter to phase ${phase.order + 1}: ${phase.name}`}
                  aria-pressed={phaseSelected}
                  className={cn(
                    "flex min-w-1 cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap border-r border-black/40 px-1 text-[10px] font-semibold last:border-r-0",
                    "hover:brightness-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    phaseSelected ? fill.active : fill.idle,
                    fill.text,
                  )}
                  style={{ flexGrow: widthPercent, flexBasis: 0 }}
                >
                  {widthPercent >= MIN_LABELED_PERCENT && <span className="truncate">{phase.name}</span>}
                </button>
              </PhaseTooltip>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setShowList((v) => !v)}
          aria-label={showList ? "Hide phase list" : "Show phase list"}
          aria-pressed={showList}
          title={showList ? "Hide phase list" : "Show phase list"}
          className={cn(
            "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded border transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            showList ? "border-white/40 bg-white/15" : "border-white/15 opacity-70 hover:bg-white/10 hover:opacity-100",
          )}
        >
          <List className="h-3.5 w-3.5" />
        </button>
      </div>

      {showList ? (
        <div className="mt-1 flex flex-col gap-0.5">
          {phases.map((phase) => {
            const phaseSelected = activePhaseId === phase.id;
            const fill = phaseFill(phase.order);
            return (
              <button
                key={phase.id}
                type="button"
                onClick={() => onSelectPhase(phase, encounter.id)}
                aria-label={`Filter to phase ${phase.order + 1}: ${phase.name}`}
                aria-pressed={phaseSelected}
                className={cn(
                  "relative flex h-6 w-full cursor-pointer items-center justify-between gap-2 overflow-hidden rounded border px-2 text-[11px] font-semibold transition-all duration-150",
                  "hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  phaseSelected ? "border-white/40 bg-white/10" : "border-transparent bg-black/15",
                )}
              >
                <span
                  aria-hidden
                  className={cn("absolute inset-y-0", phaseSelected ? fill.active : fill.idle)}
                  style={{
                    left: `${rangeStartPercent(phase, encounter)}%`,
                    width: `max(2px, ${phaseWidthPercent(phase, encounter)}%)`,
                  }}
                />
                <span className={cn("relative truncate", fill.text)}>{phase.name}</span>
                <span className="relative shrink-0 font-mono font-normal opacity-80">
                  {formatDurationMs(phaseDurationMs(phase))}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        active && (
          <div className="mt-1 flex justify-between px-0.5 text-[11px]">
            <span className="truncate font-semibold">{active.name}</span>
            <span className="shrink-0 font-mono opacity-70">{formatDurationMs(phaseDurationMs(active))}</span>
          </div>
        )
      )}
    </div>
  );
}
