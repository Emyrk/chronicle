import type { BossKillTimeParse } from "@/api/typesGenerated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { parseColor, parseHexColor } from "./parseColors";
import { scoredKillParse, type ScopedKillParses } from "./Overview/encounterKillTimePopulation";

/**
 * Builds the tooltip rows. Realm is a subset of server, so a matching sample
 * size means both are the same population and only "Server" is shown.
 */
function killParseRows(parses: ScopedKillParses): { label: string; parse: BossKillTimeParse }[] {
  const server = scoredKillParse(parses.server);
  const realm = scoredKillParse(parses.realm);
  const guild = scoredKillParse(parses.guild);
  const rows: { label: string; parse: BossKillTimeParse }[] = [];
  if (server) rows.push({ label: "Server", parse: server });
  if (realm && realm.sample_size !== server?.sample_size) rows.push({ label: "Realm", parse: realm });
  if (guild) rows.push({ label: "Guild", parse: guild });
  return rows;
}

function KillParseRow({ label, parse }: { label: string; parse: BossKillTimeParse }) {
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
        Rank {parse.rank} of {parse.sample_size} kills
      </div>
    </div>
  );
}

/**
 * Wraps an encounter row with a kill-time parse tooltip. Renders the row
 * unchanged when the kill has no score in any scope.
 */
export function KillParseTooltip({
  parses,
  lookbackDays,
  children,
}: {
  parses: ScopedKillParses | undefined;
  lookbackDays: number | undefined;
  children: React.ReactElement;
}) {
  const rows = parses ? killParseRows(parses) : [];
  if (rows.length === 0) return children;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="right"
        sideOffset={8}
        hideArrow
        className="w-56 rounded-lg border border-white/10 bg-popover p-0 text-foreground shadow-lg"
      >
        <div className="flex items-baseline justify-between border-b border-white/10 px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Kill time parse</span>
          {lookbackDays ? <span className="text-[10px] text-muted-foreground">Last {lookbackDays} days</span> : null}
        </div>
        <div className="space-y-3 px-3 py-2.5">
          {rows.map((row) => <KillParseRow key={row.label} {...row} />)}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
