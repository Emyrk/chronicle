import type { MouseEventHandler, ReactNode } from "react";
import { Card } from "@/components/ui/Card/Card";
import { cn } from "@/lib/utils";
import { useSeamlessLayout } from "./SeamlessLayoutContext";

interface PanelCardProps {
  flipped: boolean;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  underConstruction?: boolean;
  /** Optional user-chosen border color applied to the front card. */
  borderColor?: string | null;
  front: ReactNode;
  back: ReactNode;
  /** Defer mounting expensive settings until the card has been opened. */
  mountBack?: boolean;
  /**
   * The front has no padding: content runs to the edges (the panel's hoverHeader
   * floats over it). Content can react to the header showing with
   * `group-has-[[data-hover-header]:hover]/panel:*`.
   */
  bleed?: boolean;
  /** Let the card's faces establish their own height instead of filling a grid slot. */
  contentHeight?: boolean;
}

export function PanelCard({
  flipped,
  onMouseDown,
  underConstruction,
  borderColor,
  front,
  back,
  mountBack = true,
  bleed = false,
  contentHeight = false,
}: PanelCardProps) {
  const seamless = useSeamlessLayout();
  const shouldMountBack = back != null && mountBack;

  return (
    // A descendant filling the browser window (the Map's window fullscreen) needs
  // position: fixed against the viewport, so the flip's 3D context steps aside.
  <div className={cn("[perspective:1400px] has-[[data-window-fullscreen]]:[perspective:none]", !contentHeight && "h-full")} onMouseDown={onMouseDown}>
      <div
        className={cn(
          "relative transition-transform duration-300 [transform-style:preserve-3d] has-[[data-window-fullscreen]]:[transform-style:flat]",
          contentHeight ? "grid" : "h-full",
          flipped && "[transform:rotateY(180deg)]",
        )}
      >
        {/* Fixed-height cards clip content to their layout slot. Content-height
            cards keep both faces in one grid cell so either face can establish
            the natural height while preserving the flip animation. */}
        <Card
          className={cn(
            "group/panel gap-2 mb-0 flex flex-col overflow-hidden [backface-visibility:hidden] [transform:rotateY(0deg)] has-[[data-window-fullscreen]]:[transform:none]",
            contentHeight ? "relative [grid-area:1/1]" : "absolute inset-0 h-full",
            bleed ? "p-0" : "p-2 sm:p-4",
            underConstruction && "border-yellow-500/50",
            flipped && "pointer-events-none",
            seamless && "rounded-none shadow-none",
          )}
          style={borderColor ? { borderColor } : undefined}
          data-panel-explorer-host
        >
          {front}
        </Card>
        {/* The settings face can be expensive and may start data queries. Mount it
            on the first flip, then retain it so editor state and the return
            animation survive subsequent flips. */}
        {shouldMountBack && <Card className={cn(
          "p-2 sm:p-4 gap-2 mb-0 flex flex-col overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]",
          contentHeight ? "[grid-area:1/1]" : "absolute inset-0 h-full",
          !flipped && "pointer-events-none",
          seamless && "rounded-none shadow-none",
        )}>
          {back}
        </Card>}
      </div>
    </div>
  );
}
