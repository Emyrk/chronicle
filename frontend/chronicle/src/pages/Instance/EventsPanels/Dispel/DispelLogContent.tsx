/**
 * DispelLogContent - Chronological list of dispel events with timestamps and type badges.
 */

import { useMemo, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, Skull, Bug, Droplets, HelpCircle } from "lucide-react";
import { GenericPanel } from "../GenericPanel";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useSpell } from "@/api/queries";
import { useDatasetId } from "@/hooks/useDatasetId";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import type { PanelRenderProps } from "../types";
import type { DispelResult, DispelCategory } from "./dispel.processor";
import { ALL_DISPEL_CATEGORIES } from "./dispel.processor";
import { useCachedValue } from "@/hooks/useCachedValue";

// ============================================================================
// Category badge config
// ============================================================================

interface CategoryBadgeConfig {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  label: string;
}

const CATEGORY_BADGE: Record<DispelCategory, CategoryBadgeConfig> = {
  All: { icon: null, color: "text-foreground", bgColor: "bg-foreground/10", label: "All" },
  Magic: { icon: <Sparkles className="h-3 w-3" />, color: "text-blue-400", bgColor: "bg-blue-500/15", label: "Magic" },
  Curse: { icon: <Skull className="h-3 w-3" />, color: "text-purple-400", bgColor: "bg-purple-500/15", label: "Curse" },
  Disease: { icon: <Bug className="h-3 w-3" />, color: "text-yellow-400", bgColor: "bg-yellow-500/15", label: "Disease" },
  Poison: { icon: <Droplets className="h-3 w-3" />, color: "text-green-400", bgColor: "bg-green-500/15", label: "Poison" },
  Other: { icon: <HelpCircle className="h-3 w-3" />, color: "text-muted-foreground", bgColor: "bg-muted/50", label: "Other" },
};

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

function CategoryBadge({ category }: { category: DispelCategory }) {
  const config = CATEGORY_BADGE[category];
  return (
    <span className={cn("inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs font-medium", config.bgColor, config.color)}>
      {config.icon}
      {config.label}
    </span>
  );
}

// ============================================================================
// Filter selector (same style as DispelContent)
// ============================================================================

interface DispelLogFilterProps {
  selected: Set<DispelCategory>;
  onChange: (type: DispelCategory) => void;
  availableTypes: Set<DispelCategory>;
}

function DispelLogFilter({ selected, onChange, availableTypes }: DispelLogFilterProps) {
  const visibleTypes = ALL_DISPEL_CATEGORIES.filter(
    (t) => t === "All" || availableTypes.has(t),
  );
  if (visibleTypes.length <= 1) return null;

  const allSelected = selected.size === 0;

  return (
    <div className="flex items-center gap-1">
      {visibleTypes.map((type) => {
        const config = CATEGORY_BADGE[type];
        const isSelected = type === "All" ? allSelected : selected.has(type);
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer border",
              isSelected
                ? cn(config.bgColor, `border-current`, config.color)
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            {config.icon}
            <span className="hidden sm:inline">{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Content
// ============================================================================

/** Inline spell icon + name for a dispel log row. */
function SpellCell({ spellId, spellName }: { spellId: number | null; spellName: string }) {
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
          {spellName}
        </SpellIconWithTooltip>
      ) : (
        spellName
      )}
    </span>
  );
}

type DispelLogContentProps = PanelRenderProps<DispelResult>;

export const DispelLogContent = (props: DispelLogContentProps) => {
  const { result, context, loading, processing: _processing, checkboxChecked } = props;
  const [filterCategories, setFilterCategories] = useState<Set<DispelCategory>>(new Set());

  const handleToggleCategory = useCallback((type: DispelCategory) => {
    if (type === "All") {
      setFilterCategories(new Set());
      return;
    }
    setFilterCategories((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
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

  const handleEncounterClick = useCallback((encounterId: string) => {
    context.onSelectEncounters?.([encounterId]);
  }, [context]);

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => r.DispelEvents.length > 0,
    [props.panelContextVersion],
  );

  // Available dispel types across selected encounters
  const availableTypes = useMemo(() => {
    if (!cachedResult) return new Set<DispelCategory>();
    const types = new Set<DispelCategory>();
    const selected = new Set(context.selectedEncounterIds);
    for (const evt of cachedResult.DispelEvents) {
      if (selected.has(evt.encounterID)) types.add(evt.category);
    }
    return types;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- length tracks in-place array mutation during sync mode
  }, [cachedResult, cachedResult?.DispelEvents?.length, context.selectedEncounterIds]);

  // Filtered + sorted events
  // NOTE: DispelEvents.length is an explicit dep because sync mode mutates the array
  // in place (incremental processing reuses the same array reference via shallowClone).
  // Without it, forward playback doesn't trigger re-renders since the array ref is stable.
  const sortedEvents = useMemo(() => {
    if (!cachedResult) return [];
    const selected = new Set(context.selectedEncounterIds);
    return cachedResult.DispelEvents
      .filter((e) => selected.has(e.encounterID) && (filterCategories.size === 0 || filterCategories.has(e.category)));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- length tracks in-place array mutation during sync mode
  }, [cachedResult, cachedResult?.DispelEvents?.length, context.selectedEncounterIds, filterCategories]);

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
          Dispels: <span className="font-medium text-foreground">{sortedEvents.length}</span>
        </div>
        <DispelLogFilter
          selected={filterCategories}
          onChange={handleToggleCategory}
          availableTypes={availableTypes}
        />
      </div>

      {sortedEvents.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">
          {loading ? "Loading..." : "No dispels recorded"}
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
                <th className="text-left py-1.5 px-2 font-medium">Spell</th>
                <th className="text-left py-1.5 px-2 font-medium w-16">Type</th>
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
                      <SpellCell spellId={evt.spellId} spellName={evt.spellName} />
                    </td>
                    <td className="py-1 px-2">
                      <CategoryBadge category={evt.category} />
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
