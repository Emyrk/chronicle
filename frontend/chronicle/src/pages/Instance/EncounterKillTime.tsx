import type { BossKillTimeParse } from "@/api/typesGenerated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { parseColor } from "./parseColors";

/**
 * Clean boss kill duration colored by the server kill-time parse, with a
 * parse tooltip on hover. Renders the plain muted duration when no snapshot
 * is available.
 */
export function EncounterKillTime({
  parses,
  encounterId,
  lookbackDays,
  isSelected,
  children,
}: {
  parses: ReadonlyMap<string, BossKillTimeParse> | null;
  encounterId: string;
  lookbackDays: number | undefined;
  isSelected: boolean;
  children: React.ReactNode;
}) {
  const baseClass = "text-xs shrink-0 font-mono";
  const mutedClass = isSelected ? "opacity-70" : "text-muted-foreground";

  if (!parses) {
    return <span className={cn(baseClass, mutedClass)}>{children}</span>;
  }

  const parse = parses.get(encounterId);
  const scored = parse !== undefined && parse.status !== "sample_too_small";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(baseClass, "cursor-help", scored ? cn("font-semibold", parseColor(parse.display_score)) : mutedClass)}
          aria-label={scored ? `Kill time parse ${parse.display_score}` : "Kill time not scored"}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={8}
        hideArrow
        className="w-56 rounded-lg border border-white/10 bg-popover p-3 text-foreground shadow-lg"
      >
        {scored ? (
          <div className="space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold">Kill time parse</span>
              <span className={cn("font-mono text-sm font-bold", parseColor(parse.display_score))}>
                {parse.display_score}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Rank #{parse.rank} of {parse.sample_size}
              {lookbackDays ? ` over the last ${lookbackDays} days` : ""}.
            </p>
            {parse.status === "low_confidence" && (
              <p className="text-[11px] text-amber-400">Low confidence: small sample.</p>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {parse
              ? `Not enough comparable kills to score (${parse.sample_size}).`
              : "No kill time parse for this kill."}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
