/**
 * ConsumablesContent - chronological log of consumable uses with expandable
 * evidence details, styled after DispelLogContent.
 */

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useSpell } from "@/api/queries";
import { useDatasetId } from "@/hooks/useDatasetId";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import {
  CONFIDENCE_LABELS,
  consumableDisplayName,
  EVIDENCE_KIND_LABELS,
  type ConsumableUse,
  type ConsumablesResult,
} from "./consumables.processor";
import { useCachedValue } from "@/hooks/useCachedValue";

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(absoluteMilli: number): string {
  return new Date(absoluteMilli).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatRelativeTime(offsetMilli: number): string {
  const sign = offsetMilli < 0 ? "-" : "+";
  const abs = Math.abs(offsetMilli);
  const totalSeconds = abs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(1);
  return `${sign}${minutes}:${seconds.padStart(4, "0")}`;
}

interface ConfidenceBadgeConfig {
  color: string;
  bgColor: string;
  label: string;
}

/** Badge per display state: strongest confidence, with an "At Pull" override
 * when the use was never directly observed. */
function badgeForUse(use: ConsumableUse): ConfidenceBadgeConfig {
  if (use.activeAtPullOnly) {
    return { color: "text-sky-400", bgColor: "bg-sky-500/15", label: "At Pull" };
  }
  switch (use.bestConfidence) {
    case 1:
      return { color: "text-green-400", bgColor: "bg-green-500/15", label: "Direct" };
    case 2:
      return { color: "text-teal-400", bgColor: "bg-teal-500/15", label: "Effect" };
    case 3:
      return { color: "text-amber-400", bgColor: "bg-amber-500/15", label: "Ambiguous" };
    case 4:
      return { color: "text-orange-400", bgColor: "bg-orange-500/15", label: "Inferred" };
    default:
      return { color: "text-muted-foreground", bgColor: "bg-muted/50", label: "Unknown" };
  }
}

function ConfidenceBadge({ use }: { use: ConsumableUse }) {
  const config = badgeForUse(use);
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium", config.bgColor, config.color)}>
      {config.label}
    </span>
  );
}

/** Inline spell icon + name for a consumable log row. */
function SpellCell({ spellId, name }: { spellId: number | null; name: string }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(
    spellId != null && spellId > 0 ? String(spellId) : "",
    datasetId,
    { enabled: spellId != null && spellId > 0 },
  );

  return (
    <span className="inline-flex items-center gap-1">
      {spell ? (
        <SpellIconWithTooltip spell={spell} size={14}>
          {name}
        </SpellIconWithTooltip>
      ) : (
        name
      )}
    </span>
  );
}

// ============================================================================
// Expanded evidence details
// ============================================================================

