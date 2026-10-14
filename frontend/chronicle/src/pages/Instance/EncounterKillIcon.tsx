import type { BossKillTimeParse } from "@/api/typesGenerated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { parseColor } from "./parseColors";

/**
 * Green kill check whose surrounding circle is colored by the server
 * kill-time parse, with a parse tooltip on hover. Mirrors lucide's
 * CheckCircle (circle-check-big) paths so it lines up with the other
 * sidebar status icons. Renders a plain green check when no snapshot is
 * available.
 */
export function EncounterKillIcon({
  parses,
  encounterId,
  lookbackDays,
}: {
  parses: ReadonlyMap<string, BossKillTimeParse> | null;
  encounterId: string;
  lookbackDays: number | undefined;
}) {
  const parse = parses?.get(encounterId);
  const scored = parse !== undefined && parse.status !== "sample_too_small";

  const icon = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4 shrink-0 text-green-500", parses && "cursor-help")}
      aria-label={scored ? `Kill time parse ${parse.display_score}` : "Kill"}
    >
      <path d="M21.801 10A10 10 0 1 1 17 3.335" className={scored ? parseColor(parse.display_score) : undefined} />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );

  if (!parses) return icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{icon}</TooltipTrigger>
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
