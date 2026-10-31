import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useSupportedInstanceProgressionBosses, useSupportedInstanceRankingEncounterSets } from "@/api/queries";
import { useCharacterEncounters, useCharacterPerformances } from "@/api/rankingsQueries";
import type { CharacterPerformanceRun, GuildSpeedrunRun } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import {
  assignPerformanceSeriesColors,
  buildPerformanceVariants,
  consistencyLabel,
  filterPerformanceRuns,
  formatStat,
  performanceParseColor,
  performanceValue,
  quantile,
  selectPerformanceEncounterNames,
  summarizePerformanceRuns,
} from "@/pages/ArmoryPage/overview/performanceExplorerModel";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { useGuildRaidClearsList, useGuildSpeedrunHistories } from "@/pages/GuildHistory/guildHistoryQueries";
import { filterGuildRuns, formatClearTime, GUILD_SERIES_COLORS, summarizeClearTimes } from "@/pages/GuildHistory/guildHistoryModel";
import { entityKey, type EntityKind, type EntityRef } from "./entity";
import type { EntityRaidContext } from "./entityMenuContext";

type Character = Extract<EntityRef, { kind: "character" }>;
type Guild = Extract<EntityRef, { kind: "guild" }>;
type QuickTab = "score" | "chart";
type Metric = "dps" | "hps";
/** Parse (rank against others on the same fights) or the raw DPS/HPS value. */
type Display = "parse" | "raw";

const TAB_KEY = "chronicle.quick-stats-tab";
const METRIC_KEY = "chronicle.quick-stats-metric";
const DISPLAY_KEY = "chronicle.quick-stats-display";
const DAY_MS = 24 * 60 * 60 * 1000;

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Remembering the tab is a convenience; private windows just start on Score.
  }
}

/**
 * Highlights for the players or guilds in the compare tray: how they did on the raid this page
 * shows, against their own history on the same fights. One entity gets a short summary, several
 * a comparison table. The Score/Chart tab, Parse/Value and the metric are remembered between visits.
 */
