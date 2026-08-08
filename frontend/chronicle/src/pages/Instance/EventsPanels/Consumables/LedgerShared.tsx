/**
 * Shared presentational pieces for the consumables ledger panels
 * (raid-scope Consumes Used and player-scope Player Consumes).
 *
 * The visual language, from the design doc:
 *  - the bar is always uses, never gold;
 *  - gold is a right-hand number that reads "—" when unpriced;
 *  - ambiguous is a bucket below a rule, hatched icon, never a normal row.
 */

import { useQueries } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { fetchItemTooltip } from "@/api/gamedata";
import { useSpell } from "@/api/queries";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import { useDatasetId } from "@/hooks/useDatasetId";
import { cn } from "@/lib/utils";
import type { ConsumableUse } from "./consumables.processor";
import { ItemCell } from "./ConsumablesContent";
import {
  formatGold,
  type LedgerAmbiguousRow,
  type LedgerItemRow,
} from "./consumablesLedger";
import { fuzzyConsumableMatch, itemIdentity } from "./consumablesTotal";

/**
 * Fuzzy-filter resolved uses by item name (or id). Filtering happens at the
 * use level, BEFORE aggregation, so everything derived from it — rows, header
 * totals, roster bar heights, coverage — reacts to the filter. Item names
 * come from lazily fetched tooltips, so they load on the first keystroke. An
 * ambiguous use matches (and its bucket stays whole) when its effect name or
 * any candidate item matches.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useFilteredUses(uses: ConsumableUse[], filter: string): ConsumableUse[] {
  const itemIds = [
    ...new Set(
      uses.flatMap((use) => {
        const identified = itemIdentity(use).itemId;
        return identified !== null ? [identified] : use.candidateItemIds;
      }),
    ),
  ];
  const itemQueries = useQueries({
    queries: itemIds.map((itemId) => ({
      queryKey: ["item-tooltip", itemId, undefined, undefined],
      queryFn: () => fetchItemTooltip({ itemId }),
      enabled: filter.trim().length > 0,
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });

  const query = filter.trim();
  if (!query) return uses;

  const itemNames = new Map<number, string>();
  itemIds.forEach((itemId, index) => {
    const name = itemQueries[index]?.data?.name;
    if (name) itemNames.set(itemId, name);
  });

  return uses.filter((use) => {
    const identified = itemIdentity(use).itemId;
    if (identified !== null) {
      return fuzzyConsumableMatch(query, [itemNames.get(identified) ?? "", identified.toString()]);
    }
    return fuzzyConsumableMatch(query, [
      use.spellName,
      use.spellId?.toString() ?? "",
      ...use.candidateItemIds.flatMap((itemId) => [itemNames.get(itemId) ?? "", itemId.toString()]),
    ]);
  });
}

export function LedgerFilterInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative block shrink-0">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Filter consumes..."
        aria-label="Filter consumables by name"
        className="h-7 w-full rounded border border-border bg-background/70 pl-8 pr-8 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Clear consumables filter"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </label>
  );
}

// "muted" (no price data) renders amber too, matching the player view's
// gap line so both scopes read the same.
const COVERAGE_TONE_CLASS = {
  muted: "text-amber-400",
  warn: "text-amber-400",
  ok: "text-emerald-400/80",
} as const;

export function CoverageLine({ label, tone }: { label: string; tone: keyof typeof COVERAGE_TONE_CLASS }) {
  return <span className={cn("font-mono text-2xs", COVERAGE_TONE_CLASS[tone])}>{label}</span>;
}

export function UsesBar({ fraction, subtitle }: { fraction: number; subtitle: string }) {
  return (
    <div className="flex items-center gap-2 pl-6">
      {/* The dark track stays full-width so the omitted share reads as empty space. */}
      <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-background/70">
        <div
          className="h-full rounded-sm bg-foreground/30"
          style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }}
        />
      </div>
      <span className="shrink-0 font-mono text-2xs text-muted-foreground/70">{subtitle}</span>
    </div>
  );
}

export function GoldCell({ totalCopper, unitCopper }: { totalCopper: number | null; unitCopper: number | null }) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-end gap-0.5">
      <span className={cn("font-mono text-xs", totalCopper === null ? "text-muted-foreground/50" : "text-amber-300/90")}>
        {totalCopper === null ? "—" : formatGold(totalCopper)}
      </span>
      <span className="font-mono text-2xs text-muted-foreground/60">
        {unitCopper === null ? "no price" : `${formatGold(unitCopper)} ea`}
      </span>
    </div>
  );
}

export function LedgerRow({
  row,
  maxUses,
  subtitle,
  showGold,
  onClick,
  selected = false,
}: {
  row: LedgerItemRow;
  maxUses: number;
  /** Under-bar fact: "N players" at raid scope, "N fights" at player scope. */
  subtitle: string;
  showGold: boolean;
  /** When set, the row is clickable (opens the item breakout). */
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  selected?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 px-2 py-1",
        onClick && "cursor-pointer transition-colors hover:bg-muted/30",
        selected && "bg-amber-400/10 ring-1 ring-inset ring-amber-400/40",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1 text-xs">
            <ItemCell itemId={row.itemId} link newTab />
          </div>
          <span className="shrink-0 font-mono text-xs text-foreground">{row.uses}×</span>
        </div>
        <UsesBar fraction={maxUses > 0 ? row.uses / maxUses : 0} subtitle={subtitle} />
      </div>
      {showGold && <GoldCell totalCopper={row.totalCopper} unitCopper={row.unitCopper} />}
    </div>
  );
}

/** Hatched square marking an unresolved bucket. */
function AmbiguousIcon() {
  return (
    <span
      className="h-4.5 w-4.5 shrink-0 rounded border border-border/80"
      style={{
        background:
          "repeating-linear-gradient(45deg, color-mix(in srgb, currentColor 14%, transparent) 0 3px, transparent 3px 6px)",
      }}
    />
  );
}

/** The unresolved effect's real spell icon (with its tooltip on hover),
 * hatched over so it still reads as ambiguous. Falls back to the plain
 * hatched square while loading or when no spell is known. */
function AmbiguousSpellIcon({ spellId }: { spellId: number | null }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(spellId?.toString() ?? "", datasetId, { enabled: spellId != null });
  if (spellId == null || !spell) return <AmbiguousIcon />;
  return (
    <span className="relative shrink-0">
      <SpellIconWithTooltip spell={spell} size={18} />
      <span
        className="pointer-events-none absolute inset-0 rounded"
        style={{
          background: "repeating-linear-gradient(45deg, rgba(0,0,0,.55) 0 3px, transparent 3px 6px)",
        }}
      />
    </span>
  );
}

export function AmbiguousSection({
  rows,
  totalAmbiguousUses,
  showGold,
}: {
  rows: LedgerAmbiguousRow[];
  totalAmbiguousUses: number;
  showGold: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 bg-muted/10 px-2 pb-2 pt-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">Ambiguous</span>
        <span className="font-mono text-2xs text-muted-foreground/70">
          {totalAmbiguousUses} use{totalAmbiguousUses === 1 ? "" : "s"} in {rows.length} unresolved bucket{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {rows.map((row) => (
        <div key={row.key} className="flex items-start gap-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
              <AmbiguousSpellIcon spellId={row.spellId} />
              <span className="min-w-0 flex-1 truncate text-xs">
                {row.spellName || "Unknown consumable"}
              </span>
              <span className="shrink-0 font-mono text-xs">{row.uses}×</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-2xs text-muted-foreground/70">
              {row.candidateItemIds.length > 0 ? (
                <>
                  <span>could be</span>
                  {row.candidateItemIds.map((itemId) => (
                    <ItemCell key={itemId} itemId={itemId} link compact newTab />
                  ))}
                </>
              ) : (
                <span>effect seen, no item candidates in log</span>
              )}
            </div>
          </div>
          {/* An unresolved buff has no single price by definition. */}
          {showGold && <GoldCell totalCopper={null} unitCopper={null} />}
        </div>
      ))}
    </div>
  );
}
