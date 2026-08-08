/**
 * Player-scope view of the consumables ledger. Rendered by the Consumes Used
 * panel when its "Raid Wide" toggle is off — this file defines no panel of
 * its own.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useDatasetId } from "@/hooks/useDatasetId";
import { useConsumableDisambiguations } from "@/api/queries";
import type { ConsumableDisambiguation } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";
import { buildConsumableDisambiguationMap, resolveConsumableUse } from "./consumableDisambiguation";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import type { ConsumablesResult } from "./consumables.processor";
import {
  aggregateConsumablesLedger,
  formatGold,
  ledgerCoverage,
  NO_PRICES,
} from "./consumablesLedger";
import { AmbiguousSection, LedgerRow } from "./LedgerShared";

const PLAYER_TOKEN = "pl:";

/** Roster display order: melee/physical classes first, mirroring raid-frame convention. */
const CLASS_ORDER = [
  "WARRIOR", "ROGUE", "HUNTER", "DRUID", "PALADIN", "SHAMAN", "PRIEST", "MAGE", "WARLOCK", "DEATHKNIGHT",
];

function classRank(cls: string | undefined): number {
  const index = CLASS_ORDER.indexOf(cls ?? "");
  return index === -1 ? CLASS_ORDER.length : index;
}

function classColor(cls: string | undefined): string {
  return `var(--color-class-${(cls ?? "unknown").toLowerCase()})`;
}

type ConsumablesPlayerContentProps = PanelRenderProps<ConsumablesResult>;

