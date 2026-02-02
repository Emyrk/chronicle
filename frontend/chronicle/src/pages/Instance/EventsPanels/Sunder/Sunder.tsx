/**
 * Sunder Armor panel - Shows Sunder Armor effectiveness by Warriors.
 * 
 * Summary view: Shows each warrior's effective/ineffective sunders
 * Log view: Shows detailed breakdown of targets and time-to-5-stacks
 */

import { useMemo, useState } from "react";
import { Sword } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { sunderProcessor, type SunderResult, type WarriorSunderStats, type TargetSunderStats } from "./sunder.processor";
import { GenericPanel } from "../GenericPanel";
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
    // Sort by total sunders descending
    const totalA = a.effectiveSunders + a.ineffectiveSunders;
    const totalB = b.effectiveSunders + b.ineffectiveSunders;
    return totalB - totalA;
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
  const { result, checkboxChecked: showTargets } = props;
  
  const warriors = useMemo(() => {
    if (!result) return [];
    return sortedWarriors(result.warriors);
  }, [result]);
  
  const targets = useMemo(() => {
    if (!result) return [];
    return sortedTargets(result.targets);
  }, [result]);
  
  const hasData = warriors.length > 0;
  
  // Calculate totals
  const totals = useMemo(() => {
    let effective = 0;
    let ineffective = 0;
    for (const w of warriors) {
      effective += w.effectiveSunders;
      ineffective += w.ineffectiveSunders;
    }
    return { effective, ineffective, total: effective + ineffective };
  }, [warriors]);
  
  return (
    <GenericPanel {...props}>
      {!hasData ? (
        <div className="text-center py-2 text-muted-foreground text-sm">
          No Sunder Armor casts found
        </div>
      ) : showTargets ? (
        /* Targets view - shows time to 5 stacks and contributors */
        <TargetsView targets={targets} />
      ) : (
        /* Summary view - shows warrior effectiveness */
        <WarriorsView warriors={warriors} totals={totals} />
      )}
    </GenericPanel>
  );
}

interface WarriorsViewProps {
  warriors: WarriorSunderStats[];
  totals: { effective: number; ineffective: number; total: number };
}

