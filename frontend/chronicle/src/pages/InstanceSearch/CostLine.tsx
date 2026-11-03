import { AlertTriangle, Coins, OctagonX } from "lucide-react";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import type { QueryCost } from "./searchCost";
import type { SearchBudget } from "./searchApi";

/**
 * The search's cost, live as it's edited, against the caller's budget:
 * plain when it fits, amber when it costs more than what's left right now
 * (with how long until enough refills), red when it costs more than the whole
 * budget and can never run. Hover for where the cost comes from.
 */
export function CostLine({
  cost,
  budget,
  refillPerMinute,
}: {
  cost: QueryCost;
  budget: SearchBudget | null;
  refillPerMinute: number | null;
}) {
  const remaining = budget ? Math.floor(budget.remaining) : null;
  const tooComplex = budget != null && cost.total > budget.limit;
  const short = !tooComplex && remaining != null && cost.total > remaining;
  const waitSeconds = short && refillPerMinute ? Math.ceil((cost.total - (budget?.remaining ?? 0)) / (refillPerMinute / 60)) : null;

  return (
    <HintTooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-live="polite"
          className={cn(
            "inline-flex cursor-help items-center gap-1.5 rounded-md px-2 py-1 text-xs tabular-nums",
            tooComplex ? "bg-red-500/10 text-red-300" : short ? "bg-amber-500/10 text-amber-200" : "text-muted-foreground",
          )}
        >
          {tooComplex ? <OctagonX className="h-3.5 w-3.5" /> : short ? <AlertTriangle className="h-3.5 w-3.5" /> : <Coins className="h-3.5 w-3.5" />}
          {tooComplex ? (
            <>Costs {cost.total}, more than your whole budget of {budget?.limit}. Remove some conditions.</>
          ) : short ? (
            <>
              Costs {cost.total}, you have {remaining}
              {waitSeconds ? ` · enough in ~${waitSeconds}s` : ""}
            </>
          ) : (
            <>
              Cost {cost.total}
              {remaining != null && <span className="text-muted-foreground/70"> · {remaining} left</span>}
            </>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="w-64 p-3 text-left">
        <p className="mb-1.5 font-semibold">Where the cost comes from</p>
        <ul className="space-y-0.5 text-xs">
          {cost.parts.map((p) => (
            <li key={p.label} className="flex justify-between gap-3 tabular-nums">
              <span>
                {p.label}
                {p.count > 1 && <span className="text-muted-foreground"> ×{p.count}</span>}
              </span>
              <span>{p.cost}</span>
            </li>
          ))}
          <li className="mt-1 flex justify-between gap-3 border-t border-white/10 pt-1 font-semibold tabular-nums">
            <span>Total</span>
            <span>{cost.total}</span>
          </li>
        </ul>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Searches spend from a budget that refills over time. Parses across players and boss / trash / idle time cost the most.
        </p>
      </TooltipContent>
    </HintTooltip>
  );
}
