import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { RowContextMenu, getArmoryUrl } from "@/components/ui/PlayerMetricChart/RowContextMenu";
import { AbilityBreakout, type AbilityData } from "@/components/ui/AbilityBreakout";
import { GenericPanel } from "../GenericPanel";
import type { EntitySelection, PanelRenderProps } from "../types";
import {
  EXCLUDE_UNRANKED_DAMAGE_OPTION,
  type DamageDoneResult,
  type DamageSourceType,
} from "./damageDone.processor";
import { extractGroupingFromPanelOption, extractPetModeFromPanelOption } from "../processors/resolveEntity";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useDamageDoneBreakout, withExcludedHitDetails } from "./DamageDoneBreakout";
import { formatNumber } from "@/lib/format";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { AlertTriangle, ChevronLeft, Layers, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { useParsePills } from "../parsePills";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { isMeterBarsOption, isMeterValuesOption, parseMetricPanelLiveState, updateMetricPanelLiveState } from "../metricPanelLiveState";
import { MeterBars } from "../MeterBars";

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

function togglePanelOptionFlag(
  current: string | null | undefined,
  flag: string,
  enabled: boolean,
): string | null {
  const tokens = current?.split(",").filter(Boolean) ?? [];
  const next = tokens.filter((token) => token !== flag);
  if (enabled) next.push(flag);
  return next.length > 0 ? next.join(",") : null;
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
    const encounterExcluded = result.EncounterExcludedDamage?.get(encounterId);
    const playerIds = new Set([
      ...(encounterDamage?.keys() ?? []),
      ...(encounterExcluded?.keys() ?? []),
    ]);

    for (const playerId of playerIds) {
      const data = encounterDamage?.get(playerId) ?? encounterExcluded?.get(playerId);
      if (!data) continue;

      const damageValue = Array.from(encounterDamage?.get(playerId)?.target.values() ?? [])
        .reduce((sum, amount) => sum + amount, 0);
      const excludedValue = Array.from(encounterExcluded?.get(playerId)?.target.values() ?? [])
        .reduce((sum, amount) => sum + amount, 0);
      if (damageValue === 0 && excludedValue === 0) continue;

      const existing = aggregated.get(playerId);
      if (existing) {
        existing.value += damageValue;
        existing.stackedValue = (existing.stackedValue ?? 0) + excludedValue;
      } else {
        aggregated.set(playerId, {
          playerID: data.playerID,
          playerName: data.playerName,
          className: data.className,
          specialization: data.specialization,
          value: damageValue,
          stackedValue: excludedValue || undefined,
          dimmed: hasSubjectSelection && !subjects.has(playerId),
        });
      }
    }
  }
  
  return Array.from(aggregated.values());
}


interface DamageDoneContentProps extends PanelRenderProps<DamageDoneResult> {
  sourceType?: DamageSourceType;
  /** When provided, bypasses useParsePills and uses these pills directly. */
  parsePillsOverride?: Map<string, import("@/components/ui/PlayerMetricChart/PlayerMetricChart").ParsePillData>;
  /** When provided, bypasses spell API queries in the breakout (keyed by spell ID). */
  spellDataOverride?: Map<number, import("@/api/wowdb").WoWSpell>;
}

