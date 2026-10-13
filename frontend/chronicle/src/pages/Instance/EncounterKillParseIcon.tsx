import { CheckCircle } from "lucide-react";
import type { BossKillTimeParse } from "@/api/typesGenerated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { parseColor } from "./parseColors";

function formatKillTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Clean boss kill checkmark colored by the server kill-time parse. Falls back
 * to the plain green check when no snapshot is available, and renders a muted
 * check when the snapshot exists but this kill could not be scored.
 */
export function EncounterKillParseIcon({
  parses,
  encounterId,
  lookbackDays,
}: {
  parses: ReadonlyMap<string, BossKillTimeParse> | null;
  encounterId: string;
  lookbackDays: number | undefined;
}) {
  if (!parses) {
    return <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />;
  }

  const parse = parses.get(encounterId);
  const scored = parse !== undefined && parse.status !== "sample_too_small";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0" aria-label={scored ? `Kill time parse ${parse.display_score}` : "Kill time not scored"}>
          <CheckCircle
            className={cn("h-4 w-4", scored ? parseColor(parse.display_score) : "text-muted-foreground/40")}
          />
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
              {formatKillTime(parse.duration_ms)} kill, #{parse.rank} of {parse.sample_size}
              {lookbackDays ? ` over the last ${lookbackDays} days` : ""}.
            </p>
            {parse.status === "low_confidence" && (
              <p className="text-[11px] text-amber-400">Low confidence: small sample.</p>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-semibold">Clean kill</p>
            <p className="text-[11px] text-muted-foreground">
              {parse
                ? `Not enough comparable kills to score (${parse.sample_size}).`
                : "No kill time parse for this kill."}
            </p>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
