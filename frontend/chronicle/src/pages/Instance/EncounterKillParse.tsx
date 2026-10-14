import type { BossKillTimeParse } from "@/api/typesGenerated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { parseColor } from "./parseColors";
import { scoredKillParse } from "./Overview/encounterKillTimePopulation";

/**
 * Wraps an encounter row with a kill-time parse tooltip. Renders the row
 * unchanged when the kill has no score.
 */
export function KillParseTooltip({
  parse,
  lookbackDays,
  children,
}: {
  parse: BossKillTimeParse | undefined;
  lookbackDays: number | undefined;
  children: React.ReactElement;
}) {
  const scored = scoredKillParse(parse);
  if (!scored) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={8}
        hideArrow
        className="w-56 rounded-lg border border-white/10 bg-popover p-3 text-foreground shadow-lg"
      >
        <div className="space-y-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-semibold">Kill time parse</span>
            <span className={cn("font-mono text-sm font-bold", parseColor(scored.display_score))}>
              {scored.display_score}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Rank #{scored.rank} of {scored.sample_size}
            {lookbackDays ? ` over the last ${lookbackDays} days` : ""}.
          </p>
          {scored.status === "low_confidence" && (
            <p className="text-[11px] text-amber-400">Low confidence: small sample.</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