function WarriorsView({ warriors, totals }: WarriorsViewProps) {
  const effectivenessPercent = totals.total > 0 
    ? Math.round((totals.effective / totals.total) * 100) 
    : 0;
  
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground mb-2">
        Total: <span className="font-medium text-foreground">{totals.total}</span>
        {" • "}
        Effective: <span className="font-medium text-green-400">{totals.effective}</span>
        {" • "}
        Wasted: <span className="font-medium text-red-400">{totals.ineffective}</span>
        {" • "}
        <span className="font-medium text-foreground">{effectivenessPercent}%</span> effective
      </div>
      
      <div className="max-h-[300px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-left py-1.5 px-2 font-medium">Warrior</th>
              <th className="text-right py-1.5 px-2 font-medium">Effective</th>
              <th className="text-right py-1.5 px-2 font-medium">Wasted</th>
              <th className="text-right py-1.5 px-2 font-medium">Total</th>
              <th className="text-right py-1.5 px-2 font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {warriors.map((warrior) => {
              const total = warrior.effectiveSunders + warrior.ineffectiveSunders;
              const percent = total > 0 
                ? Math.round((warrior.effectiveSunders / total) * 100) 
                : 0;
              
              return (
                <tr
                  key={warrior.guid}
                  className="border-b border-border/10 hover:bg-muted/50"
                >
                  <td className="py-1 px-2">
                    <span className="font-medium text-[var(--class-warrior)]">
                      {warrior.name}
                    </span>
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums text-green-400">
                    {warrior.effectiveSunders}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums text-red-400">
                    {warrior.ineffectiveSunders}
                  </td>
                  <td className="py-1 px-2 text-right tabular-nums">
                    {total}
                  </td>
                  <td className={cn(
                    "py-1 px-2 text-right tabular-nums",
                    percent >= 90 ? "text-green-400" : 
                    percent >= 70 ? "text-yellow-400" : "text-red-400"
                  )}>
                    {percent}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface TargetsViewProps {
  targets: TargetSunderStats[];
}

function TargetsView({ targets }: TargetsViewProps) {
  const [selectedTargetGuid, setSelectedTargetGuid] = useState<string | null>(null);
  
  // Filter to only targets that reached 5 stacks
  const targetsWithFive = targets.filter(t => t.timeToFiveStacksMs !== null);
  const targetsWithoutFive = targets.filter(t => t.timeToFiveStacksMs === null);
  
  const selectedTarget = selectedTargetGuid 
    ? targets.find(t => t.guid === selectedTargetGuid) 
    : null;
  
  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{targetsWithFive.length}</span> targets reached 5 stacks
        {selectedTarget && (
          <button 
            type="button"
            onClick={() => setSelectedTargetGuid(null)}
            className="ml-2 text-blue-400 hover:text-blue-300 cursor-pointer"
          >
            [clear selection]
          </button>
        )}
      </div>
      
      {selectedTarget ? (
        <DebugBreakout target={selectedTarget} onClose={() => setSelectedTargetGuid(null)} />
      ) : (
        <>
          <div className="max-h-[300px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 px-2 font-medium">Target</th>
                  <th className="text-right py-1.5 px-2 font-medium whitespace-nowrap">Time to 5</th>
                  <th className="text-left py-1.5 px-2 font-medium">Contributors</th>
                </tr>
              </thead>
              <tbody>
                {targetsWithFive.map((target) => (
                  <tr
                    key={target.guid}
                    className="border-b border-border/10 hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelectedTargetGuid(target.guid)}
                  >
                    <td className="py-1 px-2 font-medium text-orange-400 whitespace-nowrap">
                      {target.name}
                    </td>
                    <td className="py-1 px-2 text-right tabular-nums font-mono text-2xs whitespace-nowrap">
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
          </div>
          
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
                      onClick={() => setSelectedTargetGuid(target.guid)}
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
        </>
      )}
    </div>
  );
}

interface DebugBreakoutProps {
  target: TargetSunderStats;
  onClose: () => void;
}

function DebugBreakout({ target, onClose }: DebugBreakoutProps) {
  // Sort events by offset
  const sortedEvents = useMemo(() => {
    return [...target.debugEvents].sort((a, b) => a.offsetMs - b.offsetMs);
  }, [target.debugEvents]);
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-orange-400">{target.name}</span>
        <button 
          type="button"
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          ✕ close
        </button>
      </div>
      
      <div className="text-2xs text-muted-foreground">
        Time to 5: <span className="font-medium text-foreground">
          {target.timeToFiveStacksMs !== null ? formatTimeMs(target.timeToFiveStacksMs) : "never"}
        </span>
        {" • "}
        Total events: <span className="font-medium text-foreground">{sortedEvents.length}</span>
      </div>
      
      <div className="max-h-[250px] overflow-y-auto">
        <table className="w-full text-2xs font-mono">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-muted-foreground">
              <th className="text-right py-1 px-2 font-medium">Offset</th>
              <th className="text-left py-1 px-2 font-medium">Type</th>
              <th className="text-left py-1 px-2 font-medium">Details</th>
              <th className="text-center py-1 px-2 font-medium">Matched</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((event, index) => (
              <tr
                key={index}
                className={cn(
                  "border-b border-border/10",
                  event.type === "cast" ? "bg-blue-500/5" : "bg-green-500/5",
                  !event.matched && "opacity-50"
                )}
              >
                <td className="py-0.5 px-2 text-right tabular-nums">
                  {formatTimeMs(event.offsetMs)}
                </td>
                <td className={cn(
                  "py-0.5 px-2",
                  event.type === "cast" ? "text-blue-400" : "text-green-400"
                )}>
                  {event.type}
                </td>
                <td className="py-0.5 px-2">
                  {event.type === "cast" ? (
                    <span className="text-[var(--class-warrior)]">{event.casterName}</span>
                  ) : (
                    <span>stack {event.stackCount}</span>
                  )}
                </td>
                <td className="py-0.5 px-2 text-center">
                  {event.matched ? "✓" : "✗"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
        <span key={i} className="text-[var(--class-warrior)]">
          {g.name}
          {g.count > 1 && <span className="text-muted-foreground">×{g.count}</span>}
          {i < grouped.length - 1 && <span className="text-muted-foreground">,</span>}
        </span>
      ))}
    </span>
  );
}