function EvidenceDetails({ use, encounterNames }: { use: ConsumableUse; encounterNames: Map<string, string> }) {
  return (
    <div className="px-8 py-2 text-2xs space-y-2 bg-muted/20">
      <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 max-w-md">
        <span className="text-muted-foreground">Consume ID</span>
        <span className="font-mono">{use.consumeId}</span>
        <span className="text-muted-foreground">Item</span>
        <span className="font-mono">
          {use.itemId ?? (use.candidateItemIds.length > 0 ? use.candidateItemIds.join(", ") : "unknown")}
          {use.candidateItemIds.length > 1 && " (candidates)"}
        </span>
        <span className="text-muted-foreground">Consumed at</span>
        <span className="font-mono">
          {use.consumedAtUnixMilli !== null ? formatTimestamp(use.consumedAtUnixMilli) : "not observed"}
        </span>
      </div>
      <table className="text-2xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left pr-4 font-medium">Evidence</th>
            <th className="text-left pr-4 font-medium">Confidence</th>
            <th className="text-left pr-4 font-medium">Encounter</th>
            <th className="text-left pr-4 font-medium">Observed</th>
            <th className="text-left font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {use.observations.map((obs) => (
            <tr key={`${obs.evidenceId}-${obs.encounterID}`}>
              <td className="pr-4">{EVIDENCE_KIND_LABELS[obs.kind] ?? obs.kind}</td>
              <td className="pr-4">{CONFIDENCE_LABELS[obs.confidence] ?? obs.confidence}</td>
              <td className="pr-4">{encounterNames.get(obs.encounterID) ?? obs.encounterID.slice(0, 8)}</td>
              <td className="pr-4 font-mono">{formatTimestamp(obs.observedAtUnixMilli)}</td>
              <td className="text-muted-foreground">
                {[
                  obs.isProjection && "projected",
                  obs.amount !== null && `${obs.amount}${obs.resourceType ? ` ${obs.resourceType}` : ""}`,
                ]
                  .filter(Boolean)
                  .join(", ") || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// Content
// ============================================================================

type ConsumablesContentProps = PanelRenderProps<ConsumablesResult>;

export const ConsumablesContent = (props: ConsumablesContentProps) => {
  const { result, context, loading, checkboxChecked } = props;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((consumeId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(consumeId)) next.delete(consumeId);
      else next.add(consumeId);
      return next;
    });
  }, []);

  const encounterNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const enc of context.instance.encounters) {
      map.set(enc.id, enc.name);
    }
    return map;
  }, [context.instance.encounters]);

  const handleEncounterClick = useCallback(
    (encounterId: string) => {
      context.onSelectEncounters?.([encounterId]);
    },
    [context],
  );

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.uses instanceof Map && r.uses.size > 0,
    [props.panelContextVersion],
  );

  const sortedUses = useMemo(() => {
    if (!cachedResult) return [];
    return [...cachedResult.uses.values()].sort((a, b) => a.dateMilli - b.dateMilli);
  }, [cachedResult]);

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
            Uses: <span className="font-medium text-foreground">{sortedUses.length}</span>
            {(cachedResult?.unknownUseIds.size ?? 0) > 0 && (
              <span className="ml-2 text-muted-foreground/60" title="Uses Chronicle could not map to a known item">
                {cachedResult!.unknownUseIds.size} unmapped
              </span>
            )}
          </div>
        </div>

        {sortedUses.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">
            {loading ? "Loading..." : "No consumable uses recorded"}
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-muted-foreground">
                  <th className="w-6"></th>
                  <th className="text-left py-1.5 px-2 font-medium w-16">Time</th>
                  <th className="text-left py-1.5 px-2 font-medium">Encounter</th>
                  <th className="text-left py-1.5 px-2 font-medium">Player</th>
                  <th className="text-left py-1.5 px-2 font-medium">Consumable</th>
                  <th className="text-left py-1.5 px-2 font-medium w-20">Source</th>
                </tr>
              </thead>
              <tbody>
                {sortedUses.map((use) => {
                  const encounterName = encounterNames.get(use.encounterID) || "Unknown";
                  const player = context.instance.players?.[use.player];
                  const isExpanded = expanded.has(use.consumeId);

                  return [
                    <tr
                      key={use.consumeId}
                      onClick={() => toggleExpanded(use.consumeId)}
                      className="border-b border-border/10 hover:bg-muted/50 cursor-pointer"
                    >
                      <td className="py-1 pl-2 text-muted-foreground">
                        {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </td>
                      <td className="py-1 px-2 font-mono text-muted-foreground text-2xs">
                        {checkboxChecked ? formatRelativeTime(use.offsetMilli) : formatTimestamp(use.dateMilli)}
                      </td>
                      <td className="py-1 px-2 max-w-[120px]">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEncounterClick(use.encounterID);
                          }}
                          className="text-left text-2xs truncate max-w-full text-blue-500 hover:text-blue-400 hover:underline cursor-pointer"
                          title={`Select ${encounterName}`}
                        >
                          {encounterName}
                        </button>
                      </td>
                      <td className="py-1 px-2">
                        <span
                          className="font-medium"
                          style={{ color: `var(--color-class-${(player?.class ?? "unknown").toLowerCase()})` }}
                        >
                          {player?.name ?? use.player}
                        </span>
                      </td>
                      <td className="py-1 px-2 max-w-[160px] truncate" title={consumableDisplayName(use)}>
                        <SpellCell spellId={use.spellId} name={consumableDisplayName(use)} />
                      </td>
                      <td className="py-1 px-2">
                        <ConfidenceBadge use={use} />
                      </td>
                    </tr>,
                    isExpanded ? (
                      <tr key={`${use.consumeId}-details`} className="border-b border-border/10">
                        <td colSpan={6} className="p-0">
                          <EvidenceDetails use={use} encounterNames={encounterNames} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </div>
    </GenericPanel>
  );
};
