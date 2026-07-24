import { useMemo } from "react";
import type { ParsePillData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { useInstanceParses } from "@/api/rankingsQueries";
import { useSyncModeContextOptional } from "../SyncModeContext";
import { useTimeRangeContextOptional } from "../TimeRangeContext";
import { parseHexColor, parseColor } from "../parseColors";
import { cn } from "@/lib/utils";
import type { InstanceParsePlayer, InstanceParseBoss } from "@/api/typesGenerated";
import type { PanelRenderProps } from "./types";

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
function cohortBucketLabel(player: InstanceParsePlayer, cohortMode: string): string {
  if (cohortMode === "class" || !player.player_spec) return player.player_class;
  return `${player.player_spec} ${player.player_class}`;
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
function ParsePillTooltipMulti({
  player,
  encounterNames,
  average,
  cohortMode,
  metric,
}: {
  player: InstanceParsePlayer;
  encounterNames: readonly string[];
  average: NonNullable<InstanceParsePlayer["average_parse"]>;
  cohortMode: string;
  metric: ParseMetric;
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
          return (
            <div key={enc} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-zinc-300">{enc}</span>
              {b ? (
                <span className={cn("font-mono", parseColor(b.display_score))}>
                  {b.display_score}
                </span>
              ) : (
                <span className="text-zinc-500">—</span>
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
): ParsePillData | null {
  if (player.status === "unknown_spec") return null;

  if (singleBoss) {
    const boss = player.bosses.find((b) => b.encounter_name === selectedEncounters[0]);
    if (!boss || boss.status === "sample_too_small") return null;
    return {
      displayScore: boss.display_score,
      color: parseHexColor(boss.display_score),
      tooltipContent: <ParsePillTooltipSingle boss={boss} player={player} cohortMode={cohortMode} metric={metric} />,
    };
  }

  // Multi-boss: show average parse
  if (!player.average_parse) return null;
  const avg = player.average_parse;
  return {
    displayScore: avg.display_score,
    color: parseHexColor(avg.display_score),
    tooltipContent: (
      <ParsePillTooltipMulti
        player={player}
        encounterNames={selectedEncounters}
        average={avg}
        cohortMode={cohortMode}
        metric={metric}
      />
    ),
  };
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

  return useMemo(() => {
    if (!showParsePills || !parsesData?.available || !parsesData.players.length) return undefined;

    const singleBoss = parsesData.selected_encounters.length === 1;
    const pills = new Map<string, ParsePillData>();

    for (const player of parsesData.players) {
      const pill = buildParsePill(player, parsesData.selected_encounters, singleBoss, parsesData.cohort_mode, metric);
      if (pill) {
        pills.set(player.player_guid, pill);
      }
    }
    return pills.size > 0 ? pills : undefined;
  }, [showParsePills, parsesData, metric]);
}
