import type { TimeParseScore } from "@/api/typesGenerated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { parseColor, parseHexColor } from "./parseColors";
import { parseScopeRows, type ScopedParses } from "./Overview/encounterKillTimePopulation";

function ParseScopeRow({ label, parse, unit }: { label: string; parse: TimeParseScore; unit: string }) {
  const color = parseHexColor(parse.display_score);
  const lowConfidence = parse.status === "low_confidence";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium">{label}</span>
        {lowConfidence && (
          <span className="rounded-sm bg-amber-400/10 px-1 text-[10px] font-medium text-amber-400">
            small sample
          </span>
        )}
        <span className={cn("ml-auto font-mono text-base font-bold leading-none tabular-nums", parseColor(parse.display_score))}>
          {parse.display_score}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(parse.display_score, 2)}%`, backgroundColor: color, opacity: lowConfidence ? 0.5 : 1 }}
        />
      </div>
      <div className="text-[10px] tabular-nums text-muted-foreground">
        Rank {parse.rank} of {parse.sample_size} {unit}
      </div>
    </div>
  );
}

/**
 * Wraps a trigger with a per-scope time parse tooltip. Renders the trigger
 * unchanged when no scope has a score.
 */
export function ParseScopesTooltip({
  title,
  unit,
  parses,
  lookbackDays,
  side = "right",
  footer,
  children,
}: {
  title: string;
  unit: string;
  parses: ScopedParses | null | undefined;
  lookbackDays: number | undefined;
  side?: "right" | "bottom";
  footer?: React.ReactNode;
  children: React.ReactElement;
}) {
  const rows = parses ? parseScopeRows(parses) : [];
  if (rows.length === 0) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        sideOffset={8}
        hideArrow
        className="w-56 rounded-lg border border-white/10 bg-popover p-0 text-foreground shadow-lg"
      >
        <div className="flex items-baseline justify-between border-b border-white/10 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
          {lookbackDays ? <span className="text-[10px] text-muted-foreground">Last {lookbackDays} days</span> : null}
        </div>
        <div className="space-y-3 px-3 py-2.5">
          {rows.map((row) => <ParseScopeRow key={row.label} unit={unit} {...row} />)}
        </div>
        {footer && (
          <div className="border-t border-white/10 px-3 py-2 text-[10px] text-muted-foreground">{footer}</div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Kill-time parse tooltip for an encounter row. */
export function KillParseTooltip({
  parses,
  lookbackDays,
  children,
}: {
  parses: ScopedParses | undefined;
  lookbackDays: number | undefined;
  children: React.ReactElement;
}) {
  return (
    <ParseScopesTooltip title="Kill time parse" unit="kills" parses={parses} lookbackDays={lookbackDays}>
      {children}
    </ParseScopesTooltip>
  );
}
