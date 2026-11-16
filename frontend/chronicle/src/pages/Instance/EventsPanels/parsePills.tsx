import { useMemo } from "react";
import type { ParsePillData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { useInstanceParses } from "@/api/rankingsQueries";
import { useSyncModeContextOptional } from "../SyncModeContext";
import { useTimeRangeContextOptional } from "../TimeRangeContext";
import { parseHexColor, parseColor } from "../parseColors";
import { cn } from "@/lib/utils";
import type { InstanceParsePlayer, InstanceParseBoss, InstanceParseInvalidation, InstanceParsesResponse } from "@/api/typesGenerated";
import type { PanelRenderProps } from "./types";
import { Ban } from "lucide-react";

// ── Shared types ──

export type ParseMetric = "dps" | "hps";

interface ParsePillsOptions {
  /** Which metric to fetch parses for. */
  metric: ParseMetric;
  /** The panel render props — used for context, instance, hasCustomFilters. */
  props: Pick<PanelRenderProps<unknown>, "context" | "hasCustomFilters">;
  /** Whether the source type is "players" (pills only make sense for players). */
  isPlayerSource: boolean;
  /** Whether a player is focused (ability-breakdown view). */
  isFocused: boolean;
}

// ── Tooltip components ──

function metricLabel(metric: ParseMetric): string {
  return metric === "hps" ? "HPS" : "DPS";
}

/** "Fury Warrior" in spec mode, "Warrior" in class mode. */
export function cohortBucketLabel(player: InstanceParsePlayer, cohortMode: string): string {
  if (cohortMode === "class" || !player.player_spec) return player.player_class;
  const spec = player.player_sub_spec ? `${player.player_spec} (${player.player_sub_spec})` : player.player_spec;
  return `${spec} ${player.player_class}`;
}

// eslint-disable-next-line react-refresh/only-export-components -- internal tooltip, not a standalone module component
function ParsePillTooltipSingle({
  boss,
  player,
  cohortMode,
  metric,
}: {
  boss: InstanceParseBoss;
  player: InstanceParsePlayer;
  cohortMode: string;
  metric: ParseMetric;
}) {
  const isLow = boss.status === "low_confidence";
  return (
    <div className="space-y-1">
      <p className="font-medium">{boss.encounter_name}</p>
      <p className="text-xs">
        <span className={cn("font-mono font-bold", parseColor(boss.display_score))}>
          {boss.display_score}
        </span>
        {" "}· Score {boss.precise_score.toFixed(1)}
      </p>
      <p className="text-xs text-zinc-400">
        {boss.metric_value.toFixed(1)} {metricLabel(metric)} · {cohortBucketLabel(player, cohortMode)} · {boss.sample_size} kills in cohort
      </p>
      {isLow && (
        <p className="text-xs text-yellow-400">Low confidence (small sample)</p>
      )}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- internal tooltip, not a standalone module component
function PerformanceInvalidationDetails({
  invalidation,
}: {
  invalidation: InstanceParseInvalidation;
}) {
  return (
    <div className="space-y-1">
      <p className="flex items-center gap-1 font-medium text-red-400">
        <Ban className="h-3.5 w-3.5" />
        Performance invalidated
      </p>
      <p className="text-xs text-zinc-300">{invalidation.encounter_name}</p>
      <p className="text-xs text-zinc-400">{invalidation.reason}</p>
      <p className="text-[11px] text-zinc-500">
        Invalidated {new Date(invalidation.invalidated_at).toLocaleString()}
      </p>
      <p className="text-[11px] text-zinc-500">
        This performance does not contribute to parses or rankings.
      </p>
    </div>
  );
}

function buildInvalidationPill(invalidation: InstanceParseInvalidation): ParsePillData {
  return {
    displayScore: <Ban className="h-3 w-3" aria-hidden="true" />,
    ariaLabel: `Performance invalidated for ${invalidation.encounter_name}`,
    color: "#f87171",
    tooltipContent: <PerformanceInvalidationDetails invalidation={invalidation} />,
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- internal tooltip, not a standalone module component
function ParsePillTooltipMulti({
  player,
  encounterNames,
  average,
  cohortMode,
  metric,
  invalidations,
}: {
  player: InstanceParsePlayer;
  encounterNames: readonly string[];
  average: NonNullable<InstanceParsePlayer["average_parse"]>;
  cohortMode: string;
  metric: ParseMetric;
  invalidations: ReadonlyMap<string, InstanceParseInvalidation>;
}) {
  // metric is accepted for future use but multi-boss tooltip doesn't show per-boss metric values
  void metric;
  const bossMap = new Map(player.bosses.map((b) => [b.encounter_name, b]));
  return (
    <div className="space-y-1">
      <p className="font-medium">
        Average Parse{" "}
        <span className={cn("font-mono font-bold", parseColor(average.display_score))}>
          {average.display_score}
        </span>
        <span className="text-xs text-zinc-500 ml-1">
          · {average.killed}/{average.selected}
        </span>
      </p>
      <p className="text-xs text-zinc-400">{cohortBucketLabel(player, cohortMode)}</p>
      <div className="space-y-0.5 pt-0.5">
        {encounterNames.map((enc) => {
          const b = bossMap.get(enc);
          const invalidation = invalidations.get(enc);
          return (
            <div key={enc} className="text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-300">{enc}</span>
                {invalidation ? (
                  <span className="flex items-center gap-1 text-red-400">
                    <Ban className="h-3 w-3" />
                    Invalidated
                  </span>
                ) : b ? (
                  <span className={cn("font-mono", parseColor(b.display_score))}>
                    {b.display_score}
                  </span>
                ) : (
                  <span className="text-zinc-500">—</span>
                )}
              </div>
              {invalidation && (
                <p className="max-w-56 text-[11px] text-zinc-500">{invalidation.reason}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Pill builder ──

function buildParsePill(
  player: InstanceParsePlayer,
  selectedEncounters: readonly string[],
  singleBoss: boolean,
  cohortMode: string,
  metric: ParseMetric,
  invalidations: ReadonlyMap<string, InstanceParseInvalidation>,
): ParsePillData | null {
  if (singleBoss) {
    const invalidation = invalidations.get(selectedEncounters[0]);
    if (invalidation) return buildInvalidationPill(invalidation);
    if (player.status === "unknown_spec") return null;

    const boss = player.bosses.find((b) => b.encounter_name === selectedEncounters[0]);
    // Only render a pill for actually-scored performances. "ok" and
    // "low_confidence" are the two scored statuses; anything else
    // (sample_too_small, no_metric_value, unknown/empty) has no score and a
    // pill would misleadingly display 0.
    if (!boss || (boss.status !== "ok" && boss.status !== "low_confidence")) return null;
    return {
      displayScore: boss.display_score,
      color: parseHexColor(boss.display_score),
      subSpec: player.player_sub_spec,
      tooltipContent: <ParsePillTooltipSingle boss={boss} player={player} cohortMode={cohortMode} metric={metric} />,
    };
  }

  // Multi-boss: show average parse and annotate any invalidated encounter rows.
  if (player.status === "unknown_spec" && invalidations.size === 0) return null;
  if (!player.average_parse) {
    const firstInvalidation = invalidations.values().next().value;
    return firstInvalidation ? buildInvalidationPill(firstInvalidation) : null;
  }
  const avg = player.average_parse;
  return {
    displayScore: avg.display_score,
    color: parseHexColor(avg.display_score),
    subSpec: player.player_sub_spec,
    tooltipContent: (
      <ParsePillTooltipMulti
        player={player}
        encounterNames={selectedEncounters}
        average={avg}
        cohortMode={cohortMode}
        metric={metric}
        invalidations={invalidations}
      />
    ),
  };
}

export function buildParsePillMap(
  parsesData: InstanceParsesResponse,
  metric: ParseMetric,
): Map<string, ParsePillData> | undefined {
  if (!parsesData.available) return undefined;

  const singleBoss = parsesData.selected_encounters.length === 1;
  const pills = new Map<string, ParsePillData>();
  const invalidationsByPlayer = new Map<string, Map<string, InstanceParseInvalidation>>();

  for (const invalidation of parsesData.invalidations ?? []) {
    let byEncounter = invalidationsByPlayer.get(invalidation.player_guid);
    if (!byEncounter) {
      byEncounter = new Map();
      invalidationsByPlayer.set(invalidation.player_guid, byEncounter);
    }
    byEncounter.set(invalidation.encounter_name, invalidation);
  }

  for (const player of parsesData.players) {
    const pill = buildParsePill(
      player,
      parsesData.selected_encounters,
      singleBoss,
      parsesData.cohort_mode,
      metric,
      invalidationsByPlayer.get(player.player_guid) ?? new Map(),
    );
    if (pill) pills.set(player.player_guid, pill);
  }

  // A player whose only selected performance was invalidated no longer has a
  // ranking row, so ensure the marker still appears on their event-data row.
  for (const [playerGUID, invalidations] of invalidationsByPlayer) {
    if (pills.has(playerGUID)) continue;
    const firstInvalidation = invalidations.values().next().value;
    if (firstInvalidation) pills.set(playerGUID, buildInvalidationPill(firstInvalidation));
  }

  return pills.size > 0 ? pills : undefined;
}

// ── Hook ──

/**
 * Fetch instance parses and build a GUID→ParsePillData map.
 *
 * Returns `undefined` when pills should not be shown (custom filters, focus,
 * sync mode, time range, enemy selection, non-player source).
 */
export function useParsePills({
  metric,
  props,
  isPlayerSource,
  isFocused,
}: ParsePillsOptions): Map<string, ParsePillData> | undefined {
  const { context } = props;

  // Resolve selected boss encounter names (kills only)
  const selectedBossEncounterNames = useMemo(() => {
    return context.instance.encounters
      .filter((e) => e.boss && e.kill_type !== "wipe" && e.kill_type !== "reset")
      .filter((e) => context.selectedEncounterIds.includes(e.id))
      .map((e) => e.name);
  }, [context.instance.encounters, context.selectedEncounterIds]);

  // Parse pills compare full-encounter values against the snapshot cohort, so
  // hide them whenever the displayed values no longer represent the full
  // encounter: live sync mode (partial playback), an active time-range
  // selection, or an enemy selection (damage vs those enemies only).
  const syncMode = useSyncModeContextOptional();
  const timeRange = useTimeRangeContextOptional();
  const timeRangeActive =
    !!timeRange?.enabled && (timeRange.startOffsetMs != null || timeRange.endOffsetMs != null);
  const enemySelected = context.entitySelection.enemyIds.size > 0;
  const showParsePills =
    !context.instance.unlisted &&
    isPlayerSource &&
    !props.hasCustomFilters &&
    !isFocused &&
    !syncMode?.enabled &&
    !timeRangeActive &&
    !enemySelected;

  const { data: parsesData } = useInstanceParses({
    instanceId: context.instance.id,
    encounterNames: selectedBossEncounterNames,
    metric,
    enabled: showParsePills && selectedBossEncounterNames.length > 0,
  });

  return useMemo(
    () => showParsePills && parsesData ? buildParsePillMap(parsesData, metric) : undefined,
    [showParsePills, parsesData, metric],
  );
}
