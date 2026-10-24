/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated view component intentionally share this module. */
import { useCallback, useMemo } from "react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import {
  rotationTimelineProcessor,
  type RotationTimelineEvent,
  type RotationTimelineResult,
} from "../RotationTimeline/rotationTimeline.processor";
import { PlayerTimelineContent } from "../../Pages/PlayerTimelinePage/PlayerTimelineContent";
import {
  encodePlayerTimelinePanelOption,
  parsePlayerTimelinePanelOption,
  type PlayerTimelineState,
} from "../../Pages/PlayerTimelinePage/playerTimelineState";

function PlayerTimelinePanelContent({ context, panelOption, setPanelOption }: PanelRenderProps<RotationTimelineResult>) {
  const initialState = useMemo(() => parsePlayerTimelinePanelOption(panelOption), [panelOption]);
  const handleStateChange = useCallback(
    (state: PlayerTimelineState) => setPanelOption?.(encodePlayerTimelinePanelOption(state)),
    [setPanelOption],
  );

  return (
    <PlayerTimelineContent
      framed={false}
      context={context}
      initialState={initialState}
      onStateChange={handleStateChange}
    />
  );
}

/** Full-width, intrinsic-height Player Timeline used by the standard layout preset. */
export function createPlayerTimelinePanel(): PanelDefinition<RotationTimelineResult, RotationTimelineEvent> {
  return {
    ...rotationTimelineProcessor,
    label: "Player Timeline",
    icon: null,
    keybinds: "dynamic",
    syncDataMode: "full",
    selfManagesAggregation: true,
    hidden: true,
    disableCardFlip: true,
    supportsFiltering: false,
    heightMode: "content",
    hideHeader: true,
    contentBleed: true,
    render: (props) => <PlayerTimelinePanelContent {...props} />,
  };
}
