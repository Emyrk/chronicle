import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { performanceParseColor } from "@/pages/ArmoryPage/overview/performanceExplorerModel";
import type { SummaryView } from "@/pages/ArmoryPage/overview/PerformanceSummary";
import {
  clearConsistencyLabel,
  formatGuildValue,
  GUILD_RECENT_RUN_COUNT,
  type ClearSummary,
} from "./guildHistoryModel";

export interface GuildSummaryRow {
  id: string;
  name: string;
  color: string;
  summary: ClearSummary | null;
}

// Guilds with fewer clears are shown but never marked as a column leader.
const MIN_COMPARABLE_RUNS = 3;

type StatKey = "best" | "typical" | "recent" | "worst" | "consistency" | "trend";

const CLEARS_HELP = `Full clears matching the current filters, or kills of the focused boss in them. Guilds with fewer than ${MIN_COMPARABLE_RUNS} clears are shown but never highlighted.`;

/** Column labels and help, worded for times (lower is better) or parses (higher is better). */
function statColumns(parse: boolean): readonly { key: StatKey; label: string; help: string }[] {
  if (parse) {
    return [
      {
        key: "best",
        label: "Best",
        help: "The single highest time parse: how this clear ranked against the server's clears of the same raid in the 60 days before it. One great night can set it.",
      },
      {
        key: "typical",
        label: "Typical",
        help: "The median parse: half of the clears ranked higher and half lower. One unusual night barely moves it.",
      },
      {
        key: "recent",
        label: "Recent",
        help: `The median parse of the latest ${GUILD_RECENT_RUN_COUNT} clears. The marker compares it with Typical: ▲ higher, ▼ lower, ≈ about the same.`,
      },
      {
        key: "worst",
        label: "Floor",
        help: "The 10th percentile: about 1 clear in 10 parsed lower. It shows how low an off night goes without letting the single worst night decide.",
      },
      {
        key: "consistency",
        label: "Consistency",
        help: "How tightly parses cluster: the middle half sit within ± this many points of their midpoint. A guild that is improving naturally reads as less consistent. Check Trend to tell improvement from swings.",
      },
      {
        key: "trend",
        label: "Trend",
        help: "How many parse points clears are gaining (+) or losing (−) per week, from a line fitted through every clear.",
      },
    ];
  }
  return [
    {
      key: "best",
      label: "Best",
      help: "The single fastest clear. One lucky night can set it, so it is the least reliable number here.",
    },
    {
      key: "typical",
      label: "Typical",
      help: "The median clear: half of the clears were faster and half slower. One unusually fast or slow night barely moves it.",
    },
    {
      key: "recent",
      label: "Recent",
      help: `The median of the latest ${GUILD_RECENT_RUN_COUNT} clears. The marker compares it with Typical: ▲ faster, ▼ slower, ≈ about the same.`,
    },
    {
      key: "worst",
      label: "Slowest",
      help: "The 90th percentile: about 1 clear in 10 was slower. It shows how long an off night runs without letting the single worst night decide.",
    },
    {
      key: "consistency",
      label: "Consistency",
      help: "How tightly clears cluster: the middle half of clears sit within ± this of their midpoint. High means the guild clears in about the same time every week. A guild that is getting faster, or that runs several groups of different speed, naturally reads as less consistent. Check Trend to tell improvement from swings.",
    },
    {
      key: "trend",
      label: "Trend",
      help: "How much faster (−) or slower (+) clears are getting per week, from a line fitted through every clear. A few odd nights barely move it.",
    },
  ];
}

/** Headline clear-time stats: a strip for one guild, a comparison table for several. */
export function GuildClearSummary({
  rows,
  view,
  countLabel = "Clears",
}: {
  rows: readonly GuildSummaryRow[];
  view: SummaryView;
  countLabel?: string;
}) {
  if (rows.every((row) => row.summary === null)) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-black/10">
      {view === "boxplot" ? (
        <SummaryBoxPlot rows={rows} countLabel={countLabel} />
      ) : rows.length === 1 ? (
        <SummaryStrip summary={rows[0].summary!} countLabel={countLabel} />
      ) : (
        <SummaryTable rows={rows} countLabel={countLabel} />
      )}
    </div>
  );
}

function StatLabel({ label, help, className }: { label: string; help: string; className?: string }) {
  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={cn("inline-flex cursor-help items-center gap-1", className)}>
          {label}
          <CircleHelp className="size-3 opacity-50" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-left leading-relaxed">
        <div className="font-semibold">{label}</div>
        <div className="mt-0.5 text-zinc-300">{help}</div>
      </TooltipContent>
    </HintTooltip>
  );
}

