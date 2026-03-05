import { useMemo, useState, useCallback } from "react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import type { ResourceRegenResult, ResourceType, PlayerResourceData } from "./resourceRegen.processor";
import { ALL_RESOURCE_TYPES } from "./resourceRegen.processor";
import { useCachedValue } from "@/hooks/useCachedValue";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { Droplet, Flame, Zap, Heart, Smile, Target } from "lucide-react";

// ============================================================================
// Resource Type Icons & Colors
// ============================================================================

interface ResourceConfig {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  chartType: "damage" | "healing" | "taken" | "mitigation";
}

const RESOURCE_CONFIG: Record<ResourceType, ResourceConfig> = {
  Mana: {
    icon: <Droplet className="h-3.5 w-3.5" />,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500",
    chartType: "healing", // Blue-ish
  },
  Rage: {
    icon: <Flame className="h-3.5 w-3.5" />,
    color: "text-red-400",
    bgColor: "bg-red-500/20",
    borderColor: "border-red-500",
    chartType: "damage", // Red
  },
  Energy: {
    icon: <Zap className="h-3.5 w-3.5" />,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20",
    borderColor: "border-yellow-500",
    chartType: "mitigation", // Yellow-ish
  },
  Health: {
    icon: <Heart className="h-3.5 w-3.5" />,
    color: "text-green-400",
    bgColor: "bg-green-500/20",
    borderColor: "border-green-500",
    chartType: "healing", // Green
  },
  Happiness: {
    icon: <Smile className="h-3.5 w-3.5" />,
    color: "text-pink-400",
    bgColor: "bg-pink-500/20",
    borderColor: "border-pink-500",
    chartType: "healing",
  },
  Focus: {
    icon: <Target className="h-3.5 w-3.5" />,
    color: "text-orange-400",
    bgColor: "bg-orange-500/20",
    borderColor: "border-orange-500",
    chartType: "damage",
  },
};

// Primary resources most users care about
const PRIMARY_RESOURCES: ResourceType[] = ["Mana", "Rage", "Energy", "Health"];

// ============================================================================
// Resource Type Selector
// ============================================================================

interface ResourceTypeSelectorProps {
  selectedType: ResourceType;
  onChange: (type: ResourceType) => void;
  availableTypes: Set<ResourceType>;
}

