import type { MouseEventHandler, ReactNode } from "react";
import { Card } from "@/components/ui/Card/Card";
import { cn } from "@/lib/utils";

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
          )}
          style={borderColor ? { borderColor } : undefined}
        >
          {front}
        </Card>
        <Card className={cn(
          "absolute inset-0 p-2 sm:p-4 gap-2 h-full mb-0 flex flex-col overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]",
          !flipped && "pointer-events-none",
        )}>
          {back}
        </Card>
      </div>
    </div>
  );
}
