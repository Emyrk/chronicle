import type { MouseEventHandler, ReactNode } from "react";
import { Card } from "@/components/ui/Card/Card";
import { cn } from "@/lib/utils";
import { useSeamlessLayout } from "./SeamlessLayoutContext";

/**
 * Lets panel content run to the card's sides and bottom edge (below the title
 * row) by cancelling the card's padding; the height grows by the bottom
 * padding it reclaims (merge after `h-full` with `cn`). Keep in step with
 * `p-2 sm:p-4` below.
 */
export const PANEL_CARD_BLEED = "-mx-2 -mb-2 h-[calc(100%+0.5rem)] sm:-mx-4 sm:-mb-4 sm:h-[calc(100%+1rem)]";

interface PanelCardProps {
  flipped: boolean;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  underConstruction?: boolean;
  /** Optional user-chosen border color applied to the front card. */
  borderColor?: string | null;
  front: ReactNode;
  back: ReactNode;
}

export function PanelCard({ flipped, onMouseDown, underConstruction, borderColor, front, back }: PanelCardProps) {
  const seamless = useSeamlessLayout();
  return (
    <div className="h-full [perspective:1400px]" onMouseDown={onMouseDown}>
      <div
        className={cn(
          "relative h-full transition-transform duration-300 [transform-style:preserve-3d]",
          flipped && "[transform:rotateY(180deg)]",
        )}
      >
        {/* overflow-hidden: content (e.g. a chart that mis-measured during the
            flip) must never paint outside the card. */}
        <Card
          className={cn(
            "absolute inset-0 p-2 sm:p-4 gap-2 h-full mb-0 flex flex-col overflow-hidden [backface-visibility:hidden] [transform:rotateY(0deg)]",
            underConstruction && "border-yellow-500/50",
            flipped && "pointer-events-none",
            seamless && "rounded-none shadow-none",
          )}
          style={borderColor ? { borderColor } : undefined}
        >
          {front}
        </Card>
        <Card className={cn(
          "absolute inset-0 p-2 sm:p-4 gap-2 h-full mb-0 flex flex-col overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]",
          !flipped && "pointer-events-none",
          seamless && "rounded-none shadow-none",
        )}>
          {back}
        </Card>
      </div>
    </div>
  );
}
