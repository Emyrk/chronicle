import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { COMPLEXITY_STYLE, LEVEL_LIMITS, complexity, type QueryCost } from "./searchCost";
import type { SearchBudget } from "./searchApi";

/**
 * The search's cost, live as it's edited: a four-step complexity meter and
 * label (Light → Too complex) with the cost, then the budget: what's left,
 * how long until enough refills when it costs more than that, or that it can
 * never run when it costs more than the whole budget. Hover for where the
 * cost comes from.
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
  const c = complexity(cost.total, budget?.limit ?? null);
  const style = COMPLEXITY_STYLE[c.level];
  const remaining = budget ? Math.floor(budget.remaining) : null;
  const short = c.level !== "too_complex" && remaining != null && cost.total > remaining;
  const waitSeconds = short && refillPerMinute ? Math.ceil((cost.total - (budget?.remaining ?? 0)) / (refillPerMinute / 60)) : null;

  return (
    <HintTooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-live="polite" className="inline-flex cursor-help flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
          <span className={cn("inline-flex items-center gap-2 rounded-md px-2 py-1 ring-1", style.pill)}>
            <span className="flex items-end gap-0.5" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className={cn("w-1.5 rounded-sm", i < c.steps ? style.bar : "bg-white/15")} style={{ height: 6 + i * 3 }} />
              ))}
            </span>
            <span className={cn("font-semibold", style.text)}>{c.label}</span>
            <span className="text-foreground/90">Cost {cost.total}</span>
          </span>
          {c.level === "too_complex" ? (
            <span className="text-red-300">More than your whole budget of {budget?.limit}. Remove some conditions.</span>
          ) : short ? (
            <span className="text-amber-200">
              You have {remaining}
              {waitSeconds ? ` · enough in ~${waitSeconds}s` : ""}
            </span>
          ) : (
            remaining != null && <span className="text-muted-foreground">{remaining} left</span>
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
          Light under {LEVEL_LIMITS.light}, Moderate under {LEVEL_LIMITS.moderate}, Heavy under {LEVEL_LIMITS.heavy}, then Very heavy. Searches spend from a budget that refills over time;
          parses across players and boss / trash / idle time cost the most.
        </p>
      </TooltipContent>
    </HintTooltip>
  );
}
