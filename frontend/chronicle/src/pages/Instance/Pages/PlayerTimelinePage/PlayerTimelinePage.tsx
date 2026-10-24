import type { PanelContext } from "../../EventsPanels/types";
import { PanelTray } from "./PanelTray";
import { PlayerTimelineContent } from "./PlayerTimelineContent";
import type { PlayerTimelineState } from "./playerTimelineState";

interface PlayerTimelinePageProps {
  context: PanelContext;
  /** Total duration of the selected encounters, for the grouped panels. */
  durationMs: number;
  /** Saved view state from a legacy page share link. */
  initialState?: unknown;
  /** Receives the current view state so legacy share links can include it. */
  onStateChange?: (state: PlayerTimelineState) => void;
}

/** Legacy page host retained so existing shared page links keep rendering. */
export function PlayerTimelinePage({ context, durationMs, initialState, onStateChange }: PlayerTimelinePageProps) {
  return (
    <div className="flex flex-col gap-3">
      <PanelTray context={context} durationMs={durationMs} />
      <PlayerTimelineContent context={context} initialState={initialState} onStateChange={onStateChange} />
    </div>
  );
}
