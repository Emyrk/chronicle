import type { ReactElement } from "react";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";

/**
 * Wraps a replay play/pause button in a tooltip naming its keybind: "Play X"
 * or "Pause X". `label` replaces Play/Pause (e.g. "Play the replay"); with
 * `keybind` false (e.g. the mini map's own preview, which X does not drive)
 * only the label shows.
 */
export function ReplayPlayTooltip({
  playing,
  label,
  keybind = true,
  children,
}: {
  playing: boolean;
  label?: string;
  keybind?: boolean;
  children: ReactElement;
}) {
  return (
    <HintTooltip delayDuration={200}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-1.5">
        {label ?? (playing ? "Pause" : "Play")}
        {keybind && (
          <kbd className="rounded border border-white/20 bg-white/10 px-1 font-mono text-[10px] leading-4 text-zinc-100">X</kbd>
        )}
      </TooltipContent>
    </HintTooltip>
  );
}
