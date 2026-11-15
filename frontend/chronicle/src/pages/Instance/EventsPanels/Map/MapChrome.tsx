import type { ReactElement, ReactNode } from "react";
import { Loader2, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import type { Encounter } from "../../InstancePage";
import { ReplayTransportBar, usePlayerDeathTimes } from "../../ReplayControlOverlay";
import type { PanelRenderProps } from "../types";
import type { MapResult } from "./map.processor";
import { framingButtonClass, mapFramingButtonClass } from "./mapChromeStyles";
import { raidTargetMarkerImage } from "./plan/planArt";
import type { ReplayFeaturedUnit } from "./replayFeaturedUnits";

/**
 * Expands a mini map: `onExpand` (the 3D replay going fullscreen) when given,
 * else the full Map layout, when the page can switch layouts.
 * `overlay`: drawn on the map's top-right corner, always there; it fades while
 * the card's title row (which has its own Expand) shows over it.
 */
export function ExpandMapButton({ context, overlay = false, onExpand }: { context: PanelRenderProps<MapResult>["context"]; overlay?: boolean; onExpand?: () => void }) {
  if (!onExpand && !context.onApplyPreset) return null;
  return (
    <button
      type="button"
      onClick={onExpand ?? (() => context.onApplyPreset?.("map"))}
      title={onExpand ? "Watch the replay fullscreen" : "Open the full map"}
      className={overlay
        ? cn(mapFramingButtonClass, "absolute right-2 top-2 z-40 transition-opacity group-has-[[data-hover-header]:hover]/panel:pointer-events-none group-has-[[data-hover-header]:hover]/panel:opacity-0")
        : framingButtonClass}
    >
      <Maximize2 className="h-3 w-3" />
      Expand
    </button>
  );
}

/** A key drawn as a keycap. */
export function Keycap({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-white/25 border-b-2 border-b-white/40 bg-gradient-to-b from-white/20 to-white/5 px-1 font-mono text-[10px] font-semibold leading-none text-white shadow-[0_1px_0_rgba(0,0,0,.6)]">
      {children}
    </kbd>
  );
}

/** A map button's hover hint: what it does, then its key combinations (alternatives split by "or"). */
export function KeybindTooltip({ label, keys, children }: { label: string; keys: string[][]; children: ReactElement }) {
  return (
    <HintTooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="left" className="flex items-center gap-1.5">
        {label}
        {keys.map((combo, index) => (
          <span key={combo.join("+")} className="flex items-center gap-0.5">
            {index > 0 && <span className="mr-1 text-zinc-400">or</span>}
            {combo.map((key) => <Keycap key={key}>{key}</Keycap>)}
          </span>
        ))}
      </TooltipContent>
    </HintTooltip>
  );
}

/** One walk-mode control: its keycaps, then what they do. */
export function WalkHint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      {keys.map((key) => <Keycap key={key}>{key}</Keycap>)}
      <span>{children}</span>
    </span>
  );
}

/**
 * Fullscreen's Replay controls; its own component so death times load only while fullscreen.
 * `onEnable`: what its Enable Replay does instead (a preview hands over at its own moment).
 */
export function FullscreenReplayBar({ onEnable }: { onEnable?: () => void }) {
  const deaths = usePlayerDeathTimes();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-4">
      <ReplayTransportBar
        deaths={deaths}
        onEnable={onEnable}
        className="pointer-events-auto h-auto w-full max-w-4xl rounded-md border border-white/15 bg-black/70 shadow-[0_8px_32px_rgba(0,0,0,.6)] backdrop-blur-sm"
      />
    </div>
  );
}

/**
 * Fullscreen, middle left: the run's boss encounters, one click to watch another.
 * A pick only selects, as the encounter list does: it never turns on the page's
 * Replay (its analytics mode); the map's preview keeps it playing.
 */
export function FullscreenEncounterPicker({ encounters, selectedIds, onSelect }: {
  encounters: Encounter[];
  selectedIds: string[];
  onSelect: (encounterIds: string[]) => void;
}) {
  const bosses = encounters.filter((encounter) => encounter.boss);
  if (bosses.length === 0) return null;
  return (
    <nav
      aria-label="Encounters"
      className="styled-scrollbar absolute left-2 top-1/2 z-40 flex max-h-[60%] w-44 -translate-y-1/2 flex-col gap-0.5 overflow-y-auto rounded-sm border border-black/80 bg-black/75 p-1 shadow-[0_4px_16px_rgba(0,0,0,.5)]"
    >
      {bosses.map((encounter) => {
        const selected = selectedIds.length === 1 && selectedIds[0] === encounter.id;
        const failed = encounter.kill_type === "wipe" || encounter.kill_type === "reset";
        return (
          <button
            key={encounter.id}
            type="button"
            onClick={() => onSelect([encounter.id])}
            aria-pressed={selected}
            title={failed ? `${encounter.name} (${encounter.kill_type})` : encounter.name}
            className={cn(
              "truncate rounded-sm px-2 py-1 text-left text-[11px]",
              selected ? "bg-primary/80 text-primary-foreground" : "text-white/75 hover:bg-white/10 hover:text-white",
              failed && !selected && "text-white/40",
            )}
          >
            {encounter.name}
            {failed && <span className="ml-1 text-[9px] uppercase">{encounter.kill_type}</span>}
          </button>
        );
      })}
    </nav>
  );
}

/** While the panel reprocesses: the frozen map says what it is waiting for. */
export function ReloadingChip() {
  return (
    <div className="pointer-events-none absolute left-1/2 top-2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-sm bg-black/75 px-2 py-0.5 text-[11px] text-white/80 shadow-[0_4px_16px_rgba(0,0,0,.5)]">
      <Loader2 className="h-3 w-3 animate-spin" />
      Loading the encounter…
    </div>
  );
}

/** A reconstruction's featured characters (the instance's `replayFeaturedUnits`), middle left. */
export function FeaturedUnits({ units }: { units: readonly ReplayFeaturedUnit[] | undefined }) {
  if (!units?.length) return null;
  return (
    <div className="pointer-events-none absolute left-2 top-1/2 z-40 flex -translate-y-1/2 flex-col gap-1.5" aria-label="Featured characters">
      {units.map((unit) => (
        <div
          key={unit.guid}
          className="flex items-center gap-2 rounded-md border bg-black/85 px-2.5 py-1.5 shadow-[0_6px_20px_rgba(0,0,0,.55)] backdrop-blur-sm"
          style={{ borderColor: `${unit.color}99` }}
        >
          <img src={raidTargetMarkerImage(unit.marker)} alt="" className="size-[18px] shrink-0 object-contain" />
          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-white">{unit.name}</span>
          <span className="text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: unit.color }}>{unit.role}</span>
        </div>
      ))}
    </div>
  );
}
