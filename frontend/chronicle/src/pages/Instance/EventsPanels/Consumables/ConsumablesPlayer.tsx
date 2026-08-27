/**
 * Player-scope view of the consumables ledger. Rendered by the Consumes Used
 * panel when its "Raid Wide" toggle is off — this file defines no panel of
 * its own.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { ChevronsUpDown, Search, Users } from "lucide-react";
import { usePortalContainer } from "@/components/ui/PortalContainerContext";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
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
  aggregatePlayerItemEncounters,
  classColor,
  classRank,
  formatGold,
  ledgerCoverage,
} from "./consumablesLedgerLogic";
import { useConsumablePrices } from "./useConsumablePrices";
import { FloatingIncomingEventsBreakout } from "../IncomingEvents/FloatingIncomingEventsBreakout";
import { PlayerItemBreakout, type PlayerItemBreakoutData } from "./LedgerItemBreakout";
import {
  AmbiguousSection,
  LedgerFilterInput,
  LedgerRow,
  useFilteredUses,
  VIEW_ALL_TOKEN,
} from "./LedgerShared";

const PLAYER_TOKEN = "pl:";

interface RosterEntry {
  guid: string;
  name: string;
  cls: string | undefined;
}

/** Searchable player picker: the player name is the trigger. */
function PlayerCombobox({
  roster,
  usesByPlayer,
  selected,
  onSelect,
}: {
  roster: RosterEntry[];
  usesByPlayer: ReadonlyMap<string, number>;
  selected: RosterEntry;
  onSelect: (guid: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const portalContainer = usePortalContainer();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return roster;
    return roster.filter(
      (player) =>
        player.name.toLowerCase().includes(query) ||
        (player.cls ?? "").toLowerCase().includes(query),
    );
  }, [roster, search]);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        {/* Fixed width so the class label and step arrows after it don't
            shift as names of different lengths cycle through. */}
        <button
          type="button"
          className="group flex w-28 shrink-0 cursor-pointer items-center gap-1 rounded px-0.5 transition-colors hover:bg-muted/40"
          title="Change player"
        >
          <span className="min-w-0 flex-1 truncate text-left text-sm font-medium" style={{ color: classColor(selected.cls) }}>
            {selected.name}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={portalContainer}>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-56 rounded-md border border-border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            inputRef.current?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search players..."
              aria-label="Search players"
              className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1 styled-scrollbar">
            {filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No players found</p>
            )}
            {filtered.map((player) => {
              const uses = usesByPlayer.get(player.guid) ?? 0;
              return (
                <button
                  key={player.guid}
                  type="button"
                  onClick={() => {
                    onSelect(player.guid);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-accent",
                    player.guid === selected.guid && "bg-muted/50",
                  )}
                >
                  <span
                    className="min-w-0 flex-1 truncate font-medium"
                    style={{ color: classColor(player.cls) }}
                  >
                    {player.name}
                  </span>
                  <span className="shrink-0 font-mono text-2xs text-muted-foreground/70">
                    {uses > 0 ? `${uses}×` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
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

  // Filtering happens before any aggregation so the roster bars, header
  // totals, and combobox counts all react to the filter, not just the rows.
  const [filter, setFilter] = useState("");
  const filteredUses = useFilteredUses(resolvedUses, filter);
  const prices = useConsumablePrices(context.instance.id, resolvedUses);

  const usesByPlayer = useMemo(() => {
    const counts = new Map<string, number>();
    for (const use of filteredUses) {
      counts.set(use.player, (counts.get(use.player) ?? 0) + 1);
    }
    return counts;
  }, [filteredUses]);

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

  // Roster bar heights: gold spent per player when we have it, but when gold
  // is missing for more than half of the players that used anything, fall
  // back to use counts so the strip stays comparable.
  const rosterBars = useMemo(() => {
    const goldByPlayer = new Map<string, number>();
    for (const use of filteredUses) {
      if (use.itemId === null) continue;
      const unitCopper = prices.get(use.itemId);
      if (unitCopper === undefined) continue;
      goldByPlayer.set(use.player, (goldByPlayer.get(use.player) ?? 0) + unitCopper);
    }
    const activeGuids = [...usesByPlayer.entries()].filter(([, uses]) => uses > 0).map(([guid]) => guid);
    const missingGold = activeGuids.filter((guid) => (goldByPlayer.get(guid) ?? 0) === 0).length;
    const byGold = activeGuids.length > 0 && missingGold * 2 <= activeGuids.length;
    const valueOf = (guid: string) =>
      byGold ? (goldByPlayer.get(guid) ?? 0) : (usesByPlayer.get(guid) ?? 0);
    const max = Math.max(1, ...roster.map((player) => valueOf(player.guid)));
    return { byGold, goldByPlayer, valueOf, max };
  }, [filteredUses, usesByPlayer, roster, prices]);

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

  // Switch to the all-players view. Folds any pending debounced player
  // selection into the same panelOption write so neither token is lost.
  const enterViewAll = () => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    const pendingGuid = pendingGuidRef.current;
    pendingGuidRef.current = null;
    let tokens = optionTokens.filter((token) => token !== VIEW_ALL_TOKEN);
    if (pendingGuid !== null) {
      tokens = tokens.filter((token) => !token.startsWith(PLAYER_TOKEN));
      tokens.push(`${PLAYER_TOKEN}${pendingGuid}`);
    }
    tokens.push(VIEW_ALL_TOKEN);
    setPanelOption?.(tokens.join(","));
  };

  const ledger = useMemo(
    () =>
      aggregateConsumablesLedger(
        filteredUses.filter((use) => use.player === selected?.guid),
        prices,
      ),
    [filteredUses, selected?.guid, prices],
  );

  const coverage = ledgerCoverage(ledger);

  const gapParts: string[] = [];
  if (coverage.showGold && ledger.unpricedRows > 0) gapParts.push(`${ledger.unpricedRows} unpriced`);
  if (!coverage.showGold && ledger.rows.length > 0) gapParts.push(coverage.label);
  if (ledger.ambiguous.length > 0) {
    gapParts.push(`${ledger.ambiguous.length} unresolved`);
  }

  // Per-item breakouts (which fights the item was used in). Several can be
  // open at once, each pinned to the player it was opened for so switching
  // players keeps them comparable.
  const [breakouts, setBreakouts] = useState<
    { key: string; guid: string; itemId: number; initialPosition: { x: number; y: number } }[]
  >([]);

  const toggleBreakout = (itemId: number, target: HTMLElement) => {
    if (!selected) return;
    const key = `${selected.guid}:${itemId}`;
    const rect = target.getBoundingClientRect();
    const view = target.ownerDocument.defaultView;
    const x = Math.max(8, Math.min(rect.right + 8, (view?.innerWidth ?? 640) - 340));
    const y = Math.max(8, Math.min(rect.top, (view?.innerHeight ?? 480) - 200));
    setBreakouts((previous) =>
      previous.some((b) => b.key === key)
        ? previous.filter((b) => b.key !== key)
        : [...previous, { key, guid: selected.guid, itemId, initialPosition: { x, y } }],
    );
  };
  const closeBreakout = (key: string) => {
    setBreakouts((previous) => previous.filter((b) => b.key !== key));
  };

  const breakoutDatas = useMemo<Map<string, PlayerItemBreakoutData>>(() => {
    const encounterOrder = new Map(
      (context.instance.encounters ?? []).map((encounter, index) => [encounter.id, { encounter, index }]),
    );
    const players = context.instance.players ?? {};
    const datas = new Map<string, PlayerItemBreakoutData>();
    for (const breakout of breakouts) {
      const rows = aggregatePlayerItemEncounters(resolvedUses, breakout.guid, breakout.itemId)
        .map((row) => {
          const known = encounterOrder.get(row.encounterID);
          return {
            encounterID: row.encounterID,
            name: known?.encounter.name ?? row.encounterID,
            boss: known?.encounter.boss ?? false,
            order: known?.index ?? Number.MAX_SAFE_INTEGER,
            uses: row.uses,
          };
        })
        .sort((a, b) => a.order - b.order);
      if (rows.length === 0) continue;
      const player = players[breakout.guid];
      datas.set(breakout.key, {
        itemId: breakout.itemId,
        playerName: player?.name ?? breakout.guid,
        cls: player?.class,
        rows,
      });
    }
    return datas;
  }, [breakouts, resolvedUses, context.instance.encounters, context.instance.players]);

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  return (
    <>
      <GenericPanel {...effectiveProps}>
      {roster.length === 0 || !selected ? (
        <div className="py-4 text-center text-xs text-muted-foreground">
          {loading ? "Loading..." : "No players found"}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 pb-2">
            <LedgerFilterInput value={filter} onChange={setFilter} />
          </div>
          <div
            className="flex shrink-0 items-center justify-between gap-2 px-2 pb-2"
            data-lesson-target="read-consumables"
            data-demo-consumables-player-header
          >
            <div className="flex min-w-0 items-center gap-2" data-demo-consumables-player-identity>
              <span
                className="h-4 w-1 shrink-0 rounded-full"
                style={{ background: classColor(selected.cls) }}
              />
              <PlayerCombobox
                roster={roster}
                usesByPlayer={usesByPlayer}
                selected={selected}
                onSelect={selectPlayer}
              />
              <span className="w-18 shrink-0 truncate font-mono text-2xs capitalize text-muted-foreground/70">
                {selected.cls?.toLowerCase() ?? "unknown"}
              </span>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  aria-label="Previous player"
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  aria-label="Next player"
                  className="flex h-5 w-5 cursor-pointer items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                  ›
                </button>
              </div>
              <button
                type="button"
                onClick={enterViewAll}
                title="View all players at once"
                data-demo-consumables-view-all
                data-lesson-target="view-all-consumables"
                className="flex h-5 shrink-0 cursor-pointer items-center gap-1 rounded border border-border/60 px-1.5 text-2xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
              >
                <Users className="h-3 w-3" />
                View All
              </button>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5" data-demo-consumables-player-total>
              <span className="font-mono text-sm font-semibold text-foreground">
                {ledger.totalUses} <span className="text-2xs font-normal text-muted-foreground">uses</span>
              </span>
              {coverage.showGold && (
                <span className="font-mono text-xs text-amber-300/90">{formatGold(ledger.totalCopper)}</span>
              )}
            </div>
          </div>

          <div
            className="flex h-9 shrink-0 items-end gap-1 border-y border-border/60 px-2 pb-1 pt-1.5"
            data-lesson-target="read-consumables"
            data-demo-consumables-roster
          >
            {roster.map((player, index) => {
              const uses = usesByPlayer.get(player.guid) ?? 0;
              const gold = rosterBars.goldByPlayer.get(player.guid) ?? 0;
              const value = rosterBars.valueOf(player.guid);
              const heightPct = Math.max(16, (value / rosterBars.max) * 100);
              return (
                // HintTooltip: delayed, hoverable variant — the instant
                // Tooltip flickers when the content opens under the cursor.
                <HintTooltip key={player.guid} delayDuration={150}>
                  <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => selectPlayer(player.guid)}
                  className={cn(
                    "group/bar flex h-full min-w-0 flex-1 cursor-pointer items-end overflow-hidden rounded-sm bg-background/80",
                    index === selectedIndex && "ring-1 ring-inset ring-foreground/70",
                  )}
                >
                  {uses === 0 ? (
                    // No matching consumes at all: an explicitly empty slot — a
                    // dashed box with a class-colored dash — so it can't be
                    // mistaken for a very small bar.
                    <span className="flex h-full w-full items-center justify-center rounded-sm border border-dashed border-foreground/20">
                      <span
                        className="h-0.5 w-1/2 rounded-full opacity-60 transition-opacity group-hover/bar:opacity-100"
                        style={{ background: classColor(player.cls) }}
                      />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "w-full rounded-sm transition-opacity",
                        index === selectedIndex ? "opacity-100" : "opacity-70 group-hover/bar:opacity-100",
                      )}
                      style={{ background: classColor(player.cls), height: `${heightPct}%` }}
                    />
                  )}
                </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    sideOffset={6}
                    hideArrow
                    className="flex flex-col gap-0.5 border border-border bg-popover text-popover-foreground shadow-md"
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium" style={{ color: classColor(player.cls) }}>
                        {player.name}
                      </span>
                      <span className="text-2xs capitalize text-muted-foreground">
                        {player.cls?.toLowerCase() ?? "unknown"}
                      </span>
                    </div>
                    <div className="font-mono text-2xs text-foreground/80">
                      {uses} consume{uses === 1 ? "" : "s"} used
                    </div>
                    <div className={cn("font-mono text-2xs", gold > 0 ? "text-amber-300/90" : "text-muted-foreground")}>
                      {gold > 0 ? formatGold(gold) : "no price data"}
                    </div>
                  </TooltipContent>
                </HintTooltip>
              );
            })}
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
              {loading
                ? "Loading..."
                : filter.trim()
                  ? <>No consumes match “{filter}”</>
                  : "No consumable uses recorded for this player"}
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1">
              {/* Right gutter so rows don't sit under the overlay scrollbar. */}
              <div className="pr-2.5">
              <div className="flex flex-col py-1">
                {ledger.rows.map((row) => (
                  <LedgerRow
                    key={row.key}
                    row={row}
                    maxUses={ledger.maxUses}
                    subtitle={`${row.encounters} fight${row.encounters === 1 ? "" : "s"}`}
                    showGold={coverage.showGold}
                    onClick={(event) => toggleBreakout(row.itemId, event.currentTarget)}
                    selected={breakouts.some((b) => b.key === `${selected.guid}:${row.itemId}`)}
                  />
                ))}
              </div>
              <AmbiguousSection
                rows={ledger.ambiguous}
                totalAmbiguousUses={ledger.ambiguousUses}
                showGold={coverage.showGold}
              />
              </div>
            </ScrollArea>
          )}
        </div>
      )}
      </GenericPanel>
      {breakouts.map((breakout) => {
        const data = breakoutDatas.get(breakout.key);
        if (!data) return null;
        return (
          <FloatingIncomingEventsBreakout
            key={breakout.key}
            initialPosition={breakout.initialPosition}
            onClose={() => closeBreakout(breakout.key)}
          >
            <PlayerItemBreakout data={data} onClose={() => closeBreakout(breakout.key)} />
          </FloatingIncomingEventsBreakout>
        );
      })}
    </>
  );
}