export const DamageDoneContent = (props: DamageDoneContentProps) => {
  const { sourceType = "players" } = props;
  const { result, context, panelOption, setPanelOption } = props;
  const syncMode = useSyncModeContextOptional();

  // Durable display state is encoded in panelOption, which is keyed by panel ID
  // in shared live-session snapshots.
  const { focusedEntityId: focusedPlayerId, showRanks } = useMemo(
    () => parseMetricPanelLiveState(panelOption),
    [panelOption],
  );
  const excludeUnrankedDamage = panelOption?.split(",").includes(EXCLUDE_UNRANKED_DAMAGE_OPTION) === true;
  const groupingDefault = sourceType === "pets" ? "default" : "merged";
  const grouping = extractGroupingFromPanelOption(panelOption, groupingDefault);
  const petMode = extractPetModeFromPanelOption(panelOption);

  const replayingAssembly = sourceType === "players"
    && syncMode?.enabled === true
    && context.instance.encounters.some(
      (encounter) => encounter.name === "Assembly of Iron"
        && context.selectedEncounterIds.includes(encounter.id),
    );

  // Map standard token values to display-level names used in this component
  const enemyGrouping = grouping;
  const petGrouping = petMode === "individual" ? "pet" : petMode === "name" ? "pet_name" : "owner";

  const setFocusedPlayerId = useCallback((id: string | null) => {
    if (!setPanelOption) return;
    setPanelOption(updateMetricPanelLiveState(panelOption, { focusedEntityId: id }));
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
    (r) => !!r && r.EncounterDamage instanceof Map && (
      r.EncounterDamage.size > 0 || (r.EncounterExcludedDamage?.size ?? 0) > 0
    ),
    [sourceType, petGrouping, enemyGrouping, excludeUnrankedDamage, props.panelContextVersion]
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
    spellDataOverride: props.spellDataOverride,
  });

  // ── Parse pills ──
  const liveParsePills = useParsePills({
    metric: "dps",
    props,
    isPlayerSource: sourceType === "players",
    isFocused: !!focusedPlayerId,
  });
  // Use override if provided (e.g. in explainer example mode)
  const parsePills = props.parsePillsOverride ?? liveParsePills;

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
    const excludedAbilities = cachedResult.ExcludedByAbility?.get(focusedPlayerId);
    if (!abilities && !excludedAbilities) return null;

    const barClassName = focusedPlayer?.className ?? "foreground";
    const abilityNames = new Set([
      ...(abilities?.keys() ?? []),
      ...(excludedAbilities?.keys() ?? []),
    ]);
    const data: PlayerMetricChartData[] = [];
    for (const abilityName of abilityNames) {
      const included = abilities?.get(abilityName)?.Total ?? 0;
      const excluded = excludedAbilities?.get(abilityName)?.Total ?? 0;
      data.push({
        playerID: abilityName,
        playerName: abilityName,
        className: barClassName,
        specialization: "",
        value: included,
        stackedValue: excluded || undefined,
      });
    }
    return data.sort((a, b) => b.value - a.value);
  }, [focusedPlayerId, cachedResult, focusedPlayer?.className]);

  // Breakout for focused view: clicking an ability bar shows its hit-type detail
  const focusedBreakout = useCallback(
    (abilityName: string, pinned: boolean) => {
      if (!focusedPlayerId || !cachedResult) return null;
      const abilityData = cachedResult.ByAbility.get(focusedPlayerId)?.get(abilityName);
      const excludedAbilityData = cachedResult.ExcludedByAbility?.get(focusedPlayerId)?.get(abilityName);
      if (!abilityData && !excludedAbilityData) return null;

      const included = abilityData ?? {
        Total: 0,
        Count: 0,
        Crits: 0,
        Hits: 0,
        Misses: 0,
      };
      const combined = withExcludedHitDetails(included, excludedAbilityData);
      const perSec = props.perSecond && props.durationMs;
      const rawDamage = included.Total - (included.Absorbed || 0);
      const displayRawDamage = perSec ? (rawDamage / props.durationMs) * 1000 : rawDamage;
      const displayAbsorbed = perSec
        ? ((included.Absorbed || 0) / props.durationMs) * 1000
        : included.Absorbed;
      const displayExcluded = perSec
        ? ((excludedAbilityData?.Total || 0) / props.durationMs) * 1000
        : excludedAbilityData?.Total;
      const displayTotal = perSec ? (included.Total / props.durationMs) * 1000 : included.Total;

      const singleAbility: AbilityData[] = [{
        ...combined,
        name: abilityName,
        value: displayRawDamage,
        absorbed: displayAbsorbed,
        overheal: displayExcluded,
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
          showAbsorbed
          absorbedIsAdditive
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

  const meterValues = isMeterValuesOption(panelOption);
  if (meterValues || isMeterBarsOption(panelOption)) {
    // Same encounter selection: the preset switch keeps it.
    const openDamage = context.onApplyPreset ? () => context.onApplyPreset?.("damage") : undefined;
    const durationMs = props.durationMs;
    const values = meterValues
      ? { formatValue: (value: number) => (props.perSecond && durationMs ? formatNumber(value / (durationMs / 1000), 1) : formatNumber(value, 0)) }
      : undefined;
    return (
      <GenericPanel {...effectiveProps}>
        <MeterBars data={damageData} onOpen={openDamage} openLabel="Open the Damage tab" values={values} />
      </GenericPanel>
    );
  }

  return (
    <GenericPanel {...effectiveProps}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">
          Total: <span className="font-medium font-mono text-foreground">{displayTotal}{props.perSecond ? '/s' : ''}</span>
        </div>
        
        <div className="flex items-center gap-2">
          {replayingAssembly && (
            <TooltipProvider>
              <Tooltip delayDuration={200}>
                <TooltipTrigger asChild>
                  <span className="inline-flex text-amber-400" aria-label="Assembly replay damage warning">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[260px]">
                  <p className="text-xs">
                    Replay shows raw Assembly damage. Exit replay to see ranking damage with excluded damage separated.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {sourceType === "players" && (
            <TooltipProvider>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setPanelOption?.(togglePanelOptionFlag(
                      panelOption,
                      EXCLUDE_UNRANKED_DAMAGE_OPTION,
                      !excludeUnrankedDamage,
                    ))}
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                      excludeUnrankedDamage
                        ? "bg-[color:var(--tertiary)]/20 text-[color:var(--tertiary)] border border-[color:var(--tertiary)]/30"
                        : "bg-muted/50 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Trophy className="h-3 w-3" />
                    Ranked
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[280px] space-y-1 text-xs">
                  <p className="font-medium">Damage that counts toward encounter rankings</p>
                  <p>When on, damage to non-ranking targets and overkill move to Excluded. Absorbed damage still counts.</p>
                  <p>Turn off to show all damage together. Hit counts and crit stats always reflect the original hits.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Show ranks toggle */}
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setPanelOption?.(updateMetricPanelLiveState(panelOption, { showRanks: !showRanks }))}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                    showRanks
                      ? "bg-[color:var(--tertiary)]/20 text-[color:var(--tertiary)] border border-[color:var(--tertiary)]/30"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                  data-lesson-target="spell-ranks"
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
          animateValues={!syncMode?.enabled}
          breakout={focusedBreakout}
          stackedLabel="Excluded"
          disableInteractions={props.context.renderMode === "layout_lab"}
        />
      ) : (
        <PlayerMetricChart
          data={damageData}
          type="damage"
          panelTitle="Damage Done"
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          animateValues={!syncMode?.enabled}
          breakout={breakout}
          stackedLabel="Excluded"
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