import type { ReactNode } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import type { Encounter, EncounterPhase } from "./InstancePage";
import { formatDurationMs, phaseWidthPercent, rangeStartPercent, type EncounterOffsetRange } from "./phaseTimeRange";

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

/** Solid fills for timeline segments, matching phaseTone's hues. */
const PHASE_FILLS = [
  { idle: "bg-violet-500/30", active: "bg-violet-500/70", text: "text-violet-100" },
  { idle: "bg-amber-500/25", active: "bg-amber-500/65", text: "text-amber-100" },
  { idle: "bg-cyan-500/25", active: "bg-cyan-500/65", text: "text-cyan-100" },
];

function phaseFill(order: number) {
  return PHASE_FILLS[order % PHASE_FILLS.length];
}

export type EncounterPhaseStripVariant = "chips" | "list" | "bar";

interface EncounterPhaseStripProps {
  encounter: Encounter;
  /** Phases sorted by order. */
  phases: readonly EncounterPhase[];
  activePhaseId: string | null;
  onSelectPhase: (range: EncounterOffsetRange, encounterId: string) => void;
  /** Layout prototype; "chips" is the shipped layout. */
  variant?: EncounterPhaseStripVariant;
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
            {formatDurationMs(phase.end_offset_ms - phase.start_offset_ms)}
          </span>
        </div>
        <p className="mt-2 border-t border-border/70 pt-2 text-[11px] font-medium text-amber-500">
          Click to filter this phase <span aria-hidden>→</span>
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/** Phase shortcut buttons shown under the selected boss encounter in the sidebar. */
export function EncounterPhaseStrip({ variant = "chips", ...props }: EncounterPhaseStripProps) {
  if (variant === "list") return <PhaseList {...props} />;
  if (variant === "bar") return <PhaseBar {...props} />;
  return <PhaseChips {...props} />;
}

function PhaseChips({ encounter, phases, activePhaseId, onSelectPhase }: EncounterPhaseStripProps) {
  return (
    <div className="flex gap-1.5 px-2 pb-2" aria-label="Apply encounter phase time range">
      {phases.map((phase) => {
        const phaseSelected = activePhaseId === phase.id;
        const widthPercent = phaseWidthPercent(phase, encounter);
        return (
          <PhaseTooltip key={phase.id} phase={phase}>
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
          </PhaseTooltip>
        );
      })}
    </div>
  );
}

/** One full-width row per phase; a faint track marks where the phase sits in the fight. */
function PhaseList({ encounter, phases, activePhaseId, onSelectPhase }: EncounterPhaseStripProps) {
  return (
    <div className="flex flex-col gap-0.5 px-2 pb-2" aria-label="Apply encounter phase time range">
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
              {formatDurationMs(phase.end_offset_ms - phase.start_offset_ms)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A single track split into slices sized by duration; labels only where they fit. */
function PhaseBar({ encounter, phases, activePhaseId, onSelectPhase }: EncounterPhaseStripProps) {
  const active = phases.find((p) => p.id === activePhaseId);
  return (
    <div className="px-2 pb-2">
      <div className="flex h-6 w-full overflow-hidden rounded border border-white/15" aria-label="Apply encounter phase time range">
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
                {widthPercent >= 14 && <span className="truncate">{phase.name}</span>}
              </button>
            </PhaseTooltip>
          );
        })}
      </div>
      {active && (
        <div className="mt-1 flex justify-between px-0.5 text-[11px]">
          <span className="truncate font-semibold">{active.name}</span>
          <span className="shrink-0 font-mono opacity-70">
            {formatDurationMs(active.end_offset_ms - active.start_offset_ms)}
          </span>
        </div>
      )}
    </div>
  );
}
