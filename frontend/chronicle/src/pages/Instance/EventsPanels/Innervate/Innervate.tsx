/**
 * Innervate panel - Shows Innervate casts by Druids.
 * 
 * Toggle between summary view and detailed log view.
 */

import { useMemo, useCallback } from "react";
import { Leaf } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { innervateProcessor, type InnervateResult, type InnervateCast } from "./innervate.processor";
import { GenericPanel } from "../GenericPanel";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { cn } from "@/lib/utils";
import { instanceEntityAttributes } from "@/components/ui/PlayerMetricChart/instanceEntity";

/**
 * Format timestamp (ms since epoch) to HH:MM:SS format
 */
function formatTimestamp(timestampMs: number): string {
  const d = new Date(timestampMs);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

interface CasterSummary {
  name: string;
  selfCount: number;
  targets: { name: string; count: number }[];
  totalCasts: number;
}

/**
 * Aggregate casts by caster, showing self-casts and targets.
 */
function aggregateByCaster(casts: InnervateCast[]): CasterSummary[] {
  const casterMap = new Map<string, { selfCount: number; targets: Map<string, number> }>();
  
  for (const cast of casts) {
    if (!casterMap.has(cast.casterName)) {
      casterMap.set(cast.casterName, { selfCount: 0, targets: new Map() });
    }
    const data = casterMap.get(cast.casterName)!;
    
    if (cast.casterGuid === cast.targetGuid) {
      data.selfCount++;
    } else {
      data.targets.set(cast.targetName, (data.targets.get(cast.targetName) || 0) + 1);
    }
  }
  
  const result: CasterSummary[] = [];
  for (const [name, data] of casterMap) {
    const targets = Array.from(data.targets.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    result.push({
      name,
      selfCount: data.selfCount,
      targets,
      totalCasts: data.selfCount + targets.reduce((sum, t) => sum + t.count, 0),
    });
  }
  
  return result.sort((a, b) => b.totalCasts - a.totalCasts);
}

/**
 * Create the Innervate panel definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createInnervatePanel(): PanelDefinition<InnervateResult, any> {
  return {
    ...innervateProcessor,
    label: "Innervate",
    icon: <Leaf className="h-4 w-4" />,
    keybinds: [],
    supportsPerSecond: false,
    checkboxLabel: "Show log",
    
    render: (props: PanelRenderProps<InnervateResult>) => {
      return <InnervateContent {...props} />;
    },
  };
}

function InnervateContent(props: PanelRenderProps<InnervateResult>) {
  const { result, context, checkboxChecked: showLog } = props;
  const hasCasts = result !== null && result.casts.length > 0;
  
  const casterSummaries = useMemo(() => {
    if (!result || result.casts.length === 0) return [];
    return aggregateByCaster(result.casts);
  }, [result]);

  // Build encounter name lookup
  const encounterNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const enc of context.instance.encounters) {
      map.set(enc.id, enc.name);
    }
    return map;
  }, [context.instance.encounters]);

  // Handle encounter link click
  const handleEncounterClick = useCallback((encounterId: string) => {
    context.onSelectEncounters?.([encounterId]);
  }, [context]);
  
  return (
    <GenericPanel {...props}>
      {!hasCasts ? (
        <div className="text-center py-2 text-muted-foreground text-sm">
          No Innervate casts found
        </div>
      ) : showLog ? (
        /* Log view - similar to Death Log */
        <>
          <div className="text-xs text-muted-foreground mb-2">
            Total Casts: <span className="font-medium text-foreground">{result.casts.length}</span>
          </div>
          <ScrollArea className="max-h-panel">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 px-2 font-medium w-16">Time</th>
                  <th className="text-left py-1.5 px-2 font-medium">Encounter</th>
                  <th className="text-left py-1.5 px-2 font-medium">Caster</th>
                  <th className="text-left py-1.5 px-2 font-medium">Target</th>
                </tr>
              </thead>
              <tbody>
                {result.casts.map((cast, index) => {
                  const encounterName = encounterNames.get(cast.encounterId) || "Unknown";
                  const prevCast = index > 0 ? result.casts[index - 1] : null;
                  const isNewEncounter = prevCast && prevCast.encounterId !== cast.encounterId;
                  const isSelfCast = cast.casterGuid === cast.targetGuid;
                  
                  return (
                    <tr
                      key={`${cast.casterGuid}-${index}`}
                      className={cn(
                        "border-b border-border/10 hover:bg-muted/50",
                        isNewEncounter && "border-t-2 border-t-border"
                      )}
                    >
                      <td className="py-1 px-2 font-mono text-muted-foreground font-mono text-2xs">
                        {formatTimestamp(cast.timestampMs)}
                      </td>
                      <td className="py-1 px-2 max-w-[120px]">
                        <button
                          type="button"
                          onClick={() => handleEncounterClick(cast.encounterId)}
                          className={cn(
                            "text-left text-2xs truncate max-w-full",
                            "text-blue-500 hover:text-blue-400 hover:underline cursor-pointer"
                          )}
                          title={`Select ${encounterName}`}
                        >
                          {encounterName}
                        </button>
                      </td>
                      <td className="py-1 px-2">
                        <span
                          className="font-medium text-[var(--color-class-druid)]"
                          {...instanceEntityAttributes(context.instance, cast.casterGuid)}
                        >
                          {cast.casterName}
                        </span>
                      </td>
                      <td className="py-1 px-2">
                        {isSelfCast ? (
                          <span className="text-muted-foreground">self</span>
                        ) : (
                          <span
                            className="text-green-400 font-medium"
                            {...instanceEntityAttributes(context.instance, cast.targetGuid)}
                          >
                            {cast.targetName}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </>
      ) : (
        /* Summary view */
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground mb-2">
            Total Casts: <span className="font-medium text-foreground">{result.casts.length}</span>
          </div>
          {casterSummaries.map((caster) => (
            <div key={caster.name} className="flex items-start gap-2 text-sm">
              <span className="font-medium text-[var(--color-class-druid)] min-w-[80px]">{caster.name}</span>
              <span className="text-muted-foreground">→</span>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {caster.selfCount > 0 && (
                  <span className="text-muted-foreground">
                    self{caster.selfCount > 1 && <span className="text-xs ml-1">×{caster.selfCount}</span>}
                  </span>
                )}
                {caster.targets.map((target) => (
                  <span key={target.name} className="text-green-400">
                    {target.name}{target.count > 1 && <span className="text-xs ml-1">×{target.count}</span>}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </GenericPanel>
  );
}
