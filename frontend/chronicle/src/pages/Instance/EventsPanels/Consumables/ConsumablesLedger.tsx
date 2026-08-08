import { useMemo, useState } from "react";
import { Coins, User } from "lucide-react";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useDatasetId } from "@/hooks/useDatasetId";
import { useConsumableDisambiguations } from "@/api/queries";
import type { ConsumableDisambiguation } from "@/api/typesGenerated";
import { buildConsumableDisambiguationMap, resolveConsumableUse } from "./consumableDisambiguation";
import { GenericPanel } from "../GenericPanel";
import { FloatingIncomingEventsBreakout } from "../IncomingEvents/FloatingIncomingEventsBreakout";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { consumablesLedgerProcessor, type ConsumablesResult } from "./consumables.processor";
import { ConsumablesPlayerContent } from "./ConsumablesPlayer";
import {
  aggregateConsumablesLedger,
  aggregateItemBreakout,
  classRank,
  CLASS_ORDER,
  formatGold,
  ledgerCoverage,
  NO_PRICES,
} from "./consumablesLedger";
import { LedgerItemBreakout, type LedgerItemBreakoutData } from "./LedgerItemBreakout";
import {
  AmbiguousSection,
  CoverageLine,
  LedgerFilterInput,
  LedgerRow,
  panelOptionTokens,
  togglePanelOptionFlag,
  useFilteredUses,
  VIEW_ALL_TOKEN,
} from "./LedgerShared";
import { ConsumablesTotalContent } from "./ConsumablesTotal";

/** All-players view with a way back to the single-player view. */
function ConsumablesAllContent(props: ConsumablesLedgerContentProps) {
  return (
    <ConsumablesTotalContent
      {...props}
      headerExtra={
        <button
          type="button"
          onClick={() => props.setPanelOption?.(togglePanelOptionFlag(props.panelOption, VIEW_ALL_TOKEN, false))}
          title="Show one player at a time"
          className="flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded border border-border px-2 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
        >
          <User className="h-3.5 w-3.5" />
          Single Player
        </button>
      }
    />
  );
}

type ConsumablesLedgerContentProps = PanelRenderProps<ConsumablesResult>;

interface BreakoutState {
  itemId: number;
  initialPosition: { x: number; y: number };
}

