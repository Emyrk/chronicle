import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp } from "lucide-react";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import { BossSpread, SpreadLane, type LaneStats } from "./BossSpread";
import type { GuildSpeedrunRun } from "@/api/typesGenerated";
import {
  boxStats,
  clearTimeParts,
  formatClearTime,
  summarizeBossSplits,
  type BossSplitSummary,
  type ClearTimeParts,
} from "./guildHistoryModel";

export interface BossSplitGuild {
  id: string;
  name: string;
  color: string;
  runs: readonly GuildSpeedrunRun[];
}

interface BossFocusProps {
  /** The boss charted above; empty when the chart shows whole clears. */
  focusedBoss: string;
  onFocusBoss: (boss: string) => void;
}

const PART_HELP = {
  boss: "Boss fights, from pull to kill.",
  trash: "Fighting trash outside boss fights.",
  idle: "Everything else: walking, buffing, waiting on people and recovering from wipes.",
};

/** Where each guild's clear time goes, then boss by boss. Clicking a boss charts it on its own. */
export function BossSplits({ guilds, focusedBoss, onFocusBoss }: { guilds: readonly BossSplitGuild[] } & BossFocusProps) {
  const rows = guilds.flatMap((guild) => {
    const summary = summarizeBossSplits(guild.runs);
    return summary ? [{ guild, summary }] : [];
  });
  if (rows.length === 0) {
    return <div className="py-8 text-center text-sm text-muted-foreground">No boss kills recorded for these clears.</div>;
  }

  return (
    <div className="space-y-6">
      <TimeBreakdown rows={rows} />
      <ClearByClear guilds={rows.map(({ guild }) => guild)} />
      <BossSpread
        guilds={rows.map(({ guild, summary }) => ({ id: guild.id, name: guild.name, color: guild.color, summary }))}
        focusedBoss={focusedBoss}
        onFocusBoss={onFocusBoss}
      />
    </div>
  );
}

function TimeBreakdown({ rows }: { rows: readonly { guild: BossSplitGuild; summary: BossSplitSummary }[] }) {
  const parts = rows.map(({ summary }) => ({
    bossMs: summary.typicalBossMs,
    trashMs: summary.typicalTrashMs,
    idleMs: summary.typicalIdleMs,
  }));
  const longest = Math.max(...parts.map(partsTotal));

  return (
    <section className="space-y-2">
      <SectionHeading
        title="Where the time goes"
        description="A typical clear split into boss fights, trash fights and idle time. Each part is the guild's median, so the parts can differ slightly from its typical clear."
      />
      <PartsLegend />
      <div className="space-y-1.5">
        {rows.map(({ guild }, index) => (
          <div key={guild.id} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <GuildName guild={guild} />
            <PartsBar parts={parts[index]} longest={longest} color={guild.color} showLabels />
          </div>
        ))}
      </div>
    </section>
  );
}

type ClearSortKey = "date" | "clear" | "boss" | "trash" | "idle";

interface ClearSort {
  key: ClearSortKey;
  descending: boolean;
}

const CLEAR_SORTS: readonly { value: ClearSortKey; label: string; title: string }[] = [
  { value: "date", label: "Date", title: "When the clear finished" },
  { value: "clear", label: "Clear", title: "Full clear time" },
  { value: "boss", label: "Boss", title: "Time in boss fights" },
  { value: "trash", label: "Trash", title: "Time in trash fights" },
  { value: "idle", label: "Idle", title: "Time outside any fight" },
];

const PART_ROWS = [
  { key: "fullMs", label: "Full clear", help: "The whole clear, from first pull to last boss kill." },
  { key: "bossMs", label: "Boss", help: PART_HELP.boss },
  { key: "trashMs", label: "Trash", help: PART_HELP.trash },
  { key: "idleMs", label: "Idle", help: PART_HELP.idle },
] as const;

