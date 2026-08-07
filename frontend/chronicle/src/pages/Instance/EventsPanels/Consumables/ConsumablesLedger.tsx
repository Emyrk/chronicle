import { useMemo } from "react";
import { Coins } from "lucide-react";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useDatasetId } from "@/hooks/useDatasetId";
import { useConsumableDisambiguations } from "@/api/queries";
import type { ConsumableDisambiguation } from "@/api/typesGenerated";
import { buildConsumableDisambiguationMap, resolveConsumableUse } from "./consumableDisambiguation";
import { GenericPanel } from "../GenericPanel";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { consumablesLedgerProcessor, type ConsumablesResult } from "./consumables.processor";
import {
  aggregateConsumablesLedger,
  formatGold,
  ledgerCoverage,
  NO_PRICES,
} from "./consumablesLedger";
import { AmbiguousSection, CoverageLine, LedgerRow } from "./LedgerShared";

type ConsumablesLedgerContentProps = PanelRenderProps<ConsumablesResult>;

export function ConsumablesLedgerContent(props: ConsumablesLedgerContentProps) {
  const { result, loading } = props;
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

  const ledger = useMemo(() => {
    // Dataset disambiguations must be applied before aggregating, or curated
    // uses stay stuck in the ambiguous bucket.
    const uses = [...(cachedResult?.uses.values() ?? [])].map((use) =>
      resolveConsumableUse(use, disambiguationMap),
    );
    return aggregateConsumablesLedger(uses, NO_PRICES);
  }, [cachedResult, disambiguationMap]);

  const coverage = ledgerCoverage(ledger);

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  return (
    <GenericPanel {...effectiveProps}>
      {ledger.totalUses === 0 ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          {loading ? "Loading..." : "No consumable uses recorded"}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2 pb-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
                Consumes used
              </span>
              <CoverageLine label={coverage.label} tone={coverage.tone} />
            </div>
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
            <div className="flex flex-col py-1">
              {ledger.rows.map((row) => (
                <LedgerRow
                  key={row.key}
                  row={row}
                  maxUses={ledger.maxUses}
                  subtitle={`${row.users} player${row.users === 1 ? "" : "s"}`}
                  showGold={coverage.showGold}
                />
              ))}
            </div>
            <AmbiguousSection
              rows={ledger.ambiguous}
              totalAmbiguousUses={ledger.ambiguousUses}
              showGold={coverage.showGold}
            />
          </ScrollArea>
        </div>
      )}
    </GenericPanel>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, react-refresh/only-export-components
export function createConsumablesLedgerPanel(): PanelDefinition<ConsumablesResult, any> {
  return {
    ...consumablesLedgerProcessor,
    label: "Consumes Used",
    icon: <Coins className="h-4 w-4" />,
    underConstruction: true,
    supportsFiltering: true,
    defaultFilters: [
      { type: "source_type" as const, value: ["player"], applyTo: ["consume"] },
    ],
    render: (props) => <ConsumablesLedgerContent {...props} />,
  };
}
