import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayerMetricChart, type PlayerMetricChartData, type ParsePillData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { RowContextMenu, getArmoryUrl } from "@/components/ui/PlayerMetricChart/RowContextMenu";
import { AbilityBreakout, type AbilityData } from "@/components/ui/AbilityBreakout";
import { GenericPanel } from "../GenericPanel";
import type { EntitySelection, PanelRenderProps } from "../types";
import type { DamageDoneResult, DamageSourceType } from "./damageDone.processor";
import { extractGroupingFromPanelOption, extractPetModeFromPanelOption } from "../processors/resolveEntity";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useDamageDoneBreakout } from "./DamageDoneBreakout";
import { formatNumber } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { ChevronLeft, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { useInstanceParses } from "@/api/rankingsQueries";
import { parseHexColor, parseColor } from "../../parseColors";
import type { InstanceParsePlayer, InstanceParseBoss } from "@/api/typesGenerated";

// ── Panel option encoding ──
// panelOption is a comma-separated string of tokens stored in the URL.
// Standard tokens: g:<grouping>, p:<petMode>, f:<playerId>, bc:<color>, t:<title>
// Examples: null, "g:name", "p:individual,f:0xABC123"

const FOCUS_PREFIX = "f:";

function parseFocusFromOption(option: string | null | undefined): string | null {
  if (!option) return null;
  const token = option.split(",").find(t => t.startsWith(FOCUS_PREFIX));
  return token ? token.slice(FOCUS_PREFIX.length) : null;
}

/** Update a single token prefix in panelOption, preserving all other tokens. */
function updatePanelOptionToken(
  current: string | null | undefined,
  prefix: string,
  value: string | null,
): string | null {
  const tokens = current ? current.split(",").filter(t => !t.startsWith(prefix)) : [];
  if (value) tokens.push(`${prefix}${value}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}

/**
 * Aggregate damage data across selected encounters.
 * Merges per-encounter data into a single map by player.
 * 
 * - If selected.enemyIds is non-empty, only sum damage dealt to those targets
 * - If selected.playerIds is non-empty, dim players not in selection
 */
function aggregateForEncounters(
  sourceType: DamageSourceType,
  result: DamageDoneResult,
  selectedEncounterIds: string[],
  selected: EntitySelection,
  disableSubjectSelection = false,
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData>();
  
  // Determine which entity set controls the "dimmed" highlight.
  // Target filtering is handled by panel defaultFilters at the processor level.
  let subjects = selected.playerIds;
  if (sourceType === "enemies") {
    subjects = selected.enemyIds;
  }
  const hasSubjectSelection = !disableSubjectSelection && subjects.size > 0;
  
  for (const encounterId of selectedEncounterIds) {
    const encounterDamage = result.EncounterDamage.get(encounterId);
    if (!encounterDamage) continue;
    
    for (const [playerId, data] of encounterDamage) {
      // Sum all damage (target filtering handled by panel filters)
      let damageValue = 0;
      for (const amount of data.target.values()) {
        damageValue += amount;
      }
      
      // Skip players with zero damage after filtering
      if (damageValue === 0) continue;
      
      const existing = aggregated.get(playerId);
      if (existing) {
        existing.value += damageValue;
      } else {
        aggregated.set(playerId, {
          playerID: data.playerID,
          playerName: data.playerName,
          className: data.className,
          specialization: data.specialization,
          value: damageValue,
          dimmed: hasSubjectSelection && !subjects.has(playerId),
        });
      }
    }
  }
  
  return Array.from(aggregated.values());
}


// ── Parse pill builder ──

function buildParsePill(
  player: InstanceParsePlayer,
  selectedEncounters: readonly string[],
  singleBoss: boolean,
  cohortMode: string,
): ParsePillData | null {
  if (player.status === "unknown_spec") return null;

  if (singleBoss) {
    const boss = player.bosses.find((b) => b.encounter_name === selectedEncounters[0]);
    if (!boss || boss.status === "sample_too_small") return null;
    return {
      displayScore: boss.display_score,
      color: parseHexColor(boss.display_score),
      tooltipContent: <ParsePillTooltipSingle boss={boss} player={player} cohortMode={cohortMode} />,
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
      />
    ),
  };
}

/** "Fury Warrior" in spec mode, "Warrior" in class mode. */
function cohortBucketLabel(player: InstanceParsePlayer, cohortMode: string): string {
  if (cohortMode === "class" || !player.player_spec) return player.player_class;
  return `${player.player_spec} ${player.player_class}`;
}

function ParsePillTooltipSingle({
  boss,
  player,
  cohortMode,
}: {
  boss: InstanceParseBoss;
  player: InstanceParsePlayer;
  cohortMode: string;
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
        {boss.metric_value.toFixed(1)} DPS · {cohortBucketLabel(player, cohortMode)} · {boss.sample_size} in cohort
      </p>
      {isLow && (
        <p className="text-xs text-yellow-400">Low confidence (small sample)</p>
      )}
    </div>
  );
}

function ParsePillTooltipMulti({
  player,
  encounterNames,
  average,
  cohortMode,
}: {
  player: InstanceParsePlayer;
  encounterNames: readonly string[];
  average: NonNullable<InstanceParsePlayer["average_parse"]>;
  cohortMode: string;
}) {
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

interface DamageDoneContentProps extends PanelRenderProps<DamageDoneResult> {
  sourceType?: DamageSourceType;
}

export const DamageDoneContent = (props: DamageDoneContentProps) => {
  const { sourceType = "players" } = props;
  const { result, context, panelOption, setPanelOption } = props;
  const [showRanks, setShowRanks] = useState(true);

  // Derive focus, grouping, and pet mode from the URL-persisted panelOption tokens
  const focusedPlayerId = useMemo(() => parseFocusFromOption(panelOption), [panelOption]);
  const groupingDefault = sourceType === "pets" ? "default" : "merged";
  const grouping = extractGroupingFromPanelOption(panelOption, groupingDefault);
  const petMode = extractPetModeFromPanelOption(panelOption);

  // Map standard token values to display-level names used in this component
  const enemyGrouping = grouping;
  const petGrouping = petMode === "individual" ? "pet" : petMode === "name" ? "pet_name" : "owner";

  const setFocusedPlayerId = useCallback((id: string | null) => {
    if (!setPanelOption) return;
    setPanelOption(updatePanelOptionToken(panelOption, FOCUS_PREFIX, id));
  }, [setPanelOption, panelOption]);

  const setPetGrouping = (pg: "owner" | "pet" | "pet_name", base?: string | null) => {
    if (!setPanelOption) return;
    // Map display values back to standard p: token values
    const tokenValue = pg === "pet" ? "individual" : pg === "pet_name" ? "name" : null;
    const updated = updatePanelOptionToken(base !== undefined ? base : panelOption, "p:", tokenValue);
    setPanelOption(updated);
  };

  /** Update both grouping and pet mode in a single setPanelOption call. */
  const setGroupingAndPets = (eg: "default" | "merged" | "name", pg: "owner" | "pet" | "pet_name") => {
    if (!setPanelOption) return;
    const gValue = eg === groupingDefault ? null : eg;
    const pValue = pg === "pet" ? "individual" : pg === "pet_name" ? "name" : null;
    const withG = updatePanelOptionToken(panelOption, "g:", gValue);
    setPanelOption(updatePanelOptionToken(withG, "p:", pValue));
  };

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.EncounterDamage instanceof Map && r.EncounterDamage.size > 0,
    [sourceType, petGrouping, enemyGrouping, props.panelContextVersion]
  );

  const damageData = useMemo(() => {
    if (!cachedResult) return [];
    const disableSubjectSelection = sourceType === "enemies" && enemyGrouping === "name";
    return aggregateForEncounters(
      sourceType,
      cachedResult,
      context.selectedEncounterIds,
      context.entitySelection,
      disableSubjectSelection,
    );
  }, [sourceType, cachedResult, context.selectedEncounterIds, context.entitySelection, enemyGrouping]);

  // Create breakout function for tooltips
  const breakout = useDamageDoneBreakout({
    result: result,
    context: context,
    valueLabel: "Damage",
    perSecond: props.perSecond,
    durationMs: props.durationMs,
    loading: props.loading,
    processing: props.processing,
    showRanks,
  });

  // ── Parse pills: fetch parse data and build pill map for bar rows ──
  // Only fetch when no custom filters are active (filtered damage ≠ cohort values).
  const selectedBossEncounterNames = useMemo(() => {
    return context.instance.encounters
      .filter((e) => e.boss && e.kill_type !== "wipe" && e.kill_type !== "reset")
      .filter((e) => context.selectedEncounterIds.includes(e.id))
      .map((e) => e.name);
  }, [context.instance.encounters, context.selectedEncounterIds]);

  const showParsePills = sourceType === "players" && !props.hasCustomFilters && !focusedPlayerId;

  const { data: parsesData } = useInstanceParses({
    instanceId: context.instance.id,
    encounterNames: selectedBossEncounterNames,
    metric: "dps",
    // Don't fetch when pills can't render: filters active, focused view,
    // non-player source, or no boss encounters selected.
    enabled: showParsePills && selectedBossEncounterNames.length > 0,
  });

  const parsePills = useMemo(() => {
    if (!showParsePills || !parsesData?.available || !parsesData.players.length) return undefined;

    const singleBoss = parsesData.selected_encounters.length === 1;
    const pills = new Map<string, ParsePillData>();

    for (const player of parsesData.players) {
      const pill = buildParsePill(player, parsesData.selected_encounters, singleBoss, parsesData.cohort_mode);
      if (pill) {
        // Match by player GUID (the playerID in PlayerMetricChartData)
        pills.set(player.player_guid, pill);
      }
    }
    return pills.size > 0 ? pills : undefined;
  }, [showParsePills, parsesData]);

  // ── Focus feature: Ctrl+click a player row to show per-ability view ──

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; playerId: string; playerName: string
  } | null>(null);

  // Handler for Ctrl+click on player rows
  const handleRowCtrlClick = useCallback((playerId: string, event: React.MouseEvent) => {
    const playerName = damageData.find(d => d.playerID === playerId)?.playerName ?? playerId;
    setContextMenu({ x: event.clientX, y: event.clientY, playerId, playerName });
  }, [damageData]);

  // ESC key to unfocus
  useEffect(() => {
    if (!focusedPlayerId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedPlayerId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusedPlayerId, setFocusedPlayerId]);

  // Build per-ability data for the focused player
  const focusedPlayer = focusedPlayerId
    ? damageData.find(d => d.playerID === focusedPlayerId)
    : null;

  const focusedAbilityData = useMemo(() => {
    if (!focusedPlayerId || !cachedResult) return null;
    const abilities = cachedResult.ByAbility.get(focusedPlayerId);
    if (!abilities) return null;

    const barClassName = focusedPlayer?.className ?? "foreground";
    const data: PlayerMetricChartData[] = [];
    for (const [abilityName, stats] of abilities) {
      data.push({
        playerID: abilityName,
        playerName: abilityName,
        className: barClassName,
        specialization: "",
        value: stats.Total,
      });
    }
    return data.sort((a, b) => b.value - a.value);
  }, [focusedPlayerId, cachedResult, focusedPlayer?.className]);

  // Breakout for focused view: clicking an ability bar shows its hit-type detail
  const focusedBreakout = useCallback(
    (abilityName: string, pinned: boolean) => {
      if (!focusedPlayerId || !cachedResult) return null;
      const abilities = cachedResult.ByAbility.get(focusedPlayerId);
      if (!abilities) return null;
      const abilityData = abilities.get(abilityName);
      if (!abilityData) return null;

      const perSec = props.perSecond && props.durationMs;
      const rawTotal = abilityData.Total;
      const displayTotal = perSec ? (rawTotal / props.durationMs) * 1000 : rawTotal;

      const singleAbility: AbilityData[] = [{
        ...abilityData,
        name: abilityName,
        value: displayTotal,
      }];

      return (
        <AbilityBreakout
          abilities={singleAbility}
          targets={[]}
          totalValue={displayTotal}
          valueLabel={props.perSecond ? "DPS" : "Damage"}
          debugGuid={focusedPlayerId}
          pinned={pinned}
          activeTab="ability"
          onTabChange={() => {}}
        />
      );
    },
    [focusedPlayerId, cachedResult, props.perSecond, props.durationMs],
  );

  // Register chart data for cross-panel comparison (registers active view's data)
  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(focusedAbilityData ?? damageData);
  }, [registerChartData, focusedAbilityData, damageData]);

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  // Compute display total — use focused data when in focus mode
  const activeData = focusedAbilityData ?? damageData;
  const total = activeData.reduce((sum, d) => sum + d.value, 0);
  const displayTotal = props.perSecond && props.durationMs
    ? formatNumber(total / (props.durationMs / 1000), 1)
    : formatNumber(total, 0);

  return (
    <GenericPanel {...effectiveProps}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">
          Total: <span className="font-medium font-mono text-foreground">{displayTotal}{props.perSecond ? '/s' : ''}</span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Show ranks toggle */}
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowRanks(!showRanks)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                    showRanks
                      ? "bg-[color:var(--tertiary)]/20 text-[color:var(--tertiary)] border border-[color:var(--tertiary)]/30"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Layers className="h-3 w-3" />
                  Ranks
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px]">
                <p className="text-xs">Show spells separated by rank in the ability breakdown (e.g., Frostbolt Rank 4 vs Rank 11)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {sourceType === "enemies" && (
            <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setGroupingAndPets("merged", "owner")}
                className={cn(
                  "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                  enemyGrouping === "merged"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                Owners
              </button>
              <button
                type="button"
                onClick={() => setGroupingAndPets("default", "pet")}
                className={cn(
                  "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                  enemyGrouping === "default"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                By Unit
              </button>
              <button
                type="button"
                onClick={() => setGroupingAndPets("name", "pet_name")}
                className={cn(
                  "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                  enemyGrouping === "name"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                By Name
              </button>
            </div>
          )}

          {sourceType === "pets" && (
            <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
              <button
                type="button"
                onClick={() => setPetGrouping("owner")}
                className={cn(
                  "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                  petGrouping === "owner"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                By Owner
              </button>
              <button
                type="button"
                onClick={() => setPetGrouping("pet")}
                className={cn(
                  "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                  petGrouping === "pet"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                By Pet
              </button>
              <button
                type="button"
                onClick={() => setPetGrouping("pet_name")}
                className={cn(
                  "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                  petGrouping === "pet_name"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                By Pet Name
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Focus header with back button */}
      {focusedPlayerId && focusedAbilityData && (
        <div className="flex items-center gap-1.5 mb-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
            onClick={() => setFocusedPlayerId(null)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-xs font-medium">
            {focusedPlayer?.playerName}
          </span>
        </div>
      )}

      {/* Conditionally render focused ability view or normal player view */}
      {focusedPlayerId && focusedAbilityData ? (
        <PlayerMetricChart
          data={focusedAbilityData}
          type="damage"
          panelTitle="Ability Breakdown"
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          breakout={focusedBreakout}
          disableInteractions={props.context.renderMode === "layout_lab"}
        />
      ) : (
        <PlayerMetricChart
          data={damageData}
          type="damage"
          panelTitle="Damage Done"
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          breakout={breakout}
          onRowCtrlClick={handleRowCtrlClick}
          disableInteractions={props.context.renderMode === "layout_lab"}
          parsePills={parsePills}
        />
      )}

      {/* Ctrl+click context menu */}
      {contextMenu && (
        <RowContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          playerName={contextMenu.playerName}
          onFocus={() => setFocusedPlayerId(contextMenu.playerId)}
          onClose={() => setContextMenu(null)}
          armoryUrl={getArmoryUrl(props.context.instance, contextMenu.playerId)}
        />
      )}
    </GenericPanel>
  );
}