import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { lootProcessor, type LootResult } from "./loot.processor";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { Package, HelpCircle } from "lucide-react";
import { useInstanceLoot, type InstanceLoot } from "../../../../api/queries";
import { useItemTooltip } from "../../../../api/gamedata";
import { ItemTooltip } from "../../../../components/ui/ItemTooltip/ItemTooltip";
import { getQualityTextClass, getQualityBorderClass, getClassColorVar } from "../../../ArmoryPage/types";
import { getInstanceLootFilters, getInstanceTurninConfig, type InstanceTurninConfig } from "./lootFilters";
import { cn } from "../../../../lib/utils";

function getItemIconUrl(icon: string): string {
  if (!icon) return "";
  return `https://icons.chronicleclassic.com/${icon.toLowerCase()}.webp`;
}

// Quality levels displayed as filter badges (highest first)
const QUALITY_FILTERS = [
  { quality: 5, label: "Legendary", colorClass: "text-quality-legendary", bgActive: "bg-quality-legendary/20 border-quality-legendary/60", bgInactive: "bg-zinc-800/50 border-zinc-700" },
  { quality: 4, label: "Epic", colorClass: "text-quality-epic", bgActive: "bg-quality-epic/20 border-quality-epic/60", bgInactive: "bg-zinc-800/50 border-zinc-700" },
  { quality: 3, label: "Rare", colorClass: "text-quality-rare", bgActive: "bg-quality-rare/20 border-quality-rare/60", bgInactive: "bg-zinc-800/50 border-zinc-700" },
  { quality: 2, label: "Uncommon", colorClass: "text-quality-uncommon", bgActive: "bg-quality-uncommon/20 border-quality-uncommon/60", bgInactive: "bg-zinc-800/50 border-zinc-700" },
] as const;

// Default: Rare + Epic + Legendary enabled
const DEFAULT_QUALITIES = new Set([3, 4, 5]);

// ── panelOption encoding ────────────────────────────────────────────────────
// Quality filters:        "lq:345"          (digits = enabled quality levels)
// Instance filters:       "lf:011"          (one char per filter: 0=off, 1=on)
// Tokens are comma-separated in the panelOption string.

/** Encode enabled qualities into a panelOption token like "lq:345" */
function encodeQualities(qualities: Set<number>): string {
  return `lq:${Array.from(qualities).sort().join("")}`;
}

/** Decode qualities from panelOption string. Returns null if no lq: token found. */
function decodeQualities(panelOption: string | null | undefined): Set<number> | null {
  if (!panelOption) return null;
  for (const token of panelOption.split(",")) {
    if (token.startsWith("lq:")) {
      const digits = token.slice(3);
      return new Set(digits.split("").map(Number).filter((n) => n >= 0 && n <= 6));
    }
  }
  return null;
}

/** Encode instance filter states into "lf:110" (one bit per filter, positional). */
function encodeInstanceFilters(states: boolean[]): string {
  return `lf:${states.map((s) => (s ? "1" : "0")).join("")}`;
}

/** Decode instance filter states. Returns null if no lf: token found. */
function decodeInstanceFilters(panelOption: string | null | undefined, count: number): boolean[] | null {
  if (!panelOption) return null;
  for (const token of panelOption.split(",")) {
    if (token.startsWith("lf:")) {
      const bits = token.slice(3);
      return Array.from({ length: count }, (_, i) => (bits[i] ?? "1") === "1");
    }
  }
  return null;
}

function PlayerName({ guid, context }: { guid: string; context: PanelRenderProps<LootResult>["context"] }) {
  const player = context.instance.players?.[guid];
  const name = player?.name ?? guid;
  if (!player?.class) return <span>{name}</span>;
  return <span style={{ color: getClassColorVar(player.class) }}>{name}</span>;
}