export function ConsumablesPlayerContent(props: ConsumablesPlayerContentProps) {
  const { result, context, loading, panelOption, setPanelOption } = props;
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

  // Curated disambiguations are applied before any grouping, so a resolved
  // use lands on its item row instead of the ambiguous bucket.
  const resolvedUses = useMemo(
    () => [...(cachedResult?.uses.values() ?? [])].map((use) => resolveConsumableUse(use, disambiguationMap)),
    [cachedResult, disambiguationMap],
  );

  const usesByPlayer = useMemo(() => {
    const counts = new Map<string, number>();
    for (const use of resolvedUses) {
      counts.set(use.player, (counts.get(use.player) ?? 0) + 1);
    }
    return counts;
  }, [resolvedUses]);

  const roster = useMemo(() => {
    const players = Object.entries(context.instance.players ?? {}).map(([guid, player]) => ({
      guid,
      name: player.name,
      cls: player.class,
    }));
    players.sort(
      (a, b) => classRank(a.cls) - classRank(b.cls) || a.name.localeCompare(b.name),
    );
    return players;
  }, [context.instance.players]);

  // panelOption is a comma-separated token list shared with the panel-level
  // "Raid Wide" checkbox ("cb"); only the pl: token belongs to this view.
  const optionTokens = useMemo(
    () =>
      (panelOption ?? "")
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0),
    [panelOption],
  );
  const optionGuid = useMemo(() => {
    const token = optionTokens.find((part) => part.startsWith(PLAYER_TOKEN));
    return token ? token.slice(PLAYER_TOKEN.length) : null;
  }, [optionTokens]);

  // Selection renders from local state so switching is instant. Writing the
  // pl: token into panelOption goes through the router (URL update) and
  // re-keys the worker aggregation, so it re-renders the whole instance page
  // — debounce it to once per settle instead of once per click. Until the
  // first click, the persisted URL token drives the selection.
  const [clickedGuid, setClickedGuid] = useState<string | null>(null);
  const selectedGuid = clickedGuid ?? optionGuid;

  const optionTokensRef = useRef(optionTokens);
  const setPanelOptionRef = useRef(setPanelOption);
  useEffect(() => {
    optionTokensRef.current = optionTokens;
    setPanelOptionRef.current = setPanelOption;
  }, [optionTokens, setPanelOption]);
  const pendingGuidRef = useRef<string | null>(null);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSelection = useCallback(() => {
    const guid = pendingGuidRef.current;
    if (guid === null) return;
    pendingGuidRef.current = null;
    const tokens = optionTokensRef.current.filter((part) => !part.startsWith(PLAYER_TOKEN));
    tokens.push(`${PLAYER_TOKEN}${guid}`);
    setPanelOptionRef.current?.(tokens.join(","));
  }, []);

  useEffect(
    () => () => {
      // Persist the last selection when the panel unmounts mid-debounce.
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushSelection();
    },
    [flushSelection],
  );

  const selectedIndex = useMemo(() => {
    const bySelection = roster.findIndex((player) => player.guid === selectedGuid);
    if (bySelection !== -1) return bySelection;
    const firstWithUses = roster.findIndex((player) => (usesByPlayer.get(player.guid) ?? 0) > 0);
    return firstWithUses !== -1 ? firstWithUses : 0;
  }, [roster, selectedGuid, usesByPlayer]);

  const selected = roster[selectedIndex];

  const selectPlayer = (guid: string) => {
    setClickedGuid(guid);
    pendingGuidRef.current = guid;
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushSelection, 400);
  };
  const step = (delta: number) => {
    if (roster.length === 0) return;
    const next = (selectedIndex + delta + roster.length) % roster.length;
    selectPlayer(roster[next].guid);
  };

  const ledger = useMemo(
    () =>
      aggregateConsumablesLedger(
        resolvedUses.filter((use) => use.player === selected?.guid),
        NO_PRICES,
      ),
    [resolvedUses, selected?.guid],
  );

  const coverage = ledgerCoverage(ledger);
  const gapParts: string[] = [];
  if (coverage.showGold && ledger.unpricedRows > 0) gapParts.push(`${ledger.unpricedRows} unpriced`);
  if (!coverage.showGold && ledger.rows.length > 0) gapParts.push(coverage.label);
  if (ledger.ambiguous.length > 0) {
    gapParts.push(`${ledger.ambiguous.length} unresolved`);
  }

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  return (
    <GenericPanel {...effectiveProps}>
      {roster.length === 0 || !selected ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          {loading ? "Loading..." : "No players found"}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 px-2 pb-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="h-4 w-1 shrink-0 rounded-full"
                style={{ background: classColor(selected.cls) }}
              />
              <span className="truncate text-sm font-medium" style={{ color: classColor(selected.cls) }}>
                {selected.name}
              </span>
              <span className="shrink-0 font-mono text-2xs capitalize text-muted-foreground/70">
                {selected.cls?.toLowerCase() ?? "unknown"}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous player"
                  className="flex h-5 w-5 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next player"
                  className="flex h-5 w-5 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  ›
                </button>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className="font-mono text-sm font-semibold text-foreground">
                {ledger.totalUses} <span className="text-2xs font-normal text-muted-foreground">uses</span>
              </span>
              {coverage.showGold && (
                <span className="font-mono text-xs text-amber-300/90">{formatGold(ledger.totalCopper)}</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 border-y border-border/60 px-2 py-1.5">
            {roster.map((player, index) => (
              <button
                key={player.guid}
                type="button"
                title={`${player.name} · ${player.cls?.toLowerCase() ?? "unknown"}${
                  usesByPlayer.get(player.guid) ? ` · ${usesByPlayer.get(player.guid)} uses` : " · no uses"
                }`}
                onClick={() => selectPlayer(player.guid)}
                className={cn(
                  "h-4 min-w-0 flex-1 rounded-sm transition-opacity",
                  index === selectedIndex
                    ? "opacity-100 ring-1 ring-inset ring-foreground/60"
                    : "opacity-30 hover:opacity-70",
                )}
                style={{ background: classColor(player.cls) }}
              />
            ))}
          </div>

          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-2 py-1">
            <span className={cn("font-mono text-2xs", gapParts.length > 0 ? "text-amber-400" : "text-muted-foreground/60")}>
              {gapParts.length > 0 ? gapParts.join(" · ") : "all resolved"}
            </span>
            <span className="font-mono text-2xs text-muted-foreground/60">
              {selectedIndex + 1} / {roster.length}
            </span>
          </div>

          {ledger.totalUses === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">
              {loading ? "Loading..." : "No consumable uses recorded for this player"}
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col py-1">
                {ledger.rows.map((row) => (
                  <LedgerRow
                    key={row.key}
                    row={row}
                    maxUses={ledger.maxUses}
                    subtitle={`${row.encounters} fight${row.encounters === 1 ? "" : "s"}`}
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
          )}
        </div>
      )}
    </GenericPanel>
  );
}
