import { ChartLine } from "lucide-react";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { formatClearTime, mergeBossOrder, type BossSplit, type BossSplitSummary, type BoxStats } from "./guildHistoryModel";

export interface BossSpreadGuild {
  id: string;
  name: string;
  color: string;
  summary: BossSplitSummary;
}

interface BossFocusProps {
  /** The boss charted above; empty when the chart shows whole clears. */
  focusedBoss: string;
  onFocusBoss: (boss: string) => void;
}

/**
 * Kill-time spread for every boss on one axis from zero, so both fight length and how much it
 * varies read at a glance. One guild shows every kill; several guilds get a lane each.
 */
export function BossSpread({ guilds, focusedBoss, onFocusBoss }: { guilds: readonly BossSpreadGuild[] } & BossFocusProps) {
  const bossNames = mergeBossOrder(guilds.map((guild) => guild.summary));
  const lookup = guilds.map((guild) => new Map(guild.summary.bosses.map((boss) => [boss.name, boss])));
  // Scale to the usual ranges, not outliers: one disastrous kill would squeeze every other boss.
  const longest = Math.max(...guilds.flatMap((guild) => guild.summary.bosses.map((boss) => boss.highWhisker)));
  const domain = longest * 1.08;
  const step = domain > 6 * 60_000 ? 120_000 : domain > 3 * 60_000 ? 60_000 : 30_000;
  const ticks = Array.from({ length: Math.floor(domain / step) + 1 }, (_, index) => index * step);
  const offScale = guilds.some((guild) => guild.summary.bosses.some((boss) => boss.outliers.some((outlier) => outlier > domain)));
  const position = (value: number) => Math.min(value / domain, 1) * 100;
  const single = guilds.length === 1;
  const columns = single
    ? "grid-cols-[minmax(8rem,12rem)_4.25rem_minmax(16rem,1fr)_repeat(3,4.25rem)]"
    : "grid-cols-[minmax(8rem,12rem)_5rem_minmax(16rem,1fr)]";

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold">Boss by boss</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {single
            ? "Every kill as a dot, with the middle half of kills as a box and the median as a line. Wide boxes are fights that swing from night to night."
            : "Each guild's kills as a box: the middle half of kills, the median line, and whiskers for the usual range. Further left is faster; narrower is steadier."}
          {offScale && " ▸ marks an outlier kill past the right edge; hover for its time."}
          {" "}Click a boss to chart its kill times above.
        </p>
      </div>
      <div className="overflow-x-auto styled-scrollbar">
        <div className="min-w-[640px]">
          <div className={cn("grid items-end gap-x-3 border-b border-border/60 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground", columns)}>
            <span className="px-1">Boss</span>
            <span className="text-right">Typical</span>
            <div className="relative h-4">
              {ticks.map((tick, index) => (
                <span
                  key={tick}
                  className={cn("absolute bottom-0 font-mono normal-case tracking-normal tabular-nums", index > 0 && "-translate-x-1/2")}
                  style={{ left: `${position(tick)}%` }}
                >
                  {formatClearTime(tick)}
                </span>
              ))}
            </div>
            {single && (
              <>
                <span className="text-right">Best</span>
                <span className="text-right" title="Half the width of the middle half of kills">Spread</span>
                <span className="text-right" title="Median time from the start of the clear to this kill">Dies at</span>
              </>
            )}
          </div>
          {bossNames.map((name) => {
            const entries = guilds.flatMap((guild, index) => {
              const boss = lookup[index].get(name);
              return boss ? [{ guild, boss }] : [];
            });
            const fastest = Math.min(...entries.map(({ boss }) => boss.median));
            return (
              <div
                key={name}
                className={cn(
                  "grid items-center gap-x-3 border-b border-border/40 py-1.5 last:border-0",
                  columns,
                  focusedBoss === name && "bg-sky-500/10",
                )}
              >
                <div className="px-1">
                  <BossButton name={name} focusedBoss={focusedBoss} onFocusBoss={onFocusBoss} />
                </div>
                {single ? (
                  <span className="text-right font-mono text-sm font-semibold tabular-nums">
                    {entries[0] ? formatClearTime(entries[0].boss.median) : "—"}
                  </span>
                ) : (
                  <div className="space-y-0.5">
                    {guilds.map((guild, index) => {
                      const boss = lookup[index].get(name);
                      return (
                        <div key={guild.id} className="flex h-4 items-center justify-end gap-1.5 font-mono text-xs tabular-nums">
                          <span className="size-1.5 rounded-full" style={{ backgroundColor: guild.color }} />
                          <span
                            className={cn(
                              boss && boss.median === fastest && entries.length > 1
                                && "font-semibold underline decoration-sky-400 decoration-2 underline-offset-2",
                              !boss && "text-muted-foreground",
                            )}
                          >
                            {boss ? formatClearTime(boss.median) : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="space-y-0.5">
                  {guilds.map((guild, index) => {
                    const boss = lookup[index].get(name);
                    return (
                      <SpreadLane
                        key={guild.id}
                        label={boss ? `${guild.name} · ${name} · ${boss.kills} kills` : guild.name}
                        color={guild.color}
                        stats={boss && { ...boss, values: boss.durations }}
                        ticks={ticks}
                        position={position}
                        showValues={single}
                        maxValue={domain}
                      />
                    );
                  })}
                </div>
                {single && <SingleStats boss={entries[0]?.boss} />}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export interface LaneStats extends BoxStats {
  /** Every value, ascending; drawn as dots when asked. */
  values: readonly number[];
}

/** One horizontal box plot on a shared axis: box, median, whiskers, outliers and optionally every value. */
export function SpreadLane({
  label,
  color,
  stats,
  ticks,
  position,
  showValues,
  maxValue,
}: {
  /** Tooltip heading, such as "LaNuit · Ragnaros · 15 kills". */
  label: string;
  color: string;
  stats: LaneStats | undefined;
  ticks: readonly number[];
  position: (value: number) => number;
  showValues: boolean;
  /** The right edge of the axis; longer values are pinned there. */
  maxValue: number;
}) {
  const lane = (
    <div className={cn("relative rounded-sm", showValues ? "h-8" : "h-4", stats && "cursor-help hover:bg-white/5")}>
      {ticks.map((tick) => (
        <span key={tick} className="absolute inset-y-0 w-px bg-white/5" style={{ left: `${position(tick)}%` }} />
      ))}
      {stats && (
        <>
          {/* A faint bar to the median keeps the length readable under the spread. */}
          <span
            className="absolute inset-y-1 left-0 rounded-l-sm"
            style={{ width: `${position(stats.median)}%`, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
          />
          <span
            className="absolute top-1/2 h-px -translate-y-1/2"
            style={{ left: `${position(stats.lowWhisker)}%`, width: `${position(stats.highWhisker) - position(stats.lowWhisker)}%`, backgroundColor: color }}
          />
          <span className="absolute top-1/4 bottom-1/4 w-px" style={{ left: `${position(stats.lowWhisker)}%`, backgroundColor: color }} />
          <span className="absolute top-1/4 bottom-1/4 w-px" style={{ left: `${position(stats.highWhisker)}%`, backgroundColor: color }} />
          <span
            className="absolute inset-y-0.5 rounded-sm border"
            style={{
              left: `${position(stats.lowerQuartile)}%`,
              width: `max(${position(stats.upperQuartile) - position(stats.lowerQuartile)}%, 2px)`,
              borderColor: color,
              backgroundColor: `color-mix(in srgb, ${color} 25%, transparent)`,
            }}
          />
          {showValues && stats.values.filter((value) => value <= maxValue).map((value, index) => (
            <span
              key={index}
              className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              // Spread values over three rows so close ones don't hide each other.
              style={{ left: `${position(value)}%`, top: `${30 + (index % 3) * 20}%`, backgroundColor: color, opacity: 0.75 }}
            />
          ))}
          <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${position(stats.median)}%` }} />
          {stats.outliers.map((outlier, index) => (
            outlier > maxValue ? (
              // Off the scale: pinned to the right edge; the tooltip has the time.
              <span
                key={`${outlier}-${index}`}
                className="absolute top-1/2 right-0 -translate-y-1/2 text-[10px] leading-none"
                style={{ color }}
              >
                ▸
              </span>
            ) : (
              <span
                key={`${outlier}-${index}`}
                className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background"
                style={{ left: `${position(outlier)}%`, borderColor: color }}
              />
            )
          ))}
        </>
      )}
    </div>
  );
  if (!stats) return lane;

  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <div tabIndex={0} aria-label={`${label}: typical ${formatClearTime(stats.median)}, best ${formatClearTime(stats.values[0])}`}>
          {lane}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-left">
        <div className="mb-1 font-semibold">{label}</div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 font-mono tabular-nums">
          <dt className="font-sans text-zinc-400">Best</dt><dd className="text-right">{formatClearTime(stats.values[0])}</dd>
          <dt className="font-sans text-zinc-400">Middle half</dt><dd className="text-right">{formatClearTime(stats.lowerQuartile)}–{formatClearTime(stats.upperQuartile)}</dd>
          <dt className="font-sans text-zinc-400">Typical (median)</dt><dd className="text-right">{formatClearTime(stats.median)}</dd>
          <dt className="font-sans text-zinc-400">Usual range</dt><dd className="text-right">{formatClearTime(stats.lowWhisker)}–{formatClearTime(stats.highWhisker)}</dd>
          <dt className="font-sans text-zinc-400">Outliers</dt><dd className="text-right">{stats.outliers.length === 0 ? "none" : stats.outliers.map(formatClearTime).join(", ")}</dd>
        </dl>
      </TooltipContent>
    </HintTooltip>
  );
}

function SingleStats({ boss }: { boss: BossSplit | undefined }) {
  if (!boss) return null;
  return (
    <>
      <span className="text-right font-mono text-sm tabular-nums">{formatClearTime(boss.bestMs)}</span>
      <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">
        ±{formatClearTime((boss.upperQuartile - boss.lowerQuartile) / 2)}
      </span>
      <span className="text-right font-mono text-sm tabular-nums text-muted-foreground">+{formatClearTime(boss.typicalSplitMs)}</span>
    </>
  );
}

function BossButton({ name, focusedBoss, onFocusBoss }: { name: string } & BossFocusProps) {
  const focused = focusedBoss === name;
  return (
    <button
      type="button"
      aria-pressed={focused}
      onClick={() => onFocusBoss(focused ? "" : name)}
      className={cn("group inline-flex items-center gap-1.5 text-left text-sm font-medium hover:text-sky-300", focused && "text-sky-300")}
      title={focused ? "Back to whole clears" : `Chart ${name} kill times`}
    >
      {name}
      <ChartLine className={cn("h-3.5 w-3.5 shrink-0 transition-opacity", focused ? "opacity-100" : "opacity-0 group-hover:opacity-60")} />
    </button>
  );
}
