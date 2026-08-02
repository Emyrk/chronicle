import { BarChart3, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import type { InstanceViewMode } from "./instanceViewModeState";

export function InstanceViewModeSwitch({
  value,
  onChange,
  className,
}: {
  value: InstanceViewMode;
  onChange: (value: InstanceViewMode) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex rounded-md border border-border/70 bg-background/55 p-0.5 backdrop-blur-sm", className)}
      role="group"
      aria-label="Instance view"
    >
      <HintTooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1.5 rounded px-2.5 text-xs",
              value === "encounters" && "bg-accent text-accent-foreground shadow-sm hover:bg-accent",
            )}
            aria-pressed={value === "encounters"}
            onClick={() => onChange("encounters")}
          >
            <List className="h-3.5 w-3.5" />
            Encounters
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="max-w-64 text-center">
          Analyze individual encounters with player, enemy, and combat-event panels.
        </TooltipContent>
      </HintTooltip>
      <HintTooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 gap-1.5 rounded px-2.5 text-xs",
              value === "overview" && "bg-accent text-accent-foreground shadow-sm hover:bg-accent",
            )}
            aria-pressed={value === "overview"}
            onClick={() => onChange("overview")}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
            <span className="rounded-sm border border-amber-400/35 bg-amber-400/10 px-1 py-px text-[8px] font-bold uppercase tracking-wider text-amber-400">
              Beta
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6} className="max-w-64 text-center">
          Review the whole raid and compare its results against another raid or cohort.
        </TooltipContent>
      </HintTooltip>
    </div>
  );
}