/** Every clear split into boss, trash and idle time: as one bar per clear, or as a box plot per part. */
function ClearByClear({ guilds }: { guilds: readonly BossSplitGuild[] }) {
  const [view, setView] = useState<"bars" | "boxplot">("bars");
  // Newest first by default; a time sort starts with the fastest.
  const [sort, setSort] = useState<ClearSort>({ key: "date", descending: true });

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SectionHeading
          title="Clear by clear"
          description={view === "bars"
            ? "One bar per clear, to see which part made a night fast or slow. A yellow * marks an incomplete or unqualified run."
            : "How much the full clear and each part swing from clear to clear. A wide box is something that is hard to keep steady."}
        />
        <div className="flex flex-wrap items-center gap-2">
          {view === "bars" && <SortButtons sort={sort} onChange={setSort} />}
          <SmallSegmented
            label="Clear by clear view"
            options={[{ value: "bars", label: "Bars" }, { value: "boxplot", label: "Box plot" }] as const}
            value={view}
            onChange={setView}
          />
        </div>
      </div>
      {view === "bars" && <PartsLegend />}
      {view === "bars" ? <ClearBars guilds={guilds} sort={sort} /> : <PartsBoxPlot guilds={guilds} />}
    </section>
  );
}

function ClearBars({ guilds, sort }: { guilds: readonly BossSplitGuild[]; sort: ClearSort }) {
  const typicalByGuild = new Map(guilds.map((guild) => [guild.id, summarizeBossSplits(guild.runs)]));
  const sortValue = (run: GuildSpeedrunRun, parts: ClearTimeParts) => {
    switch (sort.key) {
      case "clear": return run.duration_ms;
      case "boss": return parts.bossMs;
      case "trash": return parts.trashMs;
      case "idle": return parts.idleMs;
      default: return Date.parse(run.completion_time);
    }
  };
  const rows = guilds
    .flatMap((guild) => guild.runs.filter((run) => run.bosses.length > 0).map((run) => ({ guild, run, parts: clearTimeParts(run) })))
    .sort((a, b) => (sortValue(a.run, a.parts) - sortValue(b.run, b.parts)) * (sort.descending ? -1 : 1));
  const longest = Math.max(...rows.map(({ parts }) => partsTotal(parts)));
  const multiple = guilds.length > 1;

  return (
    <div className="max-h-96 space-y-px overflow-y-auto pr-1 styled-scrollbar">
      {rows.map(({ guild, run, parts }) => (
        <HintTooltip key={`${guild.id}-${run.slug}`}>
          <TooltipTrigger asChild>
            <Link
              to={`/instances/${run.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="grid grid-cols-[7rem_4.5rem_minmax(0,1fr)] items-center gap-3 rounded px-1 py-0.5 text-xs hover:bg-white/5 sm:grid-cols-[10rem_4.5rem_minmax(0,1fr)]"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                {multiple && <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: guild.color }} />}
                <span className="truncate">
                  {new Date(run.completion_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  {multiple && ` · ${guild.name}`}
                </span>
                {(!run.complete || !run.qualified) && (
                  <span
                    className="shrink-0 font-mono text-sm font-bold leading-none text-amber-300"
                    title={!run.complete ? "Incomplete run" : "Unqualified run"}
                    aria-label={!run.complete ? "Incomplete run" : "Unqualified run"}
                  >
                    *
                  </span>
                )}
              </span>
              <span className="text-right font-mono font-medium tabular-nums">{formatClearTime(run.duration_ms)}</span>
              <PartsBar parts={parts} longest={longest} color={guild.color} thin />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="top" className="min-w-64 text-left">
            <ClearTooltip guild={guild} run={run} parts={parts} typical={typicalByGuild.get(guild.id) ?? null} />
          </TooltipContent>
        </HintTooltip>
      ))}
    </div>
  );
}

function ClearTooltip({
  guild,
  run,
  parts,
  typical,
}: {
  guild: BossSplitGuild;
  run: GuildSpeedrunRun;
  parts: ClearTimeParts;
  typical: BossSplitSummary | null;
}) {
  const total = Math.max(run.duration_ms, 1);
  const rows = [
    { label: "Boss", value: parts.bossMs, typical: typical?.typicalBossMs, swatch: { backgroundColor: guild.color } },
    { label: "Trash", value: parts.trashMs, typical: typical?.typicalTrashMs, swatch: { backgroundColor: guild.color, opacity: 0.45 } },
    { label: "Idle", value: parts.idleMs, typical: typical?.typicalIdleMs, swatch: { backgroundColor: "rgb(255 255 255 / 0.25)" } },
  ];
  const start = new Date(run.start_time);

  return (
    <div className="space-y-2">
      <div>
        <div className="flex items-center gap-2 font-semibold">
          <span className="size-2 rounded-full" style={{ backgroundColor: guild.color }} />
          {guild.name}
        </div>
        <div className="text-zinc-400">
          {start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          {" · "}
          {start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          {" · "}
          {run.player_count} players
          {!run.complete ? " · incomplete" : !run.qualified && " · unqualified"}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-0.5 font-mono tabular-nums">
        <dt className="font-sans text-zinc-400">Full clear</dt>
        <dd className="text-right font-semibold">{formatClearTime(run.duration_ms)}</dd>
        <Delta value={run.duration_ms} typical={typical?.typicalClearMs} />
        {run.boss_to_boss_duration_ms > 0 && (
          <>
            <dt className="font-sans text-zinc-400">Boss to boss</dt>
            <dd className="text-right">{formatClearTime(run.boss_to_boss_duration_ms)}</dd>
            <span />
          </>
        )}
      </dl>
      <dl className="grid grid-cols-[auto_auto_1fr_auto] items-baseline gap-x-3 gap-y-0.5 border-t border-white/10 pt-2 font-mono tabular-nums">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="flex items-center gap-1.5 font-sans text-zinc-400">
              <span className="size-2 rounded-sm" style={row.swatch} />
              {row.label}
            </dt>
            <dd className="text-right">{formatClearTime(row.value)}</dd>
            <dd className="text-right text-zinc-400">{Math.round((row.value / total) * 100)}%</dd>
            <Delta value={row.value} typical={row.typical} />
          </Fragment>
        ))}
      </dl>
      <div className="border-t border-white/10 pt-1.5 text-[10px] text-zinc-400">
        {run.bosses.length} bosses · vs this guild's typical clear · click to open the log
      </div>
    </div>
  );
}

/** Difference from the typical value: green when faster, red when slower. */
function Delta({ value, typical }: { value: number; typical: number | undefined }) {
  if (typical === undefined) return <span />;
  const delta = value - typical;
  if (Math.abs(delta) < 1000) return <span className="text-right text-zinc-500">≈</span>;
  return (
    <span className={cn("text-right", delta < 0 ? "text-emerald-400" : "text-rose-400")}>
      {delta < 0 ? "−" : "+"}{formatClearTime(Math.abs(delta))}
    </span>
  );
}

function SortButtons({ sort, onChange }: { sort: ClearSort; onChange: (sort: ClearSort) => void }) {
  return (
    <div role="group" aria-label="Sort clears" className="flex gap-0.5 rounded-md border border-white/10 bg-black/20 p-0.5">
      {CLEAR_SORTS.map((option) => {
        const active = sort.key === option.value;
        const Arrow = sort.descending ? ArrowDown : ArrowUp;
        return (
          <button
            key={option.value}
            type="button"
            title={`${option.title}. Click again to reverse.`}
            aria-pressed={active}
            onClick={() => onChange(active
              ? { key: option.value, descending: !sort.descending }
              : { key: option.value, descending: option.value === "date" })}
            className={cn(
              "flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
              active ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {active && <Arrow className="h-3 w-3" aria-label={sort.descending ? "descending" : "ascending"} />}
          </button>
        );
      })}
    </div>
  );
}

/** The full clear, then one row per part, a lane per guild, on one axis from zero. */
function PartsBoxPlot({ guilds }: { guilds: readonly BossSplitGuild[] }) {
  const stats = guilds.map((guild) => {
    const parts = guild.runs.filter((run) => run.bosses.length > 0).map((run) => {
      const split = clearTimeParts(run);
      return { ...split, fullMs: partsTotal(split) };
    });
    return Object.fromEntries(PART_ROWS.map(({ key }) => {
      const values = parts.map((part) => part[key]).sort((a, b) => a - b);
      return [key, values.length > 0 ? { ...boxStats(values), values } : undefined];
    })) as Record<(typeof PART_ROWS)[number]["key"], LaneStats | undefined>;
  });
  const longest = Math.max(...stats.flatMap((byPart) => PART_ROWS.map(({ key }) => byPart[key]?.highWhisker ?? 0)));
  const domain = longest * 1.08;
  const step = [60_000, 300_000, 600_000, 900_000, 1_800_000].find((candidate) => domain / candidate <= 6) ?? 1_800_000;
  const ticks = Array.from({ length: Math.floor(domain / step) + 1 }, (_, index) => index * step);
  const position = (value: number) => Math.min(value / domain, 1) * 100;
  const single = guilds.length === 1;

  return (
    <div className="overflow-x-auto styled-scrollbar">
      <div className="min-w-[560px]">
        <div className="grid grid-cols-[5rem_5rem_minmax(16rem,1fr)] items-end gap-x-3 border-b border-border/60 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className="px-1">Part</span>
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
        </div>
        {PART_ROWS.map(({ key, label, help }) => {
          const medians = stats.flatMap((byPart) => byPart[key] ? [byPart[key].median] : []);
          const fastest = Math.min(...medians);
          return (
            <div key={key} className="grid grid-cols-[5rem_5rem_minmax(16rem,1fr)] items-center gap-x-3 border-b border-border/40 py-1.5 last:border-0">
              <span className="px-1 text-sm font-medium" title={help}>{label}</span>
              <div className="space-y-0.5">
                {guilds.map((guild, index) => {
                  const part = stats[index][key];
                  return (
                    <div key={guild.id} className={cn("flex items-center justify-end gap-1.5 font-mono tabular-nums", single ? "h-8 text-sm font-semibold" : "h-4 text-xs")}>
                      {!single && <span className="size-1.5 rounded-full" style={{ backgroundColor: guild.color }} />}
                      <span
                        className={cn(
                          !single && part && part.median === fastest && medians.length > 1
                            && "font-semibold underline decoration-sky-400 decoration-2 underline-offset-2",
                          !part && "text-muted-foreground",
                        )}
                      >
                        {part ? formatClearTime(part.median) : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-0.5">
                {guilds.map((guild, index) => (
                  <SpreadLane
                    key={guild.id}
                    label={`${guild.name} · ${label} time · ${stats[index][key]?.values.length ?? 0} clears`}
                    color={guild.color}
                    stats={stats[index][key]}
                    ticks={ticks}
                    position={position}
                    showValues={single}
                    maxValue={domain}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SmallSegmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-md border border-white/10 bg-black/20 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-medium transition-colors",
            value === option.value ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PartsBar({
  parts,
  longest,
  color,
  showLabels = false,
  thin = false,
}: {
  parts: ClearTimeParts;
  longest: number;
  color: string;
  showLabels?: boolean;
  thin?: boolean;
}) {
  const total = Math.max(partsTotal(parts), 1);
  const segments = [
    { key: "boss", label: "Boss", value: parts.bossMs, style: { backgroundColor: color }, text: "text-zinc-950" },
    { key: "trash", label: "Trash", value: parts.trashMs, style: { backgroundColor: color, opacity: 0.45 }, text: "text-zinc-950" },
    { key: "idle", label: "Idle", value: parts.idleMs, style: undefined, text: "text-foreground" },
  ] as const;

  return (
    <div
      className={cn("flex gap-0.5 overflow-hidden rounded-md text-[11px] font-medium", thin ? "h-3" : "h-7")}
      style={{ width: `${(total / longest) * 100}%` }}
    >
      {segments.map((segment) => {
        const share = Math.round((segment.value / total) * 100);
        return (
          <div
            key={segment.key}
            className={cn("flex min-w-0 items-center justify-between gap-1 px-2", segment.key === "idle" && "bg-white/10", segment.text)}
            style={{ ...segment.style, width: `${(segment.value / total) * 100}%` }}
            title={`${segment.label} ${formatClearTime(segment.value)} (${share}%) · ${PART_HELP[segment.key]}`}
          >
            {showLabels && share >= 8 && (
              <>
                <span className="truncate font-mono tabular-nums">{formatClearTime(segment.value)}</span>
                <span className="shrink-0 opacity-70">{share}%</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PartsLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {([
        ["Boss", "bg-slate-300"],
        ["Trash", "bg-slate-300/45"],
        ["Idle", "bg-white/10"],
      ] as const).map(([label, swatch]) => (
        <span key={label} className="flex items-center gap-1.5" title={PART_HELP[label.toLowerCase() as keyof typeof PART_HELP]}>
          <span className={cn("size-2.5 rounded-sm", swatch)} />
          {label}
        </span>
      ))}
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function GuildName({ guild }: { guild: BossSplitGuild }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-sm">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: guild.color }} />
      <span className="truncate font-medium">{guild.name}</span>
    </span>
  );
}

function partsTotal(parts: ClearTimeParts) {
  return parts.bossMs + parts.trashMs + parts.idleMs;
}