export default function QuickStats({
  kind,
  entities,
  hidden,
  raid,
  rangeDays,
}: {
  kind: EntityKind;
  entities: EntityRef[];
  /** Entity keys to leave out; everyone else keeps the color they'd have with them shown. */
  hidden: ReadonlySet<string>;
  raid: EntityRaidContext | null;
  /** Nights older than this are left out of the stats and chart. */
  rangeDays: number;
}) {
  const [tab, setTab] = useState<QuickTab>(() => readStored(TAB_KEY, ["score", "chart"], "score"));
  const [metric, setMetric] = useState<Metric>(() => readStored(METRIC_KEY, ["dps", "hps"], "dps"));
  const chooseTab = (next: QuickTab) => {
    setTab(next);
    writeStored(TAB_KEY, next);
  };
  const chooseMetric = (next: Metric) => {
    setMetric(next);
    writeStored(METRIC_KEY, next);
  };
  const [display, setDisplay] = useState<Display>(() => readStored(DISPLAY_KEY, ["parse", "raw"], "parse"));
  const chooseDisplay = (next: Display) => {
    setDisplay(next);
    writeStored(DISPLAY_KEY, next);
  };
  const characters = entities.filter((entity): entity is Character => entity.kind === "character");
  const guilds = entities.filter((entity): entity is Guild => entity.kind === "guild");

  return (
    <div aria-label="Quick stats" role="region">
      <div className="flex items-center gap-1">
        <div role="tablist" aria-label="Quick stats view" className="flex gap-0.5 rounded-md bg-white/5 p-0.5">
          {(["score", "chart"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={tab === option}
              onClick={() => chooseTab(option)}
              className={cn(
                "rounded px-2.5 py-0.5 text-xs font-medium",
                tab === option ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "score" ? (kind === "guild" ? "Clear" : "Score") : "Chart"}
            </button>
          ))}
        </div>
        {kind === "character" && (
          <Segmented
            className="ml-auto"
            label="Parse or value"
            options={[
              { value: "parse", label: "Parse", title: "How each night ranked against others on the same fights" },
              { value: "raw", label: "Value", title: "Raw DPS or HPS per night" },
            ]}
            value={display}
            onChange={chooseDisplay}
          />
        )}
        {kind === "character" && (
          <div className="flex gap-0.5 rounded-md bg-white/5 p-0.5" role="group" aria-label="Metric">
            {(["dps", "hps"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={metric === option}
                onClick={() => chooseMetric(option)}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-medium uppercase",
                  metric === option ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="pt-2">
        {kind === "character" ? (
          <PlayerQuickStats
            key={characters.map(entityKey).join()}
            characters={characters}
            raid={raid}
            tab={tab}
            metric={metric}
            requestedDisplay={display}
            hidden={hidden}
            rangeDays={rangeDays}
          />
        ) : (
          <GuildQuickStats key={guilds.map(entityKey).join()} guilds={guilds} hidden={hidden} raid={raid} tab={tab} rangeDays={rangeDays} />
        )}
      </div>
    </div>
  );
}

/** The fights to compare: the page's selected bosses, else the first player's most recent raid. */
function usePlayerFights(characters: Character[], raid: EntityRaidContext | null) {
  const encounters = useCharacterEncounters(characters[0]?.guid, undefined, !raid);
  const progression = useSupportedInstanceProgressionBosses();
  const rankingSets = useSupportedInstanceRankingEncounterSets();
  if (raid) {
    return { ...raid, fromPage: true, loading: false };
  }
  const variant = buildPerformanceVariants(encounters.data?.encounters ?? [])[0];
  if (!variant) return { instanceName: "", bossNames: [] as string[], fromPage: false, loading: encounters.isLoading };
  return {
    instanceName: variant.instanceName,
    difficultyName: variant.difficultyName,
    maxPlayers: variant.maxPlayers,
    bossNames: selectPerformanceEncounterNames(variant, [], progression.data, rankingSets.data),
    instanceId: undefined,
    fromPage: false,
    loading: false,
  };
}

interface PlayerLine {
  character: Character;
  color: string;
  runs: CharacterPerformanceRun[];
  /** The run from the page's log, else the latest. */
  focus: CharacterPerformanceRun | null;
}

function PlayerQuickStats({
  characters,
  raid,
  tab,
  metric,
  requestedDisplay,
  hidden,
  rangeDays,
}: {
  characters: Character[];
  raid: EntityRaidContext | null;
  tab: QuickTab;
  metric: Metric;
  requestedDisplay: Display;
  hidden: ReadonlySet<string>;
  rangeDays: number;
}) {
  const [now] = useState(() => Date.now());
  const cutoff = new Date(now - rangeDays * DAY_MS).toISOString();
  const fights = usePlayerFights(characters, raid);
  const queries = useCharacterPerformances(
    characters.map((character) => ({
      playerGuid: character.guid,
      instanceName: fights.instanceName,
      encounterNames: fights.bossNames,
      difficultyName: fights.difficultyName,
      maxPlayers: fights.maxPlayers,
      metric,
    })),
  );
  const colors = assignPerformanceSeriesColors(characters.map((character) => character.className ?? ""));
  const allRuns = queries.map((query) => query.data?.runs ?? []);
  // Fall back to raw values when nobody has a parse on these fights yet.
  const hasParses = allRuns.some((runs) => runs.some((run) => run.average_parse != null));
  const display: Display = requestedDisplay === "parse" && !hasParses ? "raw" : requestedDisplay;
  const allLines: PlayerLine[] = characters.map((character, index) => {
    const everyRun = filterPerformanceRuns(allRuns[index], null, null, display);
    const runs = everyRun.filter((run) => run.started_at >= cutoff);
    const latest = [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;
    // Duplicate uploads of a night collapse to one run, which may point at another copy of this log.
    // This log's night is found among all runs, so a short range still calls it out.
    const focus = fights.instanceId
      ? everyRun.find((run) => run.representative_instance_id === fights.instanceId || (!!fights.instanceSlug && run.log_hashed_slug === fights.instanceSlug)) ?? null
      : latest;
    return { character, color: colors[index], runs, focus };
  });
  const lines = allLines.filter((line) => !hidden.has(entityKey(line.character)));
  const loading = fights.loading || queries.some((query) => query.isLoading);
  const focusLabel = fights.instanceId ? "This log" : "Latest";
  const value = (run: CharacterPerformanceRun) => performanceValue(run, metric, display);
  const format = (number: number) => formatStat(number, display);
  const color = (number: number) => (display === "parse" ? performanceParseColor(number) : undefined);

  return (
    <div className="space-y-2.5">
      <FightsLine
        instanceName={fights.instanceName}
        detail={
          fights.bossNames.length > 0
            ? `${fights.bossNames.length} ${fights.bossNames.length === 1 ? "boss" : "bosses"}${fights.fromPage ? " · same fights as this page" : " · most recent raid"}`
            : undefined
        }
      />
      {!loading && requestedDisplay === "parse" && display === "raw" && (
        <p className="text-[11px] text-muted-foreground">No parses on these fights yet, so these are {metric.toUpperCase()} values.</p>
      )}
      {lines.length === 0 ? (
        <Empty>Everyone here is hidden. Shift+click a name to show them again.</Empty>
      ) : loading ? (
        <Empty>Loading…</Empty>
      ) : !fights.instanceName || lines.every((line) => line.runs.length === 0) ? (
        <Empty>No ranked {metric.toUpperCase()} runs on these fights yet.</Empty>
      ) : tab === "chart" ? (
        <MiniChart
          rangeDays={rangeDays}
          series={lines.map((line) => ({
            key: entityKey(line.character),
            label: line.character.name,
            color: line.color,
            points: line.runs.map((run) => ({ time: Date.parse(run.started_at), value: value(run), highlight: run === line.focus })),
          }))}
          format={format}
          caption={display === "parse" ? "Parse per night, higher is better" : `${metric.toUpperCase()} per night, higher is better`}
        />
      ) : lines.length === 1 ? (
        <SinglePlayerScore line={lines[0]} focusLabel={focusLabel} value={value} format={format} color={color} display={display} metric={metric} />
      ) : (
        <CompareTable
          columns={[focusLabel, "Typical", "Best", "Nights"]}
          rows={lines.map((line) => {
            const summary = summarizePerformanceRuns(line.runs, metric, display);
            const focusValue = line.focus ? value(line.focus) : null;
            return {
              key: entityKey(line.character),
              name: line.character.name,
              nameColor: line.character.className ? getClassColorVar(line.character.className) : undefined,
              dot: line.color,
              cells: [
                focusValue === null ? null : { text: format(focusValue), color: color(focusValue), strong: true },
                summary ? { text: format(summary.typical), color: color(summary.typical) } : null,
                summary ? { text: format(summary.best), color: color(summary.best) } : null,
                { text: String(line.runs.length) },
              ],
            };
          })}
        />
      )}
    </div>
  );
}

function SinglePlayerScore({
  line,
  focusLabel,
  value,
  format,
  color,
  display,
  metric,
}: {
  line: PlayerLine;
  focusLabel: string;
  value: (run: CharacterPerformanceRun) => number;
  format: (value: number) => string;
  color: (value: number) => string | undefined;
  display: "raw" | "parse";
  metric: Metric;
}) {
  const summary = summarizePerformanceRuns(line.runs, metric, display);
  if (!summary) return <Empty>No ranked runs on these fights yet.</Empty>;
  const focusValue = line.focus ? value(line.focus) : null;
  const rank = focusValue === null ? null : line.runs.filter((run) => value(run) > focusValue).length + 1;
  const delta = focusValue === null ? null : focusValue - summary.typical;
  return (
    <div className="space-y-3">
      {focusValue !== null && line.focus ? (
        <div className="flex items-end gap-3">
          <div className="font-mono text-3xl font-bold tabular-nums leading-none" style={{ color: color(focusValue) }}>
            {format(focusValue)}
          </div>
          <div className="min-w-0 pb-0.5 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">{focusLabel}</span>
              {display === "parse"
                ? ` · ${Math.round(metric === "hps" ? line.focus.hps : line.focus.dps).toLocaleString()} ${metric.toUpperCase()}`
                : ` ${metric.toUpperCase()}${line.focus.average_parse != null ? ` · ${line.focus.average_parse.toFixed(1)} parse` : ""}`}
              {" · "}
              {new Date(line.focus.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </div>
            <div>
              {delta !== null && (
                <span className={delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {delta >= 0 ? "▲" : "▼"} {format(Math.abs(delta))} vs typical
                </span>
              )}
              {rank !== null && ` · ${ordinal(rank)} best of ${line.runs.length}`}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Not ranked in this log; their history on the same fights:</p>
      )}
      <StatGrid
        stats={[
          { label: "Typical", text: format(summary.typical), color: color(summary.typical) },
          { label: "Best", text: format(summary.best), color: color(summary.best) },
          { label: "Recent", text: summary.recent === null ? "—" : format(summary.recent), color: summary.recent === null ? undefined : color(summary.recent) },
          { label: "Consistency", text: summary.consistency === null ? "—" : consistencyLabel(summary.consistency, summary.typical, display) },
        ]}
      />
    </div>
  );
}

interface GuildLine {
  guild: Guild;
  color: string;
  runs: GuildSpeedrunRun[];
  focus: GuildSpeedrunRun | null;
}

function GuildQuickStats({
  guilds,
  hidden,
  raid,
  tab,
  rangeDays,
}: {
  guilds: Guild[];
  hidden: ReadonlySet<string>;
  raid: EntityRaidContext | null;
  tab: QuickTab;
  rangeDays: number;
}) {
  const [now] = useState(() => Date.now());
  const clears = useGuildRaidClearsList(raid ? [] : guilds.slice(0, 1).map((guild) => guild.id));
  const latestRaid = [...(clears[0]?.data?.clears ?? [])].sort((a, b) => b.last_cleared_at.localeCompare(a.last_cleared_at))[0];
  // Clears are kept per raid size and difficulty, so compare the same variant.
  const variant = raid
    ? { instanceName: raid.instanceName, difficultyName: raid.difficultyName, maxPlayers: raid.maxPlayers, dynamicDifficulty: raid.dynamicDifficulty }
    : {
        instanceName: latestRaid?.instance_name,
        difficultyName: latestRaid?.difficulty_name,
        maxPlayers: latestRaid?.max_players,
        dynamicDifficulty: latestRaid?.dynamic_difficulty,
      };
  const instanceName = variant.instanceName;
  const histories = useGuildSpeedrunHistories(
    guilds.map((guild) => guild.id),
    variant.instanceName,
    variant.difficultyName,
    variant.maxPlayers,
    variant.dynamicDifficulty,
  );
  const allLines: GuildLine[] = guilds.map((guild, index) => {
    const everyRun = histories[index]?.data?.runs ?? [];
    const runs = filterGuildRuns(everyRun, { includeUnqualified: false, rangeDays, now });
    const latest = [...runs].sort((a, b) => b.completion_time.localeCompare(a.completion_time))[0] ?? null;
    const focus = raid?.instanceSlug
      ? filterGuildRuns(everyRun, { includeUnqualified: false, rangeDays: 180, now }).find((run) => run.slug === raid.instanceSlug) ?? null
      : latest;
    return { guild, color: GUILD_SERIES_COLORS[index % GUILD_SERIES_COLORS.length], runs, focus };
  });
  const lines = allLines.filter((line) => !hidden.has(entityKey(line.guild)));
  const loading = (!raid && clears[0]?.isLoading) || histories.some((query) => query.isLoading);
  const focusLabel = raid?.instanceSlug ? "This log" : "Latest";

  return (
    <div className="space-y-2.5">
      <FightsLine instanceName={instanceName ?? ""} detail={raid ? "full clears · this page's raid" : "full clears · most recent raid"} />
      {lines.length === 0 ? (
        <Empty>Everyone here is hidden. Shift+click a name to show them again.</Empty>
      ) : loading ? (
        <Empty>Loading…</Empty>
      ) : lines.every((line) => line.runs.length === 0) ? (
        <Empty>No qualified clears of this raid in the last 180 days.</Empty>
      ) : tab === "chart" ? (
        <MiniChart
          rangeDays={rangeDays}
          series={lines.map((line) => ({
            key: entityKey(line.guild),
            label: line.guild.name,
            color: line.color,
            points: line.runs.map((run) => ({ time: Date.parse(run.completion_time), value: run.duration_ms, highlight: run === line.focus })),
          }))}
          format={formatClearTime}
          caption="Clear time per night, lower is faster"
        />
      ) : lines.length === 1 ? (
        <SingleGuildClear line={lines[0]} focusLabel={focusLabel} />
      ) : (
        <CompareTable
          columns={[focusLabel, "Typical", "Best", "Clears"]}
          rows={lines.map((line) => {
            const summary = summarizeClearTimes(line.runs, "full");
            return {
              key: entityKey(line.guild),
              name: line.guild.name,
              dot: line.color,
              cells: [
                line.focus ? { text: formatClearTime(line.focus.duration_ms), strong: true } : null,
                summary ? { text: formatClearTime(summary.typical) } : null,
                summary ? { text: formatClearTime(summary.best) } : null,
                { text: String(line.runs.length) },
              ],
            };
          })}
        />
      )}
    </div>
  );
}

function SingleGuildClear({ line, focusLabel }: { line: GuildLine; focusLabel: string }) {
  const summary = summarizeClearTimes(line.runs, "full");
  if (!summary) return <Empty>No qualified clears yet.</Empty>;
  const focus = line.focus;
  const delta = focus ? focus.duration_ms - summary.typical : null;
  const rank = focus ? line.runs.filter((run) => run.duration_ms < focus.duration_ms).length + 1 : null;
  return (
    <div className="space-y-3">
      {focus ? (
        <div className="flex items-end gap-3">
          <div className="font-mono text-3xl font-bold tabular-nums leading-none">{formatClearTime(focus.duration_ms)}</div>
          <div className="min-w-0 pb-0.5 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">{focusLabel}</span>
              {" · "}
              {new Date(focus.completion_time).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </div>
            <div>
              {delta !== null && (
                <span className={delta <= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {formatClearTime(Math.abs(delta))} {delta <= 0 ? "faster" : "slower"} than typical
                </span>
              )}
              {rank !== null && ` · ${ordinal(rank)} fastest of ${line.runs.length}`}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">This log isn't a qualified clear; their recent clears:</p>
      )}
      <StatGrid
        stats={[
          { label: "Typical", text: formatClearTime(summary.typical) },
          { label: "Best", text: formatClearTime(summary.best) },
          { label: "Recent", text: summary.recent === null ? "—" : formatClearTime(summary.recent) },
          { label: "Clears", text: String(summary.runCount) },
        ]}
      />
    </div>
  );
}

function FightsLine({ instanceName, detail }: { instanceName: string; detail?: string }) {
  if (!instanceName) return null;
  return (
    <p className="truncate text-[11px] text-muted-foreground">
      <span className="font-medium text-foreground">{instanceName}</span>
      {detail && ` · ${detail}`}
    </p>
  );
}

function StatGrid({ stats }: { stats: { label: string; text: string; color?: string }[] }) {
  return (
    <dl className="grid grid-cols-4 gap-2 rounded-md bg-white/5 px-2.5 py-2">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{stat.label}</dt>
          <dd className="truncate font-mono text-sm font-semibold tabular-nums" style={stat.color ? { color: stat.color } : undefined}>
            {stat.text}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface TableCell {
  text: string;
  color?: string;
  strong?: boolean;
}

function CompareTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: { key: string; name: string; nameColor?: string; dot: string; cells: (TableCell | null)[] }[];
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
          <th className="pb-1 text-left font-medium" />
          {columns.map((column) => (
            <th key={column} className="pb-1 text-right font-medium">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key} className="border-t border-border/50">
            <td className="max-w-[110px] py-1.5 pr-2">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: row.dot }} aria-hidden="true" />
                <span className="truncate font-medium" style={row.nameColor ? { color: row.nameColor } : undefined}>
                  {row.name}
                </span>
              </span>
            </td>
            {row.cells.map((cell, index) => (
              <td
                key={columns[index]}
                className={cn("py-1.5 pl-2 text-right font-mono tabular-nums", cell?.strong && "font-semibold")}
                style={cell?.color ? { color: cell.color } : undefined}
              >
                {cell?.text ?? <span className="text-muted-foreground">—</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: { time: number; value: number; highlight: boolean }[];
}


const CHART_WIDTH = 352;
const CHART_HEIGHT = 140;
const CHART_LEFT = 40;
const CHART_RIGHT = 6;
const CHART_TOP = 6;
const CHART_BOTTOM = 16;
/** Nights further than this from the hovered one count as "no run" for that line. */
const HOVER_MATCH_DAYS = 3;

/**
 * A small line per entity over the chosen range. The page's night is ringed. Hovering reads out
 * every line's night under the cursor; one line, or the line hovered in the legend, shows its
 * typical band (middle half of its nights).
 */
function MiniChart({
  series,
  format,
  caption,
  rangeDays,
}: {
  series: ChartSeries[];
  format: (value: number) => string;
  caption: string;
  rangeDays: number;
}) {
  const [now] = useState(() => Date.now());
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const start = now - rangeDays * DAY_MS;
  const visible = series.map((line) => ({
    ...line,
    points: line.points.filter((point) => point.time >= start).sort((a, b) => a.time - b.time),
  }));
  const values = visible.flatMap((line) => line.points.map((point) => point.value));
  if (values.length === 0) return <Empty>No runs in the last {rangeDays} days.</Empty>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = (max - min) * 0.1 || Math.abs(max) * 0.05 || 1;
  const low = min - pad;
  const high = max + pad;
  const plotWidth = CHART_WIDTH - CHART_LEFT - CHART_RIGHT;
  const plotBottom = CHART_HEIGHT - CHART_BOTTOM;
  const x = (time: number) => CHART_LEFT + ((time - start) / (now - start)) * plotWidth;
  const y = (value: number) => CHART_TOP + (1 - (value - low) / (high - low)) * (plotBottom - CHART_TOP);
  const bandKey = focusKey ?? (visible.length === 1 ? visible[0].key : null);
  const bandLine = visible.find((line) => line.key === bandKey);
  const bandValues = bandLine ? bandLine.points.map((point) => point.value).sort((a, b) => a - b) : [];
  const band = bandLine && bandValues.length >= 3
    ? { color: bandLine.color, lower: quantile(bandValues, 0.25), upper: quantile(bandValues, 0.75), typical: quantile(bandValues, 0.5) }
    : null;

  // Snap the hover to the nearest night on any line, then read each line's run on or near it.
  const allTimes = visible.flatMap((line) => line.points.map((point) => point.time));
  const snapped = hoverTime === null
    ? null
    : allTimes.reduce((best, time) => (Math.abs(time - hoverTime) < Math.abs(best - hoverTime) ? time : best), allTimes[0]);
  const hovered = snapped === null
    ? []
    : visible.map((line) => {
        const nearest = line.points.reduce<(typeof line.points)[number] | null>(
          (best, point) => (!best || Math.abs(point.time - snapped) < Math.abs(best.time - snapped) ? point : best),
          null,
        );
        return { line, point: nearest && Math.abs(nearest.time - snapped) <= HOVER_MATCH_DAYS * DAY_MS ? nearest : null };
      });

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * CHART_WIDTH;
    if (svgX < CHART_LEFT || svgX > CHART_WIDTH - CHART_RIGHT) return setHoverTime(null);
    setHoverTime(start + ((svgX - CHART_LEFT) / plotWidth) * (now - start));
  };
  const tooltipLeft = snapped === null ? 0 : (x(snapped) / CHART_WIDTH) * 100;

  return (
    <figure className="space-y-1.5">
      <div className="text-[11px] text-muted-foreground">{caption}</div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="w-full touch-none"
          role="img"
          aria-label={caption}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHoverTime(null)}
        >
          {band && (
            <g>
              <rect
                x={CHART_LEFT}
                width={plotWidth}
                y={y(band.upper)}
                height={Math.max(1, y(band.lower) - y(band.upper))}
                fill={band.color}
                fillOpacity={0.12}
              />
              <line x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={y(band.typical)} y2={y(band.typical)} stroke={band.color} strokeOpacity={0.6} strokeDasharray="3 3" />
            </g>
          )}
          {[high - pad, low + pad].map((tick) => (
            <g key={tick}>
              <line x1={CHART_LEFT} x2={CHART_WIDTH - CHART_RIGHT} y1={y(tick)} y2={y(tick)} stroke="currentColor" strokeOpacity={0.1} />
              <text x={CHART_LEFT - 4} y={y(tick) + 3} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.55}>
                {format(tick)}
              </text>
            </g>
          ))}
          <text x={CHART_LEFT} y={CHART_HEIGHT - 3} fontSize={9} fill="currentColor" fillOpacity={0.55}>
            {rangeDays} days ago
          </text>
          <text x={CHART_WIDTH - CHART_RIGHT} y={CHART_HEIGHT - 3} textAnchor="end" fontSize={9} fill="currentColor" fillOpacity={0.55}>
            Today
          </text>
          {snapped !== null && (
            <line x1={x(snapped)} x2={x(snapped)} y1={CHART_TOP} y2={plotBottom} stroke="currentColor" strokeOpacity={0.35} />
          )}
          {visible.map((line) => {
            const dimmed = focusKey !== null && focusKey !== line.key;
            return (
              <g key={line.key} opacity={dimmed ? 0.2 : 1}>
                <polyline
                  points={line.points.map((point) => `${x(point.time)},${y(point.value)}`).join(" ")}
                  fill="none"
                  stroke={line.color}
                  strokeWidth={1.5}
                  strokeOpacity={0.85}
                />
                {line.points.map((point) => {
                  const active = hovered.some((entry) => entry.point === point);
                  return (
                    <circle
                      key={point.time}
                      cx={x(point.time)}
                      cy={y(point.value)}
                      r={point.highlight ? 4.5 : active ? 3.5 : 2}
                      fill={line.color}
                      stroke={point.highlight || active ? "var(--popover)" : "none"}
                      strokeWidth={2}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {snapped !== null && (
          <div
            data-chart-readout
            className="pointer-events-none absolute top-0 z-10 min-w-[140px] rounded-md border bg-popover/95 px-2 py-1.5 text-[11px] shadow-lg"
            style={tooltipLeft > 55 ? { right: `${100 - tooltipLeft + 3}%` } : { left: `${tooltipLeft + 3}%` }}
          >
            <div className="mb-1 font-medium">
              {new Date(snapped).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </div>
            {hovered.map(({ line, point }) => (
              <div key={line.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: line.color }} aria-hidden="true" />
                <span className="truncate">{line.label}</span>
                <span className="ml-auto pl-2 font-mono tabular-nums">{point ? format(point.value) : "—"}</span>
                {point?.highlight && <span className="text-[10px] text-muted-foreground">this log</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11px] text-muted-foreground">
        {visible.map((line) => (
          <button
            key={line.key}
            type="button"
            onMouseEnter={() => setFocusKey(line.key)}
            onMouseLeave={() => setFocusKey(null)}
            onFocus={() => setFocusKey(line.key)}
            onBlur={() => setFocusKey(null)}
            className={cn("flex items-center gap-1 rounded px-1 py-0.5 hover:bg-white/5", visible.length === 1 && "cursor-default")}
            title="Hover to show their typical band"
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: line.color }} aria-hidden="true" />
            {line.label}
          </button>
        ))}
        {band && (
          <span className="ml-auto flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm" style={{ backgroundColor: band.color, opacity: 0.35 }} aria-hidden="true" />
            Typical range
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="py-6 text-center text-xs text-muted-foreground">{children}</div>;
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: { value: T; label: string; title?: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-0.5 rounded-md bg-white/5 p-0.5", className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded px-2 py-0.5 text-[11px] font-medium",
            value === option.value ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
