import { useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { FlaskConical, HelpCircle, Search, X } from "lucide-react";
import { fetchItemTooltip } from "@/api/gamedata";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip/SpellIdTooltip";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useDatasetId } from "@/hooks/useDatasetId";
import { useConsumableDisambiguations } from "@/api/queries";
import type { ConsumableDisambiguation } from "@/api/typesGenerated";
import { buildConsumableDisambiguationMap, resolveConsumableUse } from "./consumableDisambiguation";
import { GenericPanel } from "../GenericPanel";
import { FloatingIncomingEventsBreakout } from "../IncomingEvents/FloatingIncomingEventsBreakout";
import type { PanelDefinition, PanelRenderProps } from "../types";
import {
  CONFIDENCE_LABELS,
  consumablesTotalProcessor,
  EVIDENCE_KIND_LABELS,
  type ConsumablesResult,
} from "./consumables.processor";
import { ItemCell } from "./ConsumablesContent";
import {
  aggregateConsumablesTotal,
  filterConsumablesTotal,
  type ConsumableCount,
} from "./consumablesTotal.ts";

interface PossibleBreakoutState {
  key: string;
  consume: ConsumableCount;
  initialPosition: { x: number; y: number };
}

function ConsumeCount({
  consume,
  onOpenPossible,
}: {
  consume: ConsumableCount;
  onOpenPossible: (consume: ConsumableCount, target: HTMLElement) => void;
}) {
  if (consume.itemId !== null) {
    return (
      <span className="inline-flex min-h-7 items-center gap-1.5 rounded border border-border/60 bg-muted/30 px-2 py-1 leading-none">
        <ItemCell itemId={consume.itemId} link />
        <span className="inline-flex self-stretch items-center font-semibold leading-none text-foreground">x{consume.count}</span>
        <span className="inline-flex self-stretch items-center font-mono text-2xs leading-none text-muted-foreground">
          #{consume.itemId}
        </span>
      </span>
    );
  }

  if (consume.candidateItemIds.length > 0) {
    return (
      <button
        type="button"
        onClick={(event) => onOpenPossible(consume, event.currentTarget)}
        className="inline-flex min-h-7 items-center gap-1.5 rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1 leading-none text-amber-200 transition-colors hover:border-amber-400/50 hover:bg-amber-500/15"
        title="Show possible items and why Chronicle could not identify one item"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span>Possible</span>
        <span className="inline-flex self-stretch items-center font-semibold leading-none">x{consume.count}</span>
      </button>
    );
  }

  return (
    <span className="inline-flex min-h-7 items-center gap-1.5 rounded border border-border/60 bg-muted/30 px-2 py-1 leading-none">
      <span className="text-muted-foreground">Unknown item</span>
      <span className="inline-flex self-stretch items-center font-semibold leading-none text-foreground">x{consume.count}</span>
    </span>
  );
}

function PossibleItemsBreakout({ consume, onClose }: { consume: ConsumableCount; onClose: () => void }) {
  return (
    <div className="overflow-hidden rounded-lg border border-amber-500/25 bg-card shadow-2xl">
      <div className="flex cursor-grab items-center gap-2 border-b border-border bg-muted/30 px-3 py-2" data-drag-handle>
        <HelpCircle className="h-4 w-4 text-amber-400" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Possible consumables</div>
          <div className="text-2xs text-muted-foreground">
            {consume.count} use{consume.count === 1 ? "" : "s"}, {consume.candidateItemIds.length} matching items
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close possible consumables"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[var(--incoming-events-body-height)] space-y-4 overflow-y-auto p-3 styled-scrollbar">
        <section>
          <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Possible items</h4>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {consume.candidateItemIds.map((itemId) => (
              <div key={itemId} className="flex items-center justify-between gap-2 rounded border border-border/60 bg-muted/20 px-2 py-1 text-xs">
                <ItemCell itemId={itemId} link compact />
                <span className="shrink-0 font-mono text-[9px] text-muted-foreground">#{itemId}</span>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h4 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Why these are possible</h4>
          <div className="space-y-1.5">
            {consume.sources.map((source) => (
              <div key={source.consumeId} className="rounded border border-border/60 bg-muted/20 px-2 py-1.5 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <SpellIdTooltip
                    spellId={source.spellId}
                    name={source.spellName || "Unknown effect"}
                    size={13}
                    className="font-medium text-xs"
                  />
                  {source.spellId !== null && (
                    <span className="font-mono text-2xs text-muted-foreground">spell #{source.spellId}</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1 text-2xs text-muted-foreground">
                  {source.kinds.map((kind) => (
                    <span key={kind} className="rounded bg-muted px-1.5 py-0.5">
                      {EVIDENCE_KIND_LABELS[kind] ?? `Evidence ${kind}`}
                    </span>
                  ))}
                  <span className="rounded bg-muted px-1.5 py-0.5">
                    {CONFIDENCE_LABELS[source.bestConfidence] ?? "Unknown confidence"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

type ConsumablesTotalContentProps = PanelRenderProps<ConsumablesResult>;

export function ConsumablesTotalContent(props: ConsumablesTotalContentProps) {
  const { result, context, loading } = props;
  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (value) => !!value && value.uses instanceof Map && value.uses.size > 0,
    [props.panelContextVersion],
  );

  const [possibleBreakout, setPossibleBreakout] = useState<PossibleBreakoutState | null>(null);
  const [filter, setFilter] = useState("");

  const openPossibleBreakout = (consume: ConsumableCount, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const view = target.ownerDocument.defaultView;
    const x = Math.max(8, Math.min(rect.right + 8, (view?.innerWidth ?? 640) - 628));
    const y = Math.max(8, Math.min(rect.top, (view?.innerHeight ?? 480) - 160));
    setPossibleBreakout({ key: consume.key, consume, initialPosition: { x, y } });
  };

  const datasetId = useDatasetId();
  const { data: disambiguations } = useConsumableDisambiguations(datasetId);
  const disambiguationMap = useMemo(() => buildConsumableDisambiguationMap(disambiguations as ConsumableDisambiguation[] | undefined), [disambiguations]);

  const rows = useMemo(() => {
    const uses = [...(cachedResult?.uses.values() ?? [])].map((use) => resolveConsumableUse(use, disambiguationMap));
    const aggregated = aggregateConsumablesTotal(uses);
    aggregated.sort((a, b) => {
      const aName = context.instance.players?.[a.playerId]?.name ?? a.playerId;
      const bName = context.instance.players?.[b.playerId]?.name ?? b.playerId;
      return aName.localeCompare(bName);
    });
    return aggregated;
  }, [cachedResult, context.instance.players, disambiguationMap]);

  const itemIds = useMemo(() => [...new Set(rows.flatMap((row) =>
    row.consumes.flatMap((consume) => consume.itemId !== null ? [consume.itemId] : consume.candidateItemIds),
  ))], [rows]);
  const itemQueries = useQueries({
    queries: itemIds.map((itemId) => ({
      queryKey: ["item-tooltip", itemId, undefined, undefined],
      queryFn: () => fetchItemTooltip({ itemId }),
      enabled: filter.trim().length > 0,
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });
  const itemNames = new Map<number, string>();
  itemIds.forEach((itemId, index) => {
    const name = itemQueries[index]?.data?.name;
    if (name) itemNames.set(itemId, name);
  });
  const filteredRows = filterConsumablesTotal(rows, filter, itemNames);
  const itemNamesLoading = filter.trim().length > 0
    && itemQueries.some((query) => query.isPending || query.isFetching);

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  return (
    <>
      <GenericPanel {...effectiveProps}>
        <div className="flex h-full min-h-0 flex-col gap-2">
          <label className="relative block shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter items or effects..."
              aria-label="Filter consumables by item or effect"
              className="h-8 w-full rounded border border-border bg-background/70 pl-8 pr-8 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Clear consumables filter"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </label>

          {rows.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {loading ? "Loading..." : "No consumable uses recorded"}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {itemNamesLoading ? "Searching item names..." : <>No items or effects match “{filter}”</>}
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="w-40 px-2 py-1.5 text-left font-medium">Player</th>
                    <th className="w-14 px-2 py-1.5 text-right font-medium">Total</th>
                    <th className="px-2 py-1.5 text-left font-medium">Consumes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, rowIndex) => {
                    const player = context.instance.players?.[row.playerId];
                    return (
                      <tr
                        key={row.playerId}
                        className={rowIndex % 2 === 0
                          ? "border-b border-border/20 align-top bg-muted/10 hover:bg-muted/30"
                          : "border-b border-border/20 align-top bg-muted/25 hover:bg-muted/40"}
                      >
                        <td className="px-2 py-2 font-medium">
                          <span style={{ color: `var(--color-class-${(player?.class ?? "unknown").toLowerCase()})` }}>
                            {player?.name ?? row.playerId}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{row.total}</td>
                        <td className="px-2 py-1.5">
                          <div className="flex flex-wrap gap-1.5">
                            {row.consumes.map((consume) => (
                              <ConsumeCount
                                key={consume.key}
                                consume={consume}
                                onOpenPossible={openPossibleBreakout}
                              />
                            ))}
                          </div>
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
      {possibleBreakout && (
        <FloatingIncomingEventsBreakout
          key={possibleBreakout.key}
          initialPosition={possibleBreakout.initialPosition}
          onClose={() => setPossibleBreakout(null)}
        >
          <PossibleItemsBreakout
            consume={possibleBreakout.consume}
            onClose={() => setPossibleBreakout(null)}
          />
        </FloatingIncomingEventsBreakout>
      )}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, react-refresh/only-export-components
export function createConsumablesTotalPanel(): PanelDefinition<ConsumablesResult, any> {
  return {
    ...consumablesTotalProcessor,
    label: "Consumes Total",
    icon: <FlaskConical className="h-4 w-4" />,
    underConstruction: true,
    supportsFiltering: true,
    defaultFilters: [
      { type: "source_type" as const, value: ["player"], applyTo: ["consume"] },
    ],
    render: (props) => <ConsumablesTotalContent {...props} />,
  };
}
