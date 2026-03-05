import type { MouseEventHandler, ReactNode } from "react";
import { Card } from "@/components/ui/Card/Card";
import { cn } from "@/lib/utils";

interface PanelCardProps {
  flipped: boolean;
  onMouseDown?: MouseEventHandler<HTMLDivElement>;
  underConstruction?: boolean;
  front: ReactNode;
  back: ReactNode;
}

export function PanelCard({ flipped, onMouseDown, underConstruction, front, back }: PanelCardProps) {
  return (
    <div className="h-full [perspective:1400px]" onMouseDown={onMouseDown}>
      <div
        className={cn(
          "relative h-full transition-transform duration-300 [transform-style:preserve-3d]",
          flipped && "[transform:rotateY(180deg)]",
        )}
      >
        <Card
          className={cn(
            "absolute inset-0 p-4 gap-2 h-full mb-0 flex flex-col [backface-visibility:hidden]",
            underConstruction && "border-yellow-500/50",
            flipped && "pointer-events-none",
          )}
        >
          {front}
        </Card>
        <Card className={cn(
          "absolute inset-0 p-4 gap-2 h-full mb-0 flex flex-col [backface-visibility:hidden] [transform:rotateY(180deg)]",
          !flipped && "pointer-events-none",
        )}>
          {back}
        </Card>
      </div>
    </div>
  );
}