/** Raid-wide ledger, shown while the "Raid Wide" toggle is on. */
export function ConsumablesLedgerContent(props: ConsumablesLedgerContentProps) {
  const { result, context, loading } = props;
  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (value) => !!value && value.uses instanceof Map && value.uses.size > 0,
    [props.panelContextVersion],
  );

  const datasetId = useDatasetId();
  const { data: disambiguations } = useConsumableDisambiguations(datasetId);
  const disambiguationMap = useMemo(
    () => buildConsumableDisambiguationMap(disambiguations as ConsumableDisambiguation[] | undefined),
    [disambiguations],
  );

  // Dataset disambiguations must be applied before aggregating, or curated
  // uses stay stuck in the ambiguous bucket.
  const resolvedUses = useMemo(
    () => [...(cachedResult?.uses.values() ?? [])].map((use) => resolveConsumableUse(use, disambiguationMap)),
    [cachedResult, disambiguationMap],
  );

  // Filtering happens before aggregation so the header totals, coverage
  // line, and bar scale all react to the filter, not just the row list.
  const [filter, setFilter] = useState("");
  const filteredUses = useFilteredUses(resolvedUses, filter);

  const ledger = useMemo(
    () => aggregateConsumablesLedger(filteredUses, NO_PRICES),
    [filteredUses],
  );

  const coverage = ledgerCoverage(ledger);

  // Several breakouts can be open at once — one per item, toggled per row.
  const [breakouts, setBreakouts] = useState<BreakoutState[]>([]);

  const toggleBreakout = (itemId: number, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const view = target.ownerDocument.defaultView;
    const x = Math.max(8, Math.min(rect.right + 8, (view?.innerWidth ?? 640) - 340));
    const y = Math.max(8, Math.min(rect.top, (view?.innerHeight ?? 480) - 200));
    setBreakouts((previous) =>
      previous.some((b) => b.itemId === itemId)
        ? previous.filter((b) => b.itemId !== itemId)
        : [...previous, { itemId, initialPosition: { x, y } }],
    );
  };
  const closeBreakout = (itemId: number) => {
    setBreakouts((previous) => previous.filter((b) => b.itemId !== itemId));
  };

  const breakoutDatas = useMemo<LedgerItemBreakoutData[]>(() => {
    const players = context.instance.players ?? {};
    const classSizes = new Map<string, number>();
    for (const player of Object.values(players)) {
      classSizes.set(player.class, (classSizes.get(player.class) ?? 0) + 1);
    }

    return breakouts.flatMap((breakout) => {
      const ledgerRow = ledger.rows.find((row) => row.itemId === breakout.itemId);
      if (!ledgerRow) return [];

      const rows = aggregateItemBreakout(resolvedUses, breakout.itemId).map((count) => {
        const player = players[count.player];
        return { guid: count.player, name: player?.name ?? count.player, cls: player?.class, uses: count.uses };
      });
      // Most uses first, ties by name now that names are known.
      rows.sort((a, b) => b.uses - a.uses || a.name.localeCompare(b.name));

      // The rest of the raid: everyone who never used the item.
      const userGuids = new Set(rows.map((row) => row.guid));
      const nonUsers = Object.entries(players)
        .filter(([guid]) => !userGuids.has(guid))
        .map(([guid, player]) => ({ guid, name: player.name ?? guid, cls: player.class, uses: 0 }))
        .sort(
          (a, b) =>
            classRank(a.cls) - classRank(b.cls) ||
            CLASS_ORDER.indexOf(a.cls ?? "") - CLASS_ORDER.indexOf(b.cls ?? "") ||
            a.name.localeCompare(b.name),
        );

      const usedByClass = new Map<string, number>();
      for (const row of rows) {
        if (!row.cls) continue;
        usedByClass.set(row.cls, (usedByClass.get(row.cls) ?? 0) + 1);
      }
      const classes = [...usedByClass.entries()]
        .map(([cls, used]) => ({ cls, used, of: classSizes.get(cls) ?? used }))
        .sort((a, b) => classRank(a.cls) - classRank(b.cls) || CLASS_ORDER.indexOf(a.cls) - CLASS_ORDER.indexOf(b.cls));

      return [{
        itemId: breakout.itemId,
        unitCopper: ledgerRow.unitCopper,
        showGold: coverage.showGold,
        raidSize: Object.keys(players).length,
        rows,
        nonUsers,
        classes,
      }];
    });
  }, [breakouts, ledger.rows, resolvedUses, context.instance.players, coverage.showGold]);

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  return (
    <>
      <GenericPanel {...effectiveProps}>
        {resolvedUses.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            {loading ? "Loading..." : "No consumable uses recorded"}
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-2">
            <LedgerFilterInput value={filter} onChange={setFilter} />
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2 pb-2">
              <CoverageLine label={coverage.label} tone={coverage.tone} />
              <div className="flex flex-col items-end gap-0.5">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {ledger.totalUses} <span className="text-2xs font-normal text-muted-foreground">uses</span>
                </span>
                {coverage.showGold && (
                  <span className="font-mono text-xs text-amber-300/90">{formatGold(ledger.totalCopper)}</span>
                )}
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              {/* Right gutter so rows don't sit under the overlay scrollbar. */}
              <div className="pr-2.5">
              {ledger.rows.length === 0 && ledger.ambiguous.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">
                  No consumes match “{filter}”
                </div>
              ) : (
                <>
                  <div className="flex flex-col py-1">
                    {ledger.rows.map((row) => (
                      <LedgerRow
                        key={row.key}
                        row={row}
                        maxUses={ledger.maxUses}
                        subtitle={`${row.users} player${row.users === 1 ? "" : "s"}`}
                        showGold={coverage.showGold}
                        onClick={(event) => toggleBreakout(row.itemId, event.currentTarget)}
                        selected={breakouts.some((b) => b.itemId === row.itemId)}
                      />
                    ))}
                  </div>
                  <AmbiguousSection
                    rows={ledger.ambiguous}
                    totalAmbiguousUses={ledger.ambiguousUses}
                    showGold={coverage.showGold}
                  />
                </>
              )}
              </div>
            </ScrollArea>
          </div>
        )}
      </GenericPanel>
      {breakouts.map((breakout) => {
        const data = breakoutDatas.find((d) => d.itemId === breakout.itemId);
        if (!data) return null;
        return (
          <FloatingIncomingEventsBreakout
            key={breakout.itemId}
            initialPosition={breakout.initialPosition}
            onClose={() => closeBreakout(breakout.itemId)}
          >
            <LedgerItemBreakout data={data} onClose={() => closeBreakout(breakout.itemId)} />
          </FloatingIncomingEventsBreakout>
        );
      })}
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, react-refresh/only-export-components
export function createConsumablesLedgerPanel(): PanelDefinition<ConsumablesResult, any> {
  return {
    ...consumablesLedgerProcessor,
    label: "Consumes Used",
    icon: <Coins className="h-4 w-4" />,
    supportsFiltering: true,
    // One panel, two scopes: the checkbox flips between the per-player view
    // (off, default) and the raid-wide ledger (on).
    checkboxLabel: "Raid Wide",
    // Scope toggle, player selection, view flags, and card chrome never
    // change what the worker computes — switching views must not re-process
    // the stream.
    renderOnlyOptionTokens: ["cb", "pl:", "va", "bc:", "t:"],
    defaultFilters: [
      { type: "source_type" as const, value: ["player"], applyTo: ["consume"] },
    ],
    render: (props) => {
      if (props.checkboxChecked) return <ConsumablesLedgerContent {...props} />;
      if (panelOptionTokens(props.panelOption).includes(VIEW_ALL_TOKEN)) {
        return <ConsumablesAllContent {...props} />;
      }
      return <ConsumablesPlayerContent {...props} />;
    },
  };
}
