/**
 * Sunder Armor panel - Shows Sunder Armor effectiveness by Warriors.
 * 
 * Summary view: Shows each warrior's effective/ineffective sunders
 * Log view: Shows detailed breakdown of targets and time-to-5-stacks
 */

import { useCallback, useMemo } from "react";
import { Sword } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import {
  sunderProcessor,
  type SunderDebugEvent,
  type SunderResult,
  type WarriorSunderStats,
  type TargetSunderStats,
} from "./sunder.processor";
import { GenericPanel } from "../GenericPanel";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { cn } from "@/lib/utils";

/**
 * Format milliseconds to MM:SS.mmm format
 */
function formatTimeMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}.${millis.toString().padStart(3, "0")}`;
  }
  return `${seconds}.${millis.toString().padStart(3, "0")}s`;
}

/**
 * Create sorted array from warriors record
 */
function sortedWarriors(warriors: Record<string, WarriorSunderStats>): WarriorSunderStats[] {
  return Object.values(warriors).sort((a, b) => {
    // Sort by effective sunders descending
    return b.effectiveSunders - a.effectiveSunders;
  });
}

/**
 * Create sorted array from targets record
 */
function sortedTargets(targets: Record<string, TargetSunderStats>): TargetSunderStats[] {
  return Object.values(targets).sort((a, b) => {
    // Sort by time to 5 stacks (reached first), then by total sunders
    if (a.timeToFiveStacksMs !== null && b.timeToFiveStacksMs === null) return -1;
    if (a.timeToFiveStacksMs === null && b.timeToFiveStacksMs !== null) return 1;
    if (a.timeToFiveStacksMs !== null && b.timeToFiveStacksMs !== null) {
      return a.timeToFiveStacksMs - b.timeToFiveStacksMs;
    }
    return b.totalSunders - a.totalSunders;
  });
}

/**
 * Create the Sunder panel definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createSunderPanel(): PanelDefinition<SunderResult, any> {
  return {
    ...sunderProcessor,
    label: "Sunder Armor",
    icon: <Sword className="h-4 w-4" />,
    supportsPerSecond: false,
    checkboxLabel: "Show targets",
    
    render: (props: PanelRenderProps<SunderResult>) => {
      return <SunderContent {...props} />;
    },
  };
}

function SunderContent(props: PanelRenderProps<SunderResult>) {
  const { result, checkboxChecked: showTargets, panelOption, setPanelOption } = props;

  const selectedTargetGuid = useMemo(() => {
    if (!panelOption) {
      return null;
    }
    const targetToken = panelOption
      .split(",")
      .map((token) => token.trim())
      .find((token) => token.startsWith("target:"));

    return targetToken ? targetToken.slice("target:".length) : null;
  }, [panelOption]);

  const updateSelectedTargetGuid = useCallback((guid: string | null) => {
    if (!setPanelOption) {
      return;
    }

    const tokens: string[] = [];
    if (showTargets) {
      tokens.push("cb");
    }
    if (guid) {
      tokens.push(`target:${guid}`);
    }

    setPanelOption(tokens.length > 0 ? tokens.join(",") : null);
  }, [setPanelOption, showTargets]);

  const warriors = result ? sortedWarriors(result.warriors) : [];
  const targets = result ? sortedTargets(result.targets) : [];

  const hasData = warriors.length > 0;

  return (
    <GenericPanel {...props}>
      {!hasData ? (
        <div className="text-center py-2 text-muted-foreground text-sm">
          No Sunder Armor casts found
        </div>
      ) : showTargets ? (
        /* Targets view - shows time to 5 stacks and contributors */
        <TargetsView
          targets={targets}
          selectedTargetGuid={selectedTargetGuid}
          onSelectTargetGuid={updateSelectedTargetGuid}
        />
      ) : (
        /* Summary view - shows warrior effectiveness */
        <WarriorsView warriors={warriors} />
      )}
    </GenericPanel>
  );
}

interface WarriorsViewProps {
  warriors: WarriorSunderStats[];
}

function WarriorsView({ warriors }: WarriorsViewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col" data-sunder-warriors>
      <ScrollArea className="min-h-0 flex-1">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-1.5 px-2 font-medium">Warrior</th>
              <th className="text-right py-1.5 px-2 font-medium">
                <span className="cursor-help" title="Counted towards the first 5 stacks on a target">Effective</span>
              </th>
              <th className="text-right py-1.5 px-2 font-medium">
                <span className="cursor-help" title="Sunders at 5 stacks (just refreshing duration)">Refresh</span>
              </th>
              <th className="text-right py-1.5 px-2 font-medium">
                <span className="cursor-help" title="Missed/resisted sunders">Failed</span>
              </th>
              <th className="text-right py-1.5 px-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {warriors.map((warrior) => {
              const total = warrior.effectiveSunders + warrior.refreshSunders + warrior.failedSunders;
              return (
                <tr
                  key={warrior.guid}
                  className="border-b border-border/10 hover:bg-muted/50"
                >
                  <td className="py-1 px-2">
                    <span className="font-medium text-[var(--color-class-warrior)]">
                      {warrior.name}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-right font-mono text-green-400">
                    {warrior.effectiveSunders}
                  </td>
                  <td className="py-1 px-2 text-right font-mono text-yellow-400">
                    {warrior.refreshSunders}
                  </td>
                  <td className="py-1 px-2 text-right font-mono text-red-400">
                    {warrior.failedSunders}
                  </td>
                  <td className="py-1 px-2 text-right font-mono">
                    {total}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

interface TargetsViewProps {
  targets: TargetSunderStats[];
  selectedTargetGuid: string | null;
  onSelectTargetGuid: (guid: string | null) => void;
}

function TargetsView({ targets, selectedTargetGuid, onSelectTargetGuid }: TargetsViewProps) {
  
  // Filter to only targets that reached 5 stacks
  const targetsWithFive = targets.filter(t => t.timeToFiveStacksMs !== null);
  const targetsWithoutFive = targets.filter(t => t.timeToFiveStacksMs === null);
  
  const selectedTarget = selectedTargetGuid 
    ? targets.find(t => t.guid === selectedTargetGuid) 
    : null;
  
  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-sunder-targets>
      <div className="shrink-0 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{targetsWithFive.length}</span> targets reached 5 stacks
        {selectedTarget && (
          <button 
            type="button"
            onClick={() => onSelectTargetGuid(null)}
            className="ml-2 text-blue-400 hover:text-blue-300 cursor-pointer"
          >
            [clear selection]
          </button>
        )}
      </div>
      
      {selectedTarget ? (
        <DebugBreakout target={selectedTarget} onClose={() => onSelectTargetGuid(null)} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <ScrollArea className="min-h-0 flex-1">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 px-2 font-medium">Target</th>
                  <th className="text-right py-1.5 px-2 font-medium whitespace-nowrap">Time to 5</th>
                  <th className="text-left py-1.5 px-2 font-medium">Contributors</th>
                </tr>
              </thead>
              <tbody>
                {targetsWithFive.map((target, index) => (
                  <tr
                    key={target.guid}
                    className="border-b border-border/10 hover:bg-muted/50 cursor-pointer"
                    onClick={() => onSelectTargetGuid(target.guid)}
                    data-sunder-target-row={index === 0 ? true : undefined}
                  >
                    <td className="py-1 px-2 font-medium text-orange-400 whitespace-nowrap">
                      {target.name}
                    </td>
                    <td className="py-1 px-2 text-right font-mono font-mono text-2xs whitespace-nowrap">
                      {target.timeToFiveStacksMs !== null 
                        ? formatTimeMs(target.timeToFiveStacksMs)
                        : "—"}
                    </td>
                    <td className="py-1 px-2">
                      <ContributorsList contributors={target.first5Contributors} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
          
          {targetsWithoutFive.length > 0 && (
            <details className="text-xs">
              <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
                {targetsWithoutFive.length} targets never reached 5 stacks
              </summary>
              <div className="mt-2 pl-2 border-l border-border/50 max-h-[100px] overflow-y-auto">
                {targetsWithoutFive.slice(0, 10).map((target) => (
                  <div key={target.guid} className="py-0.5">
                    <button
                      type="button"
                      onClick={() => onSelectTargetGuid(target.guid)}
                      className="text-orange-400/70 hover:text-orange-400 cursor-pointer"
                    >
                      {target.name}
                    </button>
                    <span className="text-muted-foreground ml-2">
                      ({target.totalSunders} sunders, {target.first5Contributors.length} stacks)
                    </span>
                  </div>
                ))}
                {targetsWithoutFive.length > 10 && (
                  <div className="text-muted-foreground py-0.5">
                    ...and {targetsWithoutFive.length - 10} more
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

interface DebugBreakoutProps {
  target: TargetSunderStats;
  onClose: () => void;
}

function DebugBreakout({ target, onClose }: DebugBreakoutProps) {
  // Sort events by offset — no useMemo: the array is mutated in-place during
  // sync-mode incremental processing so the reference never changes, which
  // would cause a stale cache hit.  The array is small (~5-50 items).
  const sortedEvents = [...target.debugEvents].sort(
    (a, b) => a.offsetMs - b.offsetMs,
  );
  
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between">
        <span className="text-xs font-medium text-orange-400">{target.name}</span>
        <button 
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          ✕ close
        </button>
      </div>
      
      <div className="shrink-0 text-2xs text-muted-foreground">
        Time to 5: <span className="font-medium text-foreground">
          {target.timeToFiveStacksMs !== null ? formatTimeMs(target.timeToFiveStacksMs) : "never"}
        </span>
        {" • "}
        Total events: <span className="font-medium text-foreground">{sortedEvents.length}</span>
      </div>
      
      <ScrollArea className="min-h-0 flex-1" data-sunder-debug-scroll>
        <table className="w-full text-2xs font-mono">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-right py-1 px-2 font-medium">Offset</th>
              <th className="text-left py-1 px-2 font-medium">Type</th>
              <th className="text-left py-1 px-2 font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((event: SunderDebugEvent, index: number) => (
              <tr
                key={index}
                data-sunder-debug-row
                className={cn(
                  "border-b border-border/10",
                  event.type === "landed" && "bg-green-500/5",
                  event.type === "refreshed" && "bg-yellow-500/5",
                  event.type === "failed" && "bg-red-500/5 opacity-50",
                  event.type === "armor_exposed" && "bg-red-500/5 opacity-50"
                )}
              >
                <td className="py-0.5 px-2 text-right font-mono">
                  {formatTimeMs(event.offsetMs)}
                </td>
                <td className={cn(
                  "py-0.5 px-2",
                  event.type === "landed" && "text-green-400",
                  event.type === "refreshed" && "text-yellow-400",
                  event.type === "failed" && "text-red-400",
                  event.type === "armor_exposed" && "text-red-400"
                )}>
                  {event.type === "armor_exposed" ? "armor exposed" : event.type}
                </td>
                <td className="py-0.5 px-2">
                  <span className="text-[var(--color-class-warrior)]">{event.casterName}</span>
                  {event.abilityName && (
                    <span className="text-muted-foreground ml-2">via {event.abilityName}</span>
                  )}
                  {(event.type === "landed" || event.type === "refreshed") && event.stackCount && (
                    <span className="text-muted-foreground ml-2">→ stack {event.stackCount}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

interface ContributorsListProps {
  contributors: { guid: string; name: string; stackNumber: number }[];
}

function ContributorsList({ contributors }: ContributorsListProps) {
  // Group consecutive contributions by the same warrior
  const grouped: { name: string; count: number }[] = [];
  
  for (const contrib of contributors) {
    const last = grouped[grouped.length - 1];
    if (last && last.name === contrib.name) {
      last.count++;
    } else {
      grouped.push({ name: contrib.name, count: 1 });
    }
  }
  
  return (
    <span className="flex flex-wrap gap-x-1 gap-y-0.5">
      {grouped.map((g, i) => (
        <span key={i} className="text-[var(--color-class-warrior)]">
          {g.name}
          {g.count > 1 && <span className="text-muted-foreground">×{g.count}</span>}
          {i < grouped.length - 1 && <span className="text-muted-foreground">,</span>}
        </span>
      ))}
    </span>
  );
}
