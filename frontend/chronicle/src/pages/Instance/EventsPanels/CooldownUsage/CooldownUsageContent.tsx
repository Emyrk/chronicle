import { useMemo } from "react";
import { useCooldownSpells } from "@/api/cooldownSpells";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { cn } from "@/lib/utils";
import { classColor } from "../Consumables/consumablesLedgerLogic";
import { GenericPanel } from "../GenericPanel";
import { TemporalTimelineInterval, TemporalTimelineTrack } from "../TemporalTimeline";
import type { PanelRenderProps } from "../types";
import {
  buildCooldownIndex,
  buildCooldownRows,
  normalizeClassName,
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
const READY_CLASS = "bg-emerald-500/60";
const ON_COOLDOWN_CLASS = "bg-red-500/55";

function parseOptions(panelOption: string | null | undefined) {
  const parts = panelOption?.split(",").filter(Boolean) ?? [];
  const cls = parts.find((part) => part.startsWith(CLASS_PREFIX))?.slice(CLASS_PREFIX.length) ?? null;
  const minRaw = parts.find((part) => part.startsWith(MIN_CD_PREFIX))?.slice(MIN_CD_PREFIX.length);
  const minSeconds = minRaw != null && !Number.isNaN(Number(minRaw)) ? Number(minRaw) : DEFAULT_MIN_CD_SECONDS;
  return { cls, minSeconds };
}

function serializeOptions(cls: string | null, minSeconds: number): string | null {
  const parts: string[] = [];
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

function formatAt(ms: number, windows: readonly TimeWindow[]): string {
  const window = [...windows].reverse().find((w) => w.start <= ms) ?? windows[0];
  if (!window) return formatClock(ms);
  const clock = formatClock(ms - window.start);
  return windows.length > 1 ? `${window.name} ${clock}` : clock;
}

export function CooldownUsageContent(props: PanelRenderProps<CooldownUsageResult>) {
  const { result, context, panelOption, setPanelOption } = props;
  const { data: cooldownData, isLoading: cooldownsLoading, error: cooldownsError } = useCooldownSpells();
  const { cls: requestedClass, minSeconds } = parseOptions(panelOption);

  const windows = useMemo<TimeWindow[]>(
    () =>
      context.instance.encounters
        .filter((encounter) => context.selectedEncounterIds.includes(encounter.id))
        .map((encounter) => ({
          id: encounter.id,
          name: encounter.name,
          start: new Date(encounter.start_time).getTime(),
          end: new Date(encounter.end_time).getTime(),
        }))
        .sort((a, b) => a.start - b.start),
    [context.instance.encounters, context.selectedEncounterIds],
  );
  const encounters = useMemo(
    () => context.instance.encounters.filter((encounter) => context.selectedEncounterIds.includes(encounter.id)),
    [context.instance.encounters, context.selectedEncounterIds],
  );

  const allRows = useMemo(() => {
    if (!cooldownData || !result?.Casters) return [];
    return buildCooldownRows(result, buildCooldownIndex(cooldownData), windows, minSeconds * 1000);
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

  const rangeStart = windows[0]?.start ?? 0;
  const rangeEnd = windows[windows.length - 1]?.end ?? 0;

  return (
    <GenericPanel {...props}>
      <div className="flex h-full min-h-0 flex-col text-xs">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 pb-2">
          {classCounts.map(([cls, count]) => {
            const active = cls === selectedClass;
            return (
              <button
                key={cls}
                type="button"
                onClick={() => setPanelOption?.(serializeOptions(cls, minSeconds))}
                className={cn(
                  "flex items-center gap-1.5 rounded border px-2 py-1 text-[11px]",
                  active
                    ? "border-foreground/25 bg-muted text-foreground"
                    : "border-border/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-sm"
                  style={{ background: classColor(cls) }}
                />
                {classLabel(cls)}
                <span className="font-mono text-muted-foreground/70">{count}</span>
              </button>
            );
          })}
          <select
            value={minSeconds}
            onChange={(event) => setPanelOption?.(serializeOptions(selectedClass, Number(event.target.value)))}
            className="ml-auto rounded border bg-background px-2 py-1 text-[11px]"
            aria-label="Minimum cooldown"
          >
            {MIN_CD_OPTIONS.map((option) => (
              <option key={option.seconds} value={option.seconds}>{option.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-3 border-b border-border/40 py-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-sm border-l-2 border-foreground", ON_COOLDOWN_CLASS)} />
            Cast → on cooldown
          </span>
          <span className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-sm", READY_CLASS)} />
            Ready
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto styled-scrollbar">
          {cooldownsError ? (
            <div className="p-4 text-center text-destructive">Failed to load cooldown data.</div>
          ) : cooldownsLoading ? (
            <div className="p-4 text-center text-muted-foreground">Loading cooldowns…</div>
          ) : rows.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">No cooldown casts in the selected encounters.</div>
          ) : (
            groupByPlayer(rows).map((group) => (
              <PlayerGroup
                key={group[0].playerID}
                rows={group}
                windows={windows}
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
        <span className="flex-1" />
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
  encounters,
  rangeStart,
  rangeEnd,
}: TimelineProps & { row: CooldownUsageRow }) {
  const readyPct = row.windowMs > 0 ? Math.round((row.readyMs / row.windowMs) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex w-36 shrink-0 flex-col leading-tight">
        <span className="truncate text-muted-foreground">
          <SpellIdTooltip spellId={row.cooldown.spellId} name={row.cooldown.name} size={14} />
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {formatDuration(row.cooldown.cooldownMs)} CD · ready {formatDuration(row.readyMs)} ({readyPct}%)
        </span>
      </div>
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
                      <div>Cast at {formatAt(segment.castAt, windows)}</div>
                    )}
                    {segment.castAt != null && segment.castAt < segment.start && (
                      <div className="text-muted-foreground">Still on cooldown from {formatAt(segment.castAt, windows)}</div>
                    )}
                    {segment.castAt != null && (
                      <div>Ready again at {formatAt(segment.castAt + row.cooldown.cooldownMs, windows)}</div>
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
                      {formatAt(segment.start, windows)} – {formatAt(segment.end, windows)} ({formatDuration(segment.end - segment.start)} unused)
                    </div>
                  </div>
                )}
              />
            ),
          )}
        </TemporalTimelineTrack>
      </div>
      <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">{row.casts.length}</span>
    </div>
  );
}
