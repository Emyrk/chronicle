import type { PanelContext } from "../EventsPanels/types";
import type { InstancePageType } from "../presetLayouts";
import { PlayerTimelinePage } from "./PlayerTimelinePage/PlayerTimelinePage";

/** Page view state shared through share links (layout.pageState). */
export interface PageStateBinding {
  /** State to start from, e.g. a share link; each page validates it. */
  initial: unknown;
  /** Reports the page's current state so share links can include it. */
  onChange: (state: unknown) => void;
}

interface InstanceContentPageProps {
  pageType: InstancePageType;
  context: PanelContext;
  /** Total duration of the selected encounters, for regular panels on the page. */
  durationMs: number;
  pageState: PageStateBinding;
}

/** Full-page content that replaces the panel grid for `kind: "page"` presets. */
export function InstanceContentPage({ pageType, context, durationMs, pageState }: InstanceContentPageProps) {
  switch (pageType) {
    case "player_timeline":
      return <PlayerTimelinePage context={context} durationMs={durationMs} initialState={pageState.initial} onStateChange={pageState.onChange} />;
    case "empty":
      return (
        <div className="flex min-h-[28rem] items-center justify-center rounded-lg border border-dashed border-border bg-card/30 px-6 text-center">
          <div>
            <p className="text-lg font-semibold">No panels exist</p>
            <p className="mt-1 text-sm text-muted-foreground">This page does not have any content yet.</p>
          </div>
        </div>
      );
  }
}