function ResourceTypeSelector({ selectedType, onChange, availableTypes }: ResourceTypeSelectorProps) {
  // Show primary resources first, then others if they have data
  const visibleTypes = PRIMARY_RESOURCES.filter(t => availableTypes.has(t));
  const otherTypes = ALL_RESOURCE_TYPES.filter(t => !PRIMARY_RESOURCES.includes(t) && availableTypes.has(t));
  const allVisible = [...visibleTypes, ...otherTypes];

  if (allVisible.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {allVisible.map((type) => {
        const config = RESOURCE_CONFIG[type];
        const isSelected = type === selectedType;
        
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer",
              "border",
              isSelected
                ? cn(config.bgColor, config.borderColor, config.color)
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
            title={type}
          >
            {config.icon}
            <span className="hidden sm:inline">{type}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Ability Breakdown Table
// ============================================================================

interface AbilityBreakdownProps {
  playerData: PlayerResourceData;
  resourceType: ResourceType;
}

function AbilityBreakdownTable({ playerData, resourceType }: AbilityBreakdownProps) {
  const config = RESOURCE_CONFIG[resourceType];
  const abilities = Array.from(playerData.byAbility.values())
    .sort((a, b) => b.gained - a.gained);

  if (abilities.length === 0) {
    return <p className="text-xs p-2 text-muted-foreground">No ability breakdown available</p>;
  }

  return (
    <ScrollArea className="max-h-panel">
      <table className="w-full text-xs text-foreground">
        <thead className="sticky top-0 bg-popover">
          <tr className="border-b border-border">
            <th className="text-left py-1.5 px-2 font-medium">Ability</th>
            <th className="text-right py-1.5 px-2 font-medium">Count</th>
            <th className={cn("text-right py-1.5 px-2 font-medium", config.color)}>Gained</th>
            <th className="text-right py-1.5 px-2 font-medium text-red-400">Lost</th>
            <th className="text-right py-1.5 px-2 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {abilities.map((ability) => {
            const gainPercent = playerData.totalGained > 0 
              ? (ability.gained / playerData.totalGained) * 100 
              : 0;
            const avgPerProc = ability.gainCount > 0 
              ? Math.round(ability.gained / ability.gainCount) 
              : 0;
            
            return (
              <tr key={ability.abilityName} className="border-b border-border/10 hover:bg-muted/50">
                <td className="py-1 px-2 max-w-[140px] truncate" title={ability.abilityName}>
                  {ability.abilityName}
                </td>
                <td 
                  className="text-right py-1 px-2 font-mono text-muted-foreground"
                  title={`${ability.gainCount} procs, ~${formatNumber(avgPerProc, 0)} avg per proc`}
                >
                  {ability.gainCount.toLocaleString()}
                  {ability.lossCount > 0 && (
                    <span className="text-red-400/70"> / {ability.lossCount.toLocaleString()}</span>
                  )}
                </td>
                <td className={cn("text-right py-1 px-2 font-mono", config.color)}>
                  {formatNumber(ability.gained, 0)}
                </td>
                <td className="text-right py-1 px-2 font-mono text-red-400">
                  {ability.lost > 0 ? formatNumber(ability.lost, 0) : "-"}
                </td>
                <td className="text-right py-1 px-2 font-mono text-muted-foreground">
                  {gainPercent.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollArea>
  );
}

// ============================================================================
// Breakout Component
// ============================================================================

interface ResourceRegenBreakoutProps {
  playerData: PlayerResourceData;
  resourceType: ResourceType;
}

function ResourceRegenBreakout({ playerData, resourceType }: ResourceRegenBreakoutProps) {
  const config = RESOURCE_CONFIG[resourceType];
  const tabClass = "px-2 py-1 text-2xs font-medium transition-colors";
  const activeTabClass = "text-foreground border-b-2 border-foreground";

  return (
    <div>
      <div className="flex items-center border-b border-border">
        <span className={cn(tabClass, activeTabClass)}>By Ability</span>
        <span className="text-2xs ml-auto pr-1.5 text-muted-foreground">
          Total: <span className={cn("font-medium font-mono", config.color)}>
            {formatNumber(playerData.totalGained, 0)}
          </span> {resourceType.toLowerCase()}
        </span>
      </div>
      <AbilityBreakdownTable playerData={playerData} resourceType={resourceType} />
    </div>
  );
}

// ============================================================================
// Aggregation
// ============================================================================

/**
 * Aggregate resource data across selected encounters for a specific resource type.
 */
function aggregateForEncounters(
  result: ResourceRegenResult,
  selectedEncounterIds: string[],
  selectedPlayerIds: Set<string>,
  resourceType: ResourceType,
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData & { totalGained: number }>();

  for (const encounterId of selectedEncounterIds) {
    const encounterData = result.encounterData.get(encounterId);
    if (!encounterData) continue;

    for (const [playerId, playerResources] of encounterData) {
      const resourceData = playerResources.get(resourceType);
      if (!resourceData) continue;

      const existing = aggregated.get(playerId);
      if (existing) {
        existing.value += resourceData.totalGained;
        existing.totalGained += resourceData.totalGained;
      } else {
        const dimmed = selectedPlayerIds.size > 0 && !selectedPlayerIds.has(playerId);
        aggregated.set(playerId, {
          playerID: resourceData.playerID,
          playerName: resourceData.playerName,
          className: resourceData.className,
          specialization: "",
          value: resourceData.totalGained,
          totalGained: resourceData.totalGained,
          dimmed,
        });
      }
    }
  }

  return Array.from(aggregated.values());
}

/**
 * Get all resource types that have data in the result.
 */
function getAvailableResourceTypes(
  result: ResourceRegenResult,
  selectedEncounterIds: string[],
): Set<ResourceType> {
  const available = new Set<ResourceType>();

  for (const encounterId of selectedEncounterIds) {
    const encounterData = result.encounterData.get(encounterId);
    if (!encounterData) continue;

    for (const playerResources of encounterData.values()) {
      for (const resourceType of playerResources.keys()) {
        available.add(resourceType);
      }
    }
  }

  return available;
}

/**
 * Get aggregated resource data for a specific player.
 */
function getPlayerResourceData(
  result: ResourceRegenResult,
  playerID: string,
  selectedEncounterIds: string[],
  resourceType: ResourceType,
): PlayerResourceData | null {
  let totalGained = 0;
  let totalLost = 0;
  const byAbility = new Map<string, { abilityName: string; gained: number; lost: number; gainCount: number; lossCount: number }>();
  const bySource = new Map<string, number>();
  let playerName = "";
  let className = "";

  for (const encounterId of selectedEncounterIds) {
    const encounterData = result.encounterData.get(encounterId);
    if (!encounterData) continue;

    const playerResources = encounterData.get(playerID);
    if (!playerResources) continue;

    const resourceData = playerResources.get(resourceType);
    if (!resourceData) continue;

    playerName = resourceData.playerName;
    className = resourceData.className;
    totalGained += resourceData.totalGained;
    totalLost += resourceData.totalLost;

    for (const [abilityName, abilityData] of resourceData.byAbility) {
      const existing = byAbility.get(abilityName) || { abilityName, gained: 0, lost: 0, gainCount: 0, lossCount: 0 };
      existing.gained += abilityData.gained;
      existing.lost += abilityData.lost;
      existing.gainCount += abilityData.gainCount;
      existing.lossCount += abilityData.lossCount;
      byAbility.set(abilityName, existing);
    }

    for (const [sourceName, amount] of resourceData.bySource) {
      bySource.set(sourceName, (bySource.get(sourceName) || 0) + amount);
    }
  }

  if (totalGained === 0 && totalLost === 0) return null;

  return {
    playerID,
    playerName,
    className,
    totalGained,
    totalLost,
    byAbility,
    bySource,
  };
}

// ============================================================================
// Main Content Component
// ============================================================================

type ResourceRegenContentProps = PanelRenderProps<ResourceRegenResult>;

export const ResourceRegenContent = (props: ResourceRegenContentProps) => {
  const { result, context, loading, processing } = props;
  const [selectedResourceType, setSelectedResourceType] = useState<ResourceType>("Mana");

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.encounterData instanceof Map && r.encounterData.size > 0,
    [props.panelContextVersion]
  );

  // Get available resource types
  const availableTypes = useMemo(() => {
    if (!cachedResult) return new Set<ResourceType>();
    return getAvailableResourceTypes(cachedResult, context.selectedEncounterIds);
  }, [cachedResult, context.selectedEncounterIds]);

  // Derive effective resource type: use selection if available, otherwise fall back
  const effectiveResourceType = useMemo((): ResourceType => {
    // If user's selection is available, use it
    if (availableTypes.has(selectedResourceType)) {
      return selectedResourceType;
    }
    // Otherwise, prefer primary resources
    for (const type of PRIMARY_RESOURCES) {
      if (availableTypes.has(type)) {
        return type;
      }
    }
    // Fall back to first available or default to Mana
    const firstAvailable = availableTypes.values().next().value;
    return firstAvailable ?? "Mana";
  }, [availableTypes, selectedResourceType]);

  const resourceData = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(
      cachedResult,
      context.selectedEncounterIds,
      context.entitySelection.playerIds,
      effectiveResourceType
    );
  }, [cachedResult, context.selectedEncounterIds, context.entitySelection.playerIds, effectiveResourceType]);

  // Create breakout function for tooltips
  const breakout = useCallback(
    (playerID: string) => {
      if (loading || processing) {
        return (
          <div className="p-4 flex items-center justify-center text-xs text-muted-foreground min-w-[300px] min-h-[200px]">
            {loading ? "Loading..." : "Processing..."}
          </div>
        );
      }

      if (!cachedResult) {
        return <p className="text-xs p-2 text-muted-foreground">No breakdown available</p>;
      }

      const playerData = getPlayerResourceData(
        cachedResult,
        playerID,
        context.selectedEncounterIds,
        effectiveResourceType
      );

      if (!playerData) {
        return <p className="text-xs p-2 text-muted-foreground">No resource data</p>;
      }

      return <ResourceRegenBreakout playerData={playerData} resourceType={effectiveResourceType} />;
    },
    [cachedResult, context.selectedEncounterIds, effectiveResourceType, loading, processing]
  );

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  // Compute display total
  const total = resourceData.reduce((sum, d) => sum + d.value, 0);
  const displayTotal = props.perSecond && props.durationMs
    ? formatNumber(total / (props.durationMs / 1000), 1)
    : formatNumber(total, 0);

  const config = RESOURCE_CONFIG[effectiveResourceType];

  return (
    <GenericPanel {...effectiveProps}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-xs text-muted-foreground">
          Total: <span className={cn("font-medium font-mono", config.color)}>
            {displayTotal}{props.perSecond ? '/s' : ''}
          </span>
        </div>
        <ResourceTypeSelector
          selectedType={effectiveResourceType}
          onChange={setSelectedResourceType}
          availableTypes={availableTypes}
        />
      </div>
      <PlayerMetricChart
        data={resourceData}
        type={config.chartType}
        panelTitle={`${effectiveResourceType} Gains`}
        duration_millis={props.durationMs}
        perSecond={props.perSecond}
        breakout={breakout}
        disableInteractions={props.context.renderMode === "layout_lab"}
      />
    </GenericPanel>
  );
};
