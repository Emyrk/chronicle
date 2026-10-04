import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { useCooldownSpells } from "@/api/cooldownSpells";
import { useSpell } from "@/api/queries";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { useDatasetId } from "@/hooks/useDatasetId";
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon";
import { cn } from "@/lib/utils";
import { classColor } from "../Consumables/consumablesLedgerLogic";
import { GenericPanel } from "../GenericPanel";
import { TemporalTimelineInterval, TemporalTimelineTrack } from "../TemporalTimeline";
import type { PanelRenderProps } from "../types";
import {
  buildCooldownIndex,
  buildCooldownRows,
  normalizeClassName,
  usedCooldownRows,
  type CooldownDef,
  type CooldownUsageRow,
  type TimeWindow,
} from "./cooldownUsage";
import type { CooldownUsageResult } from "./cooldownUsage.processor";

const CLASS_PREFIX = "c:";
const MIN_CD_PREFIX = "m:";
const MIN_CD_OPTIONS = [
  { seconds: 0, label: "Any cooldown" },
  { seconds: 30, label: "≥ 30s" },
  { seconds: 60, label: "≥ 1m" },
  { seconds: 180, label: "≥ 3m" },
];
const DEFAULT_MIN_CD_SECONDS = 30;
/** Timelines get unreadable past this many encounters, so compact is forced. */
const MAX_DETAILED_ENCOUNTERS = 4;
const READY_CLASS = "bg-emerald-500/60";
const ACTIVE_CLASS = "bg-sky-400";
const CASTS_COL = "w-10 shrink-0 text-right";
const READY_COL = "w-12 shrink-0 text-right";
const ON_COOLDOWN_CLASS = "bg-red-500/55";

function parseOptions(panelOption: string | null | undefined) {
  const parts = panelOption?.split(",").filter(Boolean) ?? [];
  const cls = parts.find((part) => part.startsWith(CLASS_PREFIX))?.slice(CLASS_PREFIX.length) ?? null;
  const minRaw = parts.find((part) => part.startsWith(MIN_CD_PREFIX))?.slice(MIN_CD_PREFIX.length);
  const minSeconds = minRaw != null && !Number.isNaN(Number(minRaw)) ? Number(minRaw) : DEFAULT_MIN_CD_SECONDS;
  return { cls, minSeconds };
}

/** Rewrites this panel's tokens, keeping others (e.g. the "cb" compact toggle). */
function serializeOptions(panelOption: string | null | undefined, cls: string | null, minSeconds: number): string | null {
  const parts = (panelOption?.split(",").filter(Boolean) ?? []).filter(
    (part) => !part.startsWith(CLASS_PREFIX) && !part.startsWith(MIN_CD_PREFIX),
  );
  if (cls) parts.push(`${CLASS_PREFIX}${cls}`);
  if (minSeconds !== DEFAULT_MIN_CD_SECONDS) parts.push(`${MIN_CD_PREFIX}${minSeconds}`);
  return parts.length > 0 ? parts.join(",") : null;
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function classLabel(cls: string): string {
  if (cls === "DEATHKNIGHT") return "Death Knight";
  return cls.charAt(0) + cls.slice(1).toLowerCase();
}

function formatAt(ms: number, windows: readonly TimeWindow[], allWindows: readonly TimeWindow[]): string {
  const inside = windows.find((w) => ms >= w.start && ms <= w.end);
  if (inside) {
    const clock = formatClock(ms - inside.start);
    return windows.length > 1 ? `${inside.name} ${clock}` : clock;
  }
  const other = allWindows.find((w) => ms >= w.start && ms <= w.end);
  if (other) return `${other.name} ${formatClock(ms - other.start)}`;
  const next = windows.find((w) => w.start > ms);
  if (next) return `${formatDuration(next.start - ms)} before ${next.name}`;
  const prev = [...windows].reverse().find((w) => w.end < ms);
  return prev ? `${formatDuration(ms - prev.end)} after ${prev.name}` : formatClock(ms);
}

export function CooldownUsageContent(props: PanelRenderProps<CooldownUsageResult>) {
  const { result, context, panelOption, setPanelOption, checkboxChecked } = props;
  const { data: cooldownData, isLoading: cooldownsLoading, error: cooldownsError } = useCooldownSpells();
  const { cls: requestedClass, minSeconds } = parseOptions(panelOption);

  const allWindows = useMemo<TimeWindow[]>(
    () =>
      context.instance.encounters
        .map((encounter) => ({
          id: encounter.id,
          name: encounter.name,
          start: new Date(encounter.start_time).getTime(),
          end: new Date(encounter.end_time).getTime(),
        }))
        .sort((a, b) => a.start - b.start),
    [context.instance.encounters],
  );
  const windows = useMemo(
    () => allWindows.filter((window) => context.selectedEncounterIds.includes(window.id)),
    [allWindows, context.selectedEncounterIds],
  );
  const encounters = useMemo(
    () => context.instance.encounters.filter((encounter) => context.selectedEncounterIds.includes(encounter.id)),
    [context.instance.encounters, context.selectedEncounterIds],
  );

  const allRows = useMemo(() => {
    if (!cooldownData || !result?.Casters) return [];
    return buildCooldownRows(result, buildCooldownIndex(cooldownData.byClass), windows, minSeconds * 1000);
  }, [cooldownData, minSeconds, result, windows]);

  const classCounts = useMemo(() => {
    const players = new Map<string, Set<string>>();
    for (const row of allRows) {
      const cls = normalizeClassName(row.className);
      const set = players.get(cls) ?? new Set<string>();
      set.add(row.playerID);
      players.set(cls, set);
    }
    return [...players.entries()]
      .map(([cls, set]) => [cls, set.size] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [allRows]);

  const selectedClass = classCounts.some(([cls]) => cls === requestedClass)
    ? requestedClass
    : (classCounts[0]?.[0] ?? null);
  const rows = allRows.filter((row) => normalizeClassName(row.className) === selectedClass);
  const detailedRows = usedCooldownRows(rows);

  const forcedCompact = !checkboxChecked && windows.length > MAX_DETAILED_ENCOUNTERS;
  const compact = checkboxChecked || forcedCompact;

  const rangeStart = windows[0]?.start ?? 0;
  const rangeEnd = windows[windows.length - 1]?.end ?? 0;

  return (
    <GenericPanel {...props}>
      <div className="flex h-full min-h-0 flex-col text-xs">
        <div className="flex flex-wrap items-center gap-1 border-b border-border/40 pb-2">
          {classCounts.map(([cls, count]) => {
            const active = cls === selectedClass;
            return (
              <button
                key={cls}
                type="button"
                onClick={() => setPanelOption?.(serializeOptions(panelOption, cls, minSeconds))}
                title={`${classLabel(cls)} · ${count} ${count === 1 ? "player" : "players"}`}
                aria-label={classLabel(cls)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px]",
                  active
                    ? "border-foreground/30 bg-muted text-foreground"
                    : "border-transparent text-muted-foreground opacity-60 hover:opacity-100",
                )}
              >
                {count}
                <ClassIcon cls={cls} className="size-4 rounded-sm" />
              </button>
            );
          })}
          {forcedCompact && (
            <HintTooltip>
              <TooltipTrigger asChild>
                <span className="ml-auto flex cursor-help items-center gap-1 text-[11px] text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Compact
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" hideArrow className="max-w-xs bg-popover text-popover-foreground">
                Detailed timelines are only shown for up to {MAX_DETAILED_ENCOUNTERS} encounters ({windows.length}{" "}
                selected); beyond that the bars get too thin to read. Select {MAX_DETAILED_ENCOUNTERS} or fewer
                encounters to see them.
              </TooltipContent>
            </HintTooltip>
          )}
          <select
            value={minSeconds}
            onChange={(event) => setPanelOption?.(serializeOptions(panelOption, selectedClass, Number(event.target.value)))}
            className={cn("rounded border bg-background px-2 py-1 text-[11px]", !forcedCompact && "ml-auto")}
            aria-label="Minimum cooldown"
          >
            {MIN_CD_OPTIONS.map((option) => (
              <option key={option.seconds} value={option.seconds}>{option.label}</option>
            ))}
          </select>
        </div>

        {!compact && (
          <>
            <div className="flex flex-wrap gap-3 border-b border-border/40 py-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-sm border-l-2 border-foreground", ON_COOLDOWN_CLASS)} />
                Cast → on cooldown
              </span>
              <span className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-sm", READY_CLASS)} />
                Ready
              </span>
              <span className="flex items-center gap-1.5">
                <span className={cn("h-1 w-2 rounded-sm", ACTIVE_CLASS)} />
                Active (spell duration)
              </span>
            </div>

            <div className="flex items-center gap-2 pl-3 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
              <span className="w-36 shrink-0">Cooldown</span>
              <span className={CASTS_COL}>Casts</span>
              <span className={READY_COL} title="Share of fight time the cooldown was ready but unused">Ready</span>
              <span className="flex-1 pl-1">Timeline</span>
            </div>
          </>
        )}

        <div className="min-h-0 flex-1 overflow-auto styled-scrollbar">
          {cooldownsError ? (
            <div className="p-4 text-center text-destructive">Failed to load cooldown data.</div>
          ) : cooldownsLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading cooldowns…</div>
          ) : (compact ? rows : detailedRows).length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">No cooldown casts in the selected encounters.</div>
          ) : compact ? (
            <CompactTable rows={rows} />
          ) : (
            groupByPlayer(detailedRows).map((group) => (
              <PlayerGroup
                key={group[0].playerID}
                rows={group}
                windows={windows}
                allWindows={allWindows}
                encounters={encounters}
                rangeStart={rangeStart}
                rangeEnd={rangeEnd}
              />
            ))
          )}
        </div>
      </div>
    </GenericPanel>
  );
}

