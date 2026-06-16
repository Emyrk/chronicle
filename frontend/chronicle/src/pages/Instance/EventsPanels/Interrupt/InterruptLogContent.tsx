/**
 * InterruptLogContent - Chronological list of interrupt events with timestamps and school badges.
 */

import { useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { GenericPanel } from "../GenericPanel";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useSpell } from "@/api/queries";
import { useDatasetId } from "@/hooks/useDatasetId";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import type { PanelRenderProps } from "../types";
import type { InterruptResult } from "./interrupt.processor";
import { useCachedValue } from "@/hooks/useCachedValue";

// ============================================================================
// School badge config
// ============================================================================

const SCHOOL_NAMES: Record<number, string> = {
  0: "Unknown",
  1: "None",
  2: "Physical",
  3: "Holy",
  4: "Fire",
  5: "Nature",
  6: "Frost",
  7: "Shadow",
  8: "Arcane",
};

const SCHOOL_COLORS: Record<number, { color: string; bgColor: string }> = {
  0: { color: "text-muted-foreground", bgColor: "bg-muted/50" },
  1: { color: "text-muted-foreground", bgColor: "bg-muted/50" },
  2: { color: "text-amber-400", bgColor: "bg-amber-500/15" },
  3: { color: "text-yellow-300", bgColor: "bg-yellow-400/15" },
  4: { color: "text-orange-400", bgColor: "bg-orange-500/15" },
  5: { color: "text-green-400", bgColor: "bg-green-500/15" },
  6: { color: "text-blue-300", bgColor: "bg-blue-400/15" },
  7: { color: "text-purple-400", bgColor: "bg-purple-500/15" },
  8: { color: "text-cyan-400", bgColor: "bg-cyan-500/15" },
};

function SchoolBadge({ school }: { school: number }) {
  const name = SCHOOL_NAMES[school] ?? "Unknown";
  const colors = SCHOOL_COLORS[school] ?? SCHOOL_COLORS[0];
  if (school <= 1) return null;
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium", colors.bgColor, colors.color)}>
      {name}
    </span>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(absoluteMilli: number): string {
  const eventTime = new Date(absoluteMilli);
  return eventTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatRelativeTime(offsetMilli: number): string {
  const totalSeconds = offsetMilli / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1);
  return `+${minutes}:${seconds.padStart(4, "0")}`;
}

/** Inline spell icon + name for a log row. */
function SpellCell({ spellId, spellName }: { spellId: number; spellName: string }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(
    spellId > 0 ? String(spellId) : "",
    datasetId,
    { enabled: spellId > 0 },
  );

  return (
    <span className="inline-flex items-center gap-1">
      {spell ? (
        <SpellIconWithTooltip spell={spell} size={14}>
          {spellName}
        </SpellIconWithTooltip>
      ) : (
        spellName
      )}
    </span>
  );
}

// ============================================================================
// Content
// ============================================================================

type InterruptLogContentProps = PanelRenderProps<InterruptResult>;

export const InterruptLogContent = (props: InterruptLogContentProps) => {
  const { result, context, loading, processing: _processing, checkboxChecked } = props;

  const encounterNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const enc of context.instance.encounters) {
      map.set(enc.id, enc.name);
    }
    return map;
  }, [context.instance.encounters]);

  const handleEncounterClick = useCallback((encounterId: string) => {
    context.onSelectEncounters?.([encounterId]);
  }, [context]);

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => r.InterruptEvents.length > 0,
    [props.panelContextVersion],
  );

  // Filtered + sorted events for selected encounters
  const sortedEvents = useMemo(() => {
    if (!cachedResult) return [];
    const selected = new Set(context.selectedEncounterIds);
    return cachedResult.InterruptEvents
      .filter((e) => selected.has(e.encounterID));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- length tracks in-place array mutation during sync mode
  }, [cachedResult, cachedResult?.InterruptEvents?.length, context.selectedEncounterIds]);

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  return (
    <GenericPanel {...effectiveProps}>
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center justify-between mb-2 gap-2 shrink-0">
          <div className="text-xs text-muted-foreground">
            Interrupts: <span className="font-medium text-foreground">{sortedEvents.length}</span>
          </div>
        </div>

        {sortedEvents.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {loading ? "Loading..." : "No interrupts recorded"}
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 px-2 font-medium w-16">Time</th>
                  <th className="text-left py-1.5 px-2 font-medium">Encounter</th>
                  <th className="text-left py-1.5 px-2 font-medium">Caster</th>
                  <th className="text-left py-1.5 px-2 font-medium">Target</th>
                  <th className="text-left py-1.5 px-2 font-medium">Interrupted Spell</th>
                  <th className="text-left py-1.5 px-2 font-medium w-16">School</th>
                </tr>
              </thead>
              <tbody>
                {sortedEvents.map((evt, index) => {
                  const encounterName = encounterNames.get(evt.encounterID) || "Unknown";
                  const prevEvt = index > 0 ? sortedEvents[index - 1] : null;
                  const isNewEncounter = prevEvt && prevEvt.encounterID !== evt.encounterID;

                  return (
                    <tr
                      key={`${evt.casterID}-${evt.targetID}-${evt.offsetMilli}-${index}`}
                      className={cn(
                        "border-b border-border/10 hover:bg-muted/50",
                        isNewEncounter && "border-t-2 border-t-border",
                      )}
                    >
                      <td className="py-1 px-2 font-mono text-muted-foreground text-2xs">
                        {checkboxChecked
                          ? formatRelativeTime(evt.offsetMilli)
                          : formatTimestamp(evt.dateMilli)}
                      </td>
                      <td className="py-1 px-2 max-w-[120px]">
                        <button
                          type="button"
                          onClick={() => handleEncounterClick(evt.encounterID)}
                          className="text-left text-2xs truncate max-w-full text-blue-500 hover:text-blue-400 hover:underline cursor-pointer"
                          title={`Select ${encounterName}`}
                        >
                          {encounterName}
                        </button>
                      </td>
                      <td className="py-1 px-2">
                        <span
                          className="font-medium"
                          style={{ color: `var(--color-class-${evt.casterClass.toLowerCase()})` }}
                        >
                          {evt.casterName}
                        </span>
                      </td>
                      <td className="py-1 px-2">
                        <span
                          className="font-medium"
                          style={{ color: `var(--color-class-${evt.targetClass.toLowerCase()})` }}
                        >
                          {evt.targetName}
                        </span>
                      </td>
                      <td className="py-1 px-2 max-w-[140px] truncate" title={evt.spellName}>
                        <SpellCell spellId={evt.extraSpellId} spellName={evt.spellName} />
                      </td>
                      <td className="py-1 px-2">
                        <SchoolBadge school={evt.extraSchool} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </div>
    </GenericPanel>
  );
};