/** Format millisecond offset as H:MM:SS or M:SS */
function formatOffset(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Format a timestamp as HH:MM:SS */
function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function LootRow({ item, context, useOffset, instanceStartMs, greyed, scrollRef }: { item: InstanceLoot; context: PanelRenderProps<LootResult>["context"]; useOffset: boolean; instanceStartMs: number; greyed?: boolean; scrollRef?: React.Ref<HTMLTableRowElement> }) {
  const [hovered, setHovered] = useState(false);
  const tooltip = useItemTooltip(
    hovered ? { itemId: item.item_id, randomProperty: item.loot_suffix || undefined } : null,
  );
  const traded = item.source_guid !== item.received_guid;
  const iconUrl = getItemIconUrl(item.icon);

  return (
    <tr
      ref={scrollRef}
      className={cn("border-b border-border/50", traded && "bg-muted/30", greyed && "opacity-50")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <td className="py-1 px-2">
        <div className="relative flex items-center gap-1.5">
          <div className={cn(
            "w-6 h-6 shrink-0 rounded border bg-zinc-900/80 flex items-center justify-center overflow-hidden",
            getQualityBorderClass(item.quality),
          )}>
            {iconUrl ? (
              <img src={iconUrl} alt={item.item_name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <HelpCircle className="w-3.5 h-3.5 text-zinc-500" />
            )}
          </div>
          <span className={cn("text-xs font-medium truncate", getQualityTextClass(item.quality))}>
            {item.item_name}{item.quantity > 1 && <span className="text-zinc-400"> x{item.quantity}</span>}
          </span>
          {hovered && tooltip.data && (
            <div className="fixed inset-0 z-50 flex items-center justify-center -translate-y-[15%] pointer-events-none">
              <ItemTooltip item={tooltip.data} />
            </div>
          )}
        </div>
      </td>
      <td className="py-1 px-2 text-xs">
        <PlayerName guid={String(item.received_guid)} context={context} />
        {traded && (
          <span className="text-zinc-500 ml-1 text-2xs italic">traded from <PlayerName guid={String(item.source_guid)} context={context} /></span>
        )}
      </td>
      <td className="py-1 px-2 text-2xs text-zinc-500 tabular-nums whitespace-nowrap">
        {useOffset
          ? formatOffset(new Date(item.source_ts).getTime() - instanceStartMs)
          : formatTimestamp(item.source_ts)}
      </td>
    </tr>
  );
}

// ── Turnin summary tab ──────────────────────────────────────────────────────

interface PlayerTurninRow {
  guid: string;
  totals: number[]; // one count per group
}

function TurninContent({ context, config, loot }: {
  context: PanelRenderProps<LootResult>["context"];
  config: InstanceTurninConfig;
  loot: InstanceLoot[];
}) {
  const selectedPlayerIds = context.entitySelection.playerIds;

  const rows = useMemo(() => {
    // Accumulate per-player counts for each group
    const playerMap = new Map<string, number[]>();

    for (const item of loot) {
      const receiverGuid = String(item.received_guid);
      if (selectedPlayerIds.size > 0 && !selectedPlayerIds.has(receiverGuid)) continue;
      for (let g = 0; g < config.groups.length; g++) {
        if (config.groups[g].itemIds.has(item.item_id)) {
          let totals = playerMap.get(receiverGuid);
          if (!totals) {
            totals = new Array(config.groups.length).fill(0);
            playerMap.set(receiverGuid, totals);
          }
          totals[g] += item.quantity;
        }
      }
    }

    // Sort by total descending
    const result: PlayerTurninRow[] = [];
    for (const [guid, totals] of playerMap) {
      result.push({ guid, totals });
    }
    result.sort((a, b) => {
      const sumA = a.totals.reduce((s, v) => s + v, 0);
      const sumB = b.totals.reduce((s, v) => s + v, 0);
      return sumB - sumA;
    });
    return result;
  }, [loot, config, selectedPlayerIds]);

  if (rows.length === 0) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No turnin items found</div>;
  }

  return (
    <div className="h-full overflow-auto styled-scrollbar">
      <div className="p-2">
        <table className="w-full">
          <thead>
            <tr className="text-muted-foreground border-b border-border text-xs">
              <th className="text-left py-1 px-2">Player</th>
              {config.groups.map((g) => (
                <th key={g.label} className="text-right py-1 px-2">{g.label}</th>
              ))}
              <th className="text-right py-1 px-2 font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const total = row.totals.reduce((s, v) => s + v, 0);
              return (
                <tr key={row.guid} className="border-b border-border/50">
                  <td className="py-1 px-2 text-xs">
                    <PlayerName guid={row.guid} context={context} />
                  </td>
                  {row.totals.map((count, g) => (
                    <td key={g} className="py-1 px-2 text-xs text-right tabular-nums">
                      {count || <span className="text-zinc-600">—</span>}
                    </td>
                  ))}
                  <td className="py-1 px-2 text-xs text-right tabular-nums font-semibold">{total}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LootTable({ filtered, context, useOffset, instanceStartMs, encounterStartMs }: {
  filtered: InstanceLoot[];
  context: PanelRenderProps<LootResult>["context"];
  useOffset: boolean;
  instanceStartMs: number;
  encounterStartMs: number | null;
}) {
  const firstRevealedRef = useRef<HTMLTableRowElement>(null);

  // Find the index of the first non-greyed item
  const firstRevealedIndex = useMemo(() => {
    if (encounterStartMs === null) return -1;
    return filtered.findIndex((item) => new Date(item.source_ts).getTime() >= encounterStartMs);
  }, [filtered, encounterStartMs]);

  // Auto-scroll to the first revealed row when encounter selection changes
  useEffect(() => {
    if (firstRevealedRef.current) {
      firstRevealedRef.current.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [encounterStartMs, firstRevealedIndex]);

  return (
    <table className="w-full">
      <thead>
        <tr className="text-muted-foreground border-b border-border text-xs">
          <th className="text-left py-1 px-2">Item</th>
          <th className="text-left py-1 px-2">Player</th>
          <th className="text-left py-1 px-2">Time</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map((item: InstanceLoot, i: number) => {
          const greyed = encounterStartMs !== null && new Date(item.source_ts).getTime() < encounterStartMs;
          return (
            <LootRow
              key={i}
              item={item}
              context={context}
              useOffset={useOffset}
              instanceStartMs={instanceStartMs}
              greyed={greyed}
              scrollRef={i === firstRevealedIndex ? firstRevealedRef : undefined}
            />
          );
        })}
      </tbody>
    </table>
  );
}

// ── Main loot content ───────────────────────────────────────────────────────

function LootContent({ context, panelOption, setPanelOption, useOffset }: Pick<PanelRenderProps<LootResult>, "context" | "panelOption" | "setPanelOption"> & { useOffset: boolean }) {
  const { data: loot, isLoading, error } = useInstanceLoot(context.instance.id);
  const [activeTab, setActiveTab] = useState<"loot" | "turnins">("loot");

  // Instance start time (earliest encounter start) for offset display
  const instanceStartMs = useMemo(() => {
    let earliest = Infinity;
    for (const enc of context.instance.encounters ?? []) {
      const t = new Date(enc.start_time).getTime();
      if (t < earliest) earliest = t;
    }
    return earliest === Infinity ? 0 : earliest;
  }, [context.instance.encounters]);

  // Turnin config (only some instances have this)
  const turninConfig = useMemo(
    () => getInstanceTurninConfig(context.instance.name),
    [context.instance.name],
  );

  // Instance-specific filters (e.g. "Hide Crafting Materials" for Molten Core)
  const instanceFilters = useMemo(
    () => getInstanceLootFilters(context.instance.name),
    [context.instance.name],
  );

  // Initialize from panelOption or defaults
  const [enabledQualities, setEnabledQualities] = useState<Set<number>>(
    () => decodeQualities(panelOption) ?? new Set(DEFAULT_QUALITIES),
  );
  const [instanceFilterStates, setInstanceFilterStates] = useState<boolean[]>(
    () => decodeInstanceFilters(panelOption, instanceFilters.length) ?? instanceFilters.map(() => true),
  );

  // Persist to panelOption on change (ref to avoid feedback loops)
  const setPanelOptionRef = useRef(setPanelOption);
  setPanelOptionRef.current = setPanelOption;
  const panelOptionRef = useRef(panelOption);
  panelOptionRef.current = panelOption;

  useEffect(() => {
    const current = panelOptionRef.current;
    const tokens = current ? current.split(",").filter((t) => !t.startsWith("lq:") && !t.startsWith("lf:")) : [];
    tokens.push(encodeQualities(enabledQualities));
    if (instanceFilters.length > 0) {
      tokens.push(encodeInstanceFilters(instanceFilterStates));
    }
    const next = tokens.join(",");
    if (next !== current) {
      setPanelOptionRef.current?.(next);
    }
  }, [enabledQualities, instanceFilterStates, instanceFilters.length]);

  const toggleQuality = useCallback((quality: number) => {
    setEnabledQualities((prev) => {
      const next = new Set(prev);
      if (next.has(quality)) {
        next.delete(quality);
      } else {
        next.add(quality);
      }
      return next;
    });
  }, []);

  const toggleInstanceFilter = useCallback((index: number) => {
    setInstanceFilterStates((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  }, []);

  // Build set of item IDs hidden by active instance filters
  const hiddenItemIds = useMemo(() => {
    const ids = new Set<number>();
    instanceFilters.forEach((f, i) => {
      if (instanceFilterStates[i]) {
        for (const id of f.itemIds) ids.add(id);
      }
    });
    return ids;
  }, [instanceFilters, instanceFilterStates]);

  // Earliest selected encounter start time — loot before this is greyed out
  const encounterStartMs = useMemo(() => {
    const ids = context.selectedEncounterIds;
    if (!ids || ids.length === 0) return null;
    const idSet = new Set(ids);
    let earliest = Infinity;
    for (const enc of context.instance.encounters ?? []) {
      if (idSet.has(enc.id)) {
        const t = new Date(enc.start_time).getTime();
        if (t < earliest) earliest = t;
      }
    }
    return earliest === Infinity ? null : earliest;
  }, [context.selectedEncounterIds, context.instance.encounters]);

  // Selected players filter — when players are selected, only show their loot
  const selectedPlayerIds = context.entitySelection.playerIds;

  const filtered = useMemo(() => {
    if (!loot) return [];
    return loot.filter((item) => {
      if (enabledQualities.size > 0 && !enabledQualities.has(item.quality)) return false;
      if (hiddenItemIds.has(item.item_id)) return false;
      if (selectedPlayerIds.size > 0 && !selectedPlayerIds.has(String(item.received_guid))) return false;
      return true;
    });
  }, [loot, enabledQualities, hiddenItemIds, selectedPlayerIds]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading loot…</div>;
  }
  if (error) {
    return <div className="flex items-center justify-center h-full text-destructive text-sm">Failed to load loot</div>;
  }
  if (!loot || loot.length === 0) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No loot recorded</div>;
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tabs — only show if turnin config exists */}
      {turninConfig && (
        <div className="flex border-b border-border shrink-0">
          <button
            onClick={() => setActiveTab("loot")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "loot"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Loot
          </button>
          <button
            onClick={() => setActiveTab("turnins")}
            className={cn(
              "px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "turnins"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {turninConfig.tabLabel}
          </button>
        </div>
      )}

      {/* Turnins tab */}
      {activeTab === "turnins" && turninConfig ? (
        <TurninContent context={context} config={turninConfig} loot={loot} />
      ) : (
        /* Loot tab */
        <div className="flex-1 overflow-auto styled-scrollbar">
          <div className="p-2">
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
              {QUALITY_FILTERS.map((qf) => {
                const active = enabledQualities.has(qf.quality);
                return (
                  <button
                    key={qf.quality}
                    onClick={() => toggleQuality(qf.quality)}
                    className={cn(
                      "px-2 py-0.5 rounded border text-2xs font-medium cursor-pointer select-none transition-colors",
                      active ? qf.bgActive : qf.bgInactive,
                      active ? qf.colorClass : "text-zinc-500",
                    )}
                  >
                    {qf.label}
                  </button>
                );
              })}
            </div>
            {instanceFilters.length > 0 && (
              <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <span className="text-2xs text-zinc-500 mr-0.5">Exclude:</span>
                {instanceFilters.map((f, i) => {
                  const active = instanceFilterStates[i];
                  return (
                    <button
                      key={`inst-${i}`}
                      onClick={() => toggleInstanceFilter(i)}
                      className={cn(
                        "px-2 py-0.5 rounded border text-2xs font-medium cursor-pointer select-none transition-colors",
                        active
                          ? "bg-red-500/15 border-red-500/50 text-red-400 line-through"
                          : "bg-zinc-800/50 border-zinc-700 text-zinc-500",
                      )}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>
            )}
            {encounterStartMs !== null && (
              <p className="text-2xs text-zinc-500 italic mb-1.5">Loot before the selected encounter is greyed out.</p>
            )}
            <LootTable filtered={filtered} context={context} useOffset={useOffset} instanceStartMs={instanceStartMs} encounterStartMs={encounterStartMs} />
          </div>
        </div>
      )}
    </div>
  );
}

export function createLootPanel(): PanelDefinition<LootResult, any> {
  return {
    ...lootProcessor,
    label: "Loot",
    icon: <Package className="h-4 w-4" />,
    selfManagesAggregation: true,
    checkboxLabel: "Instance offset",
    render: (props: PanelRenderProps<LootResult>) => (
      <LootContent
        context={props.context}
        panelOption={props.panelOption}
        setPanelOption={props.setPanelOption}
        useOffset={props.checkboxChecked}
      />
    ),
  };
}