function CooldownIcon({ cooldown }: { cooldown: CooldownDef }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(String(cooldown.spellId), datasetId);
  return spell ? (
    <SpellIconWithTooltip spell={spell} size={20} className="size-5" />
  ) : (
    <span className="block size-5 rounded-sm border border-white/10 bg-black/25" title={cooldown.name} />
  );
}

/** Players × cooldowns grid of cast counts. */
function CompactTable({ rows }: { rows: readonly CooldownUsageRow[] }) {
  const cooldowns = [...new Map(rows.map((row) => [row.cooldown.key, row.cooldown])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const players = groupByPlayer(rows);

  return (
    <table className="w-max border-separate border-spacing-0 text-xs">
      <thead>
        <tr>
          <th className="sticky left-0 top-0 z-20 bg-card px-2 py-1.5" />
          {cooldowns.map((cooldown) => (
            <th key={cooldown.key} className="sticky top-0 z-10 bg-card px-1.5 py-1.5" title={cooldown.name}>
              <span className="flex justify-center">
                <CooldownIcon cooldown={cooldown} />
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {players.map((group) => {
          const player = group[0];
          const casts = new Map(group.map((row) => [row.cooldown.key, row.casts.length]));
          return (
            <tr key={player.playerID} className="hover:bg-muted/30">
              <td className="sticky left-0 z-10 whitespace-nowrap border-t border-border/30 bg-card py-1 pl-1 pr-3">
                <span className="flex items-center gap-1.5 text-foreground">
                  <span
                    className="h-3 w-[3px] rounded-sm"
                    style={{ background: classColor(normalizeClassName(player.className)) }}
                  />
                  {player.playerName}
                </span>
              </td>
              {cooldowns.map((cooldown) => {
                const count = casts.get(cooldown.key) ?? 0;
                return (
                  <td
                    key={cooldown.key}
                    className={cn(
                      "border-t border-border/30 px-1.5 py-1 text-center font-mono",
                      count === 0 ? "text-muted-foreground/40" : "text-foreground",
                    )}
                    title={`${player.playerName} · ${cooldown.name}: ${count}`}
                  >
                    {count}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function groupByPlayer(rows: readonly CooldownUsageRow[]): CooldownUsageRow[][] {
  const groups: CooldownUsageRow[][] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last[0].playerID === row.playerID) last.push(row);
    else groups.push([row]);
  }
  return groups;
}

type TimelineProps = {
  windows: readonly TimeWindow[];
  allWindows: readonly TimeWindow[];
  encounters: Parameters<typeof TemporalTimelineTrack>[0]["encounters"];
  rangeStart: number;
  rangeEnd: number;
};

function PlayerGroup({ rows, ...timeline }: TimelineProps & { rows: CooldownUsageRow[] }) {
  const player = rows[0];
  const color = classColor(normalizeClassName(player.className));
  const totalCasts = rows.reduce((total, row) => total + row.casts.length, 0);

  return (
    <div className="border-b border-border/40 py-2">
      <div className="mb-1 flex items-baseline gap-2">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <span className="h-3 w-[3px] rounded-sm" style={{ background: color }} />
          {player.playerName}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {totalCasts} {totalCasts === 1 ? "cast" : "casts"}
        </span>
      </div>
      <div className="flex flex-col gap-1 pl-3">
        {rows.map((row) => (
          <CooldownRow key={row.cooldown.key} row={row} {...timeline} />
        ))}
      </div>
    </div>
  );
}

function CooldownRow({
  row,
  windows,
  allWindows,
  encounters,
  rangeStart,
  rangeEnd,
}: TimelineProps & { row: CooldownUsageRow }) {
  const readyPct = row.windowMs > 0 ? Math.round((row.readyMs / row.windowMs) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-36 shrink-0 truncate text-muted-foreground">
        <SpellIdTooltip spellId={row.cooldown.spellId} name={row.cooldown.name} size={14} />
      </span>
      <span className={cn(CASTS_COL, "font-mono text-foreground")}>{row.casts.length}</span>
      <span className={cn(READY_COL, "font-mono text-muted-foreground")}>{readyPct}%</span>
      <div className="flex min-w-0 flex-1">
        <TemporalTimelineTrack rangeStartMs={rangeStart} rangeEndMs={rangeEnd} encounters={encounters}>
          {row.segments.map((segment) =>
            segment.kind === "cooldown" ? (
              <TemporalTimelineInterval
                key={`c${segment.start}`}
                startMs={segment.start}
                endMs={segment.end}
                rangeStartMs={rangeStart}
                rangeEndMs={rangeEnd}
                className={cn("rounded-none border-l-2 border-foreground", ON_COOLDOWN_CLASS)}
                tooltip={(
                  <div className="space-y-0.5 text-xs">
                    <div className="font-medium">{row.cooldown.name}</div>
                    {segment.castAt != null && segment.castAt >= segment.start && (
                      <div>Cast at {formatAt(segment.castAt, windows, allWindows)}</div>
                    )}
                    {segment.castAt != null && segment.castAt < segment.start && (
                      <div className="text-muted-foreground">Still on cooldown from {formatAt(segment.castAt, windows, allWindows)}</div>
                    )}
                    {segment.castAt != null && (
                      <div>Ready again at {formatAt(segment.castAt + row.cooldown.cooldownMs, windows, allWindows)}</div>
                    )}
                  </div>
                )}
              />
            ) : (
              <TemporalTimelineInterval
                key={`r${segment.start}`}
                startMs={segment.start}
                endMs={segment.end}
                rangeStartMs={rangeStart}
                rangeEndMs={rangeEnd}
                className={cn("rounded-none", READY_CLASS)}
                tooltip={(
                  <div className="space-y-0.5 text-xs">
                    <div className="font-medium">{row.cooldown.name} ready</div>
                    <div>
                      {formatAt(segment.start, windows, allWindows)} – {formatAt(segment.end, windows, allWindows)} ({formatDuration(segment.end - segment.start)} unused)
                    </div>
                  </div>
                )}
              />
            ),
          )}
          {row.effects.map((effect) => (
            <TemporalTimelineInterval
              key={`e${effect.start}`}
              startMs={effect.start}
              endMs={effect.end}
              rangeStartMs={rangeStart}
              rangeEndMs={rangeEnd}
              className={cn("top-1/4 h-1/2 rounded-sm", ACTIVE_CLASS)}
              style={{ opacity: 1 }}
              tooltip={(
                <div className="space-y-0.5 text-xs">
                  <div className="font-medium">{row.cooldown.name} active</div>
                  <div>
                    {formatAt(effect.castAt, windows, allWindows)} – {formatAt(effect.castAt + effect.durationMs, windows, allWindows)} ({formatDuration(effect.durationMs)})
                  </div>
                </div>
              )}
            />
          ))}
        </TemporalTimelineTrack>
      </div>
    </div>
  );
}
