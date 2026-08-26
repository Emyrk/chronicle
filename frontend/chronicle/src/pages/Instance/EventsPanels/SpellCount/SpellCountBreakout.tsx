import { useCallback } from "react";
import { useSpell } from "@/api/queries";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useDatasetId } from "@/hooks/useDatasetId";
import type { PanelContext } from "../types";
import {
  aggregateSpellCountsForPlayer,
  type SpellCountResult,
  type SpellCountSpellData,
} from "./spellCount.processor";

// eslint-disable-next-line react-refresh/only-export-components
function SpellCell({ spell }: { spell: SpellCountSpellData }) {
  const datasetId = useDatasetId();
  const { data } = useSpell(
    spell.spellId > 0 ? String(spell.spellId) : "",
    datasetId,
    { enabled: spell.spellId > 0 },
  );

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      {data ? <SpellIconWithTooltip spell={data} size={16} className="size-4 shrink-0" /> : null}
      <span className="truncate">{spell.spellName}</span>
    </span>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
function SpellCountTable({ spells }: { spells: SpellCountSpellData[] }) {
  const sorted = [...spells].sort((a, b) =>
    b.successful - a.successful
    || b.failed - a.failed
    || a.spellName.localeCompare(b.spellName),
  );

  if (sorted.length === 0) {
    return <p className="p-2 text-xs text-muted-foreground">No spell breakdown available</p>;
  }

  return (
    <ScrollArea className="max-h-panel">
      <table className="w-full text-xs text-foreground">
        <thead className="sticky top-0 bg-popover">
          <tr className="border-b border-border">
            <th className="px-2 py-1.5 text-left font-medium">Spell</th>
            <th className="px-2 py-1.5 text-right font-medium">Casts</th>
            <th className="px-2 py-1.5 text-right font-medium">Fails</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((spell) => (
            <tr
              key={`${spell.spellId}:${spell.spellName}`}
              className="border-b border-border/10 hover:bg-muted/50"
            >
              <td className="max-w-[220px] px-2 py-1" title={spell.spellName}>
                <SpellCell spell={spell} />
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {spell.successful.toLocaleString()}
              </td>
              <td className="px-2 py-1 text-right font-mono text-yellow-500">
                {spell.failed.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollArea>
  );
}

interface UseSpellCountBreakoutOptions {
  result: SpellCountResult;
  context: PanelContext;
  loading: boolean;
  processing: boolean;
}

export function useSpellCountBreakout({
  result,
  context,
  loading,
  processing,
}: UseSpellCountBreakoutOptions) {
  return useCallback((playerID: string) => {
    if (loading || processing) {
      return (
        <div className="flex min-h-[160px] min-w-[300px] items-center justify-center p-4 text-xs text-muted-foreground">
          {loading ? "Loading..." : "Processing..."}
        </div>
      );
    }

    const playerData = aggregateSpellCountsForPlayer(
      result,
      playerID,
      context.selectedEncounterIds,
    );
    if (!playerData) {
      return <p className="p-2 text-xs text-muted-foreground">No spell breakdown available</p>;
    }

    return (
      <div>
        <div className="flex items-center border-b border-border px-2 py-1 text-2xs text-muted-foreground">
          <span>By Spell</span>
          <span className="ml-auto">
            {playerData.successful.toLocaleString()} casts · {playerData.failed.toLocaleString()} fails
          </span>
        </div>
        <SpellCountTable spells={Array.from(playerData.spells.values())} />
      </div>
    );
  }, [context.selectedEncounterIds, loading, processing, result]);
}