function SummaryStrip({ summary, countLabel }: { summary: ClearSummary; countLabel: string }) {
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4 xl:grid-cols-7">
      <div className="min-w-0">
        <StatLabel label={countLabel} help={CLEARS_HELP} className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground" />
        <div className="mt-0.5 font-mono text-lg font-semibold tabular-nums">{summary.runCount}</div>
      </div>
      {statColumns(summary.parse).map((column) => (
        <div key={column.key} className="min-w-0">
          <StatLabel label={column.label} help={column.help} className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground" />
          <div className="mt-0.5 flex flex-wrap items-baseline font-mono text-lg font-semibold tabular-nums [&_[data-slot=marker]]:w-auto">
            <StatValue summary={summary} statKey={column.key} />
          </div>
        </div>
      ))}
    </div>
  );
}

function SummaryTable({ rows, countLabel }: { rows: readonly GuildSummaryRow[]; countLabel: string }) {
  const parse = rows.some(({ summary }) => summary?.parse);
  const columns = statColumns(parse);
  const leaders = Object.fromEntries(columns.map(({ key }) => {
    const values = rows.flatMap(({ summary }) => {
      if (!summary || summary.runCount < MIN_COMPARABLE_RUNS) return [];
      const value = comparableValue(summary, key);
      return value === null ? [] : [value];
    });
    if (values.length < 2) return [key, undefined];
    // Steadier is always better; otherwise lower times and higher parses win.
    return [key, key === "consistency" || !parse ? Math.min(...values) : Math.max(...values)];
  })) as Record<StatKey, number | undefined>;

  return (
    <div className="overflow-x-auto styled-scrollbar">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-3 py-2 text-left font-medium">Guild</th>
            <th className="px-3 py-2 text-right font-medium"><StatLabel label={countLabel} help={CLEARS_HELP} /></th>
            {columns.map((column) => (
              <th key={column.key} className="px-3 py-2 text-right font-medium">
                <StatLabel label={column.label} help={column.help} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, name, color, summary }) => {
            const lowSample = !summary || summary.runCount < MIN_COMPARABLE_RUNS;
            return (
              <tr key={id} className="border-b border-border/40 last:border-0">
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <span className="inline-flex min-w-0 items-center gap-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                    <span className="truncate font-medium">{name}</span>
                  </span>
                </td>
                <td className={cn("px-3 py-1.5 text-right font-mono tabular-nums", lowSample && "text-muted-foreground")}>
                  {summary?.runCount ?? 0}
                </td>
                {columns.map(({ key }) => (
                  <td key={key} className="px-3 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {summary ? (
                      <span
                        className={cn(
                          !lowSample
                            && leaders[key] !== undefined
                            && comparableValue(summary, key) === leaders[key]
                            && "font-semibold underline decoration-sky-400 decoration-2 underline-offset-4",
                        )}
                      >
                        <StatValue summary={summary} statKey={key} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The value a column ranks on; time consistency compares spread relative to each guild's own typical clear. */
function comparableValue(summary: ClearSummary, key: StatKey): number | null {
  if (key === "consistency") {
    if (summary.consistency === null) return null;
    return summary.parse ? summary.consistency : summary.consistency / summary.typical;
  }
  if (key === "trend") return summary.trend === null ? null : summary.trend.slope;
  return summary[key];
}

function StatValue({ summary, statKey }: { summary: ClearSummary; statKey: StatKey }) {
  const { parse } = summary;
  const format = (value: number) => formatGuildValue(value, parse);
  if (statKey === "trend") {
    if (summary.trend === null) return <Missing needs="at least 3" />;
    const perWeek = summary.trend.slope * 7;
    // A second a week of clear time, or half a parse point, is noise.
    const threshold = parse ? 0.5 : 1000;
    const improving = parse ? perWeek > threshold : perWeek < -threshold;
    const worsening = parse ? perWeek < -threshold : perWeek > threshold;
    return (
      <span className={cn(improving ? "text-emerald-400" : worsening ? "text-rose-400" : undefined)}>
        {perWeek < 0 ? "−" : "+"}{format(Math.abs(perWeek))}
        <span className="ml-0.5 text-xs font-normal text-muted-foreground">/wk</span>
      </span>
    );
  }
  if (statKey === "consistency") {
    if (summary.consistency === null) return <Missing needs="at least 3" />;
    return (
      <>
        {/* Inline-block keeps the label width fixed; inheriting text-decoration keeps the leader underline on it. */}
        <span className="inline-block w-9 text-left font-sans text-sm font-medium [text-decoration:inherit]">
          {clearConsistencyLabel(summary.consistency, summary.typical, parse)}
        </span>
        <MarkerSlot className="w-12 text-muted-foreground">±{format(summary.consistency / 2)}</MarkerSlot>
      </>
    );
  }

  const value = summary[statKey];
  if (value === null) {
    return (
      <>
        <Missing needs={`more than ${GUILD_RECENT_RUN_COUNT}`} />
        <MarkerSlot className="w-14" />
      </>
    );
  }
  const delta = statKey === "recent" ? value - summary.typical : 0;
  const better = parse ? delta > 0 : delta < 0;
  const bestIsOutlier = parse ? summary.best > summary.highWhisker : summary.best < summary.lowWhisker;
  return (
    <>
      <span style={{ color: parse ? performanceParseColor(value) : undefined }}>{format(value)}</span>
      {statKey === "best" && (
        <MarkerSlot className="w-2">{bestIsOutlier && <OutlierMark parse={parse} />}</MarkerSlot>
      )}
      {statKey === "recent" && (
        Math.abs(delta) >= (parse ? 0.5 : summary.typical * 0.01) ? (
          <MarkerSlot className={cn("w-14", better ? "text-emerald-400" : "text-rose-400")}>
            {better ? "▲" : "▼"} {format(Math.abs(delta))}
          </MarkerSlot>
        ) : (
          <MarkerSlot className="w-14 text-muted-foreground"><span title="About the same as Typical">≈</span></MarkerSlot>
        )
      )}
    </>
  );
}

function Missing({ needs }: { needs: string }) {
  return <span className="text-muted-foreground" title={`Needs ${needs} clears`}>—</span>;
}

/** Fixed-width space after a number, present even when empty, so markers never shift a column. */
function MarkerSlot({ className, children }: { className: string; children?: ReactNode }) {
  return <span data-slot="marker" className={cn("ml-1 inline-block text-left text-xs font-normal", className)}>{children}</span>;
}

function OutlierMark({ parse }: { parse: boolean }) {
  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <sup tabIndex={0} aria-label="Outlier" className="ml-0.5 cursor-help text-xs font-semibold text-amber-300">*</sup>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-left leading-relaxed">
        {parse
          ? "Outlier: this parse is far above the guild's usual range. Typical is a better guide."
          : "Outlier: this clear is far faster than the guild's usual range, often a short split log. Typical is a better guide."}
      </TooltipContent>
    </HintTooltip>
  );
}

/** Spread of clear times (faster to the left) or parses (higher to the right) per guild on one shared axis. */
function SummaryBoxPlot({ rows, countLabel }: { rows: readonly GuildSummaryRow[]; countLabel: string }) {
  const summaries = rows.flatMap((row) => row.summary ? [row.summary] : []);
  const parse = summaries.some((summary) => summary.parse);
  const low = Math.min(...summaries.flatMap((summary) => [summary.lowWhisker, ...summary.outliers]));
  const high = Math.max(...summaries.flatMap((summary) => [summary.highWhisker, ...summary.outliers]));
  const padding = Math.max((high - low) * 0.05, parse ? 1 : 1000);
  const domainLow = Math.max(0, low - padding);
  const domainHigh = parse ? Math.min(100, high + padding) : high + padding;
  const position = (value: number) => ((value - domainLow) / (domainHigh - domainLow)) * 100;
  // Round ticks to whole minutes so the axis reads 1:00:00, 1:15:00 rather than odd seconds.
  const steps = parse
    ? [1, 2, 5, 10, 20, 25]
    : [15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000];
  const step = steps.find((candidate) => (domainHigh - domainLow) / candidate <= 5) ?? steps[steps.length - 1];
  const ticks = Array.from(
    { length: Math.floor(domainHigh / step) - Math.ceil(domainLow / step) + 1 },
    (_, index) => (Math.ceil(domainLow / step) + index) * step,
  );
  const unit = countLabel.toLowerCase();

  return (
    <div className="space-y-1 px-3 py-3">
      {rows.map(({ id, name, color, summary }) => (
        <div key={id} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <span className="inline-flex min-w-0 items-center gap-2 text-sm">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
            <span className="truncate font-medium">{name}</span>
          </span>
          {summary ? (
            <BoxPlotRow name={name} color={color} summary={summary} unit={unit} position={position} />
          ) : (
            <span className="text-xs text-muted-foreground">No {unit} match these filters.</span>
          )}
        </div>
      ))}
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <span className="text-right text-[10px] text-muted-foreground">{parse ? "better →" : "faster ←"}</span>
        <div className="relative h-4 border-t border-border/60">
          {ticks.map((tick) => (
            <span
              key={tick}
              className={cn(
                "absolute top-0.5 font-mono text-[10px] text-muted-foreground tabular-nums",
                position(tick) < 4 ? "" : position(tick) > 96 ? "-translate-x-full" : "-translate-x-1/2",
              )}
              style={{ left: `${position(tick)}%` }}
            >
              {formatGuildValue(tick, parse)}
            </span>
          ))}
        </div>
      </div>
      <p className="pt-1 text-[11px] leading-relaxed text-muted-foreground/80">
        Box: the middle half of {unit}. Line in the box: Typical (median). Whiskers: the usual range.
        Hollow dots: outliers, far outside the usual range. Hover a row for its numbers.
      </p>
    </div>
  );
}

function BoxPlotRow({
  name,
  color,
  summary,
  unit,
  position,
}: {
  name: string;
  color: string;
  summary: ClearSummary;
  unit: string;
  position: (value: number) => number;
}) {
  const lowSample = summary.runCount < MIN_COMPARABLE_RUNS;
  const boxLeft = position(summary.lowerQuartile);
  const boxWidth = position(summary.upperQuartile) - boxLeft;
  const whiskerLeft = position(summary.lowWhisker);
  const whiskerRight = position(summary.highWhisker);

  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <div
          tabIndex={0}
          className={cn("relative h-7 cursor-help rounded hover:bg-white/5", lowSample && "opacity-50")}
          aria-label={`${name}: typical ${formatGuildValue(summary.typical, summary.parse)}, middle half ${formatGuildValue(summary.lowerQuartile, summary.parse)} to ${formatGuildValue(summary.upperQuartile, summary.parse)}`}
        >
          <span
            className="absolute top-1/2 h-px -translate-y-1/2"
            style={{ left: `${whiskerLeft}%`, width: `${whiskerRight - whiskerLeft}%`, backgroundColor: color }}
          />
          <span className="absolute top-2 bottom-2 w-px" style={{ left: `${whiskerLeft}%`, backgroundColor: color }} />
          <span className="absolute top-2 bottom-2 w-px" style={{ left: `${whiskerRight}%`, backgroundColor: color }} />
          <span
            className="absolute top-1 bottom-1 rounded-sm border"
            style={{
              left: `${boxLeft}%`,
              width: `max(${boxWidth}%, 2px)`,
              borderColor: color,
              backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
            }}
          />
          <span className="absolute top-0.5 bottom-0.5 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${position(summary.typical)}%` }} />
          {summary.outliers.map((outlier, index) => (
            <span
              key={`${outlier}-${index}`}
              className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
              style={{ left: `${position(outlier)}%`, borderColor: color }}
            />
          ))}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-left">
        <div className="mb-1 font-semibold">{name} · {summary.runCount} {unit}</div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 font-mono tabular-nums">
          <dt className="font-sans text-zinc-400">Best</dt><dd className="text-right">{formatGuildValue(summary.best, summary.parse)}</dd>
          <dt className="font-sans text-zinc-400">Left of box (25th pct)</dt><dd className="text-right">{formatGuildValue(summary.lowerQuartile, summary.parse)}</dd>
          <dt className="font-sans text-zinc-400">Typical (median)</dt><dd className="text-right">{formatGuildValue(summary.typical, summary.parse)}</dd>
          <dt className="font-sans text-zinc-400">Right of box (75th pct)</dt><dd className="text-right">{formatGuildValue(summary.upperQuartile, summary.parse)}</dd>
          <dt className="font-sans text-zinc-400">Usual range</dt><dd className="text-right">{formatGuildValue(summary.lowWhisker, summary.parse)}–{formatGuildValue(summary.highWhisker, summary.parse)}</dd>
          <dt className="font-sans text-zinc-400">Outliers</dt><dd className="text-right">{summary.outliers.length === 0 ? "none" : summary.outliers.map((value) => formatGuildValue(value, summary.parse)).join(", ")}</dd>
        </dl>
        {lowSample && <div className="mt-1 text-amber-300">Fewer than {MIN_COMPARABLE_RUNS} {unit}, so treat this with caution.</div>}
      </TooltipContent>
    </HintTooltip>
  );
}
