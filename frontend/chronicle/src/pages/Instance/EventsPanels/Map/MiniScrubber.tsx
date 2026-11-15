import { cn } from "@/lib/utils";
import { ReplayScrubber } from "../../ReplayScrubber";
import { scrubAria, type ScrubberSource } from "../../replayScrubberModel";

/** How far an arrow key moves the mini map's scrubber. */
export const MINI_KEY_STEP_MS = 5_000;

/**
 * The mini map's seek bar, floating centred just above the corner controls: a
 * thin line that thickens on hover; click or drag to seek, or Tab to it and use
 * the arrows, Page Up/Down, Home and End. `raised` lifts it over the "Replay
 * from here" button while the preview shows.
 */
export function MiniScrubber({ source, raised = false }: { source: ScrubberSource; raised?: boolean }) {
  return (
    <ReplayScrubber
      variant="track"
      source={source}
      aria={{ label: "Seek", ...scrubAria(source.nowMs, source.bounds, "percent") }}
      // Arrows step 5 s, Page Up/Down a tenth, Home/End the ends (the clock's seek clamps a preview's end short of its wrap).
      keyboard={{ stepMs: MINI_KEY_STEP_MS, pageFraction: 0.1 }}
      // Tab focuses it; a click or drag does not, so the page's Q/E/X replay keys keep working after a scrub.
      focusOnPress={false}
      className={cn(
        "group/scrub absolute left-1/2 z-40 h-3 w-1/2 -translate-x-1/2 cursor-pointer touch-none outline-none focus-visible:ring-1 focus-visible:ring-primary/70",
        raised ? "bottom-[4.25rem]" : "bottom-10",
      )}
    >
      {({ percent }) => (
        <>
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-black/60 shadow-[0_0_0_1px_rgba(255,255,255,.12)] transition-[height] group-hover/scrub:h-1.5">
            <div className="h-full bg-primary/90" style={{ width: `${percent}%` }} />
          </div>
          <div
            className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow-[0_0_0_2px_rgba(0,0,0,.6)] transition-opacity group-hover/scrub:opacity-100"
            style={{ left: `${percent}%` }}
          />
        </>
      )}
    </ReplayScrubber>
  );
}
