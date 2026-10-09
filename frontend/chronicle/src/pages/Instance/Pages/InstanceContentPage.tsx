import type { PanelContext } from "../EventsPanels/types";
import type { InstancePageType } from "../presetLayouts";
import { PlayerTimelinePage } from "./PlayerTimelinePage/PlayerTimelinePage";

interface InstanceContentPageProps {
  pageType: InstancePageType;
  context: PanelContext;
}

/** Full-page content that replaces the panel grid for `kind: "page"` presets. */
export function InstanceContentPage({ pageType, context }: InstanceContentPageProps) {
  switch (pageType) {
    case "player_timeline":
      return <PlayerTimelinePage context={context} />;
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
