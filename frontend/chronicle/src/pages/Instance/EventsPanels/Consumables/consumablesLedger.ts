/**
 * Count-led consumables ledger (pure TS, unit-testable).
 *
 * The bar is always uses, never gold — a fact we always have — so the same
 * layout serves every price state: fully priced, partially priced, or (as
 * today) no price data at all. Gold is a right-hand number that can quietly
 * read "—" without breaking the ranking or the shape of the list.
 *
 * Ambiguous is a bucket, not a row: uses that could not be tied to a single
 * item (even after dataset disambiguation) count toward the header uses total
 * but never toward gold — an unresolved buff has no single price by definition.
 *
 * Callers MUST resolve uses through `resolveConsumableUse` before aggregating,
 * otherwise curated disambiguations are ignored and uses stay in the
 * ambiguous bucket.
 */

import type { ConsumableUse } from "./consumables.processor";
import { itemIdentity } from "./consumablesTotal";

/** Unit prices in copper, keyed by item ID. Empty until price data exists. */
export type ConsumablePrices = ReadonlyMap<number, number>;

/** Placeholder until a price data source exists (see world_item_template). */
export const NO_PRICES: ConsumablePrices = new Map();

export interface LedgerItemRow {
  key: string;
  itemId: number;
  uses: number;
  /** Distinct players that used the item. */
  users: number;
  /** Distinct encounters the item was seen in. */
  encounters: number;
  /** Unit price in copper, null when unpriced. */
  unitCopper: number | null;
  /** uses × unitCopper, null when unpriced. */
  totalCopper: number | null;
}

export interface LedgerAmbiguousRow {
  key: string;
  /** Effect that could not be resolved to one item (display label). */
  spellId: number | null;
  spellName: string;
  /** Empty when the use had no candidates at all. */
  candidateItemIds: number[];
  uses: number;
  users: number;
  encounters: number;
}

export interface ConsumablesLedger {
  /** Identified items, sorted by gold total then uses (unpriced sink last). */
  rows: LedgerItemRow[];
  /** Unresolved buckets, sorted by uses. */
  ambiguous: LedgerAmbiguousRow[];
  /** All physical uses: identified + ambiguous. */
  totalUses: number;
  identifiedUses: number;
  ambiguousUses: number;
  pricedRows: number;
  unpricedRows: number;
  /** Gold total across priced rows only, in copper. */
  totalCopper: number;
  /** Largest row use count (bar scale); includes ambiguous buckets. */
  maxUses: number;
}

export function aggregateConsumablesLedger(
  uses: Iterable<ConsumableUse>,
  prices: ConsumablePrices,
): ConsumablesLedger {
  interface Bucket {
    itemId: number | null;
    candidateItemIds: number[];
    spellId: number | null;
    spellName: string;
    uses: number;
    players: Set<string>;
    encounters: Set<string>;
  }
  const buckets = new Map<string, Bucket>();

  for (const use of uses) {
    const identity = itemIdentity(use);
    let bucket = buckets.get(identity.key);
    if (!bucket) {
      bucket = {
        itemId: identity.itemId,
        candidateItemIds: identity.candidateItemIds,
        spellId: use.spellId,
        spellName: use.spellName,
        uses: 0,
        players: new Set(),
        encounters: new Set(),
      };
      buckets.set(identity.key, bucket);
    }
    bucket.uses += 1;
    bucket.players.add(use.player);
    bucket.encounters.add(use.encounterID);
    if (!bucket.spellName && use.spellName) {
      bucket.spellName = use.spellName;
      bucket.spellId = use.spellId;
    }
  }

  const rows: LedgerItemRow[] = [];
  const ambiguous: LedgerAmbiguousRow[] = [];
  for (const [key, bucket] of buckets) {
    if (bucket.itemId !== null) {
      const unitCopper = prices.get(bucket.itemId) ?? null;
      rows.push({
        key,
        itemId: bucket.itemId,
        uses: bucket.uses,
        users: bucket.players.size,
        encounters: bucket.encounters.size,
        unitCopper,
        totalCopper: unitCopper === null ? null : unitCopper * bucket.uses,
      });
    } else {
      ambiguous.push({
        key,
        spellId: bucket.spellId,
        spellName: bucket.spellName,
        candidateItemIds: bucket.candidateItemIds,
        uses: bucket.uses,
        users: bucket.players.size,
        encounters: bucket.encounters.size,
      });
    }
  }

  // Sort by gold, fall back to uses. Unpriced rows rank at zero gold, so
  // they collect at the bottom in count order rather than scattering.
  rows.sort(
    (a, b) =>
      (b.totalCopper ?? 0) - (a.totalCopper ?? 0) ||
      b.uses - a.uses ||
      a.key.localeCompare(b.key),
  );
  ambiguous.sort((a, b) => b.uses - a.uses || a.key.localeCompare(b.key));

  const identifiedUses = rows.reduce((sum, row) => sum + row.uses, 0);
  const ambiguousUses = ambiguous.reduce((sum, row) => sum + row.uses, 0);
  const pricedRows = rows.filter((row) => row.unitCopper !== null).length;

  return {
    rows,
    ambiguous,
    totalUses: identifiedUses + ambiguousUses,
    identifiedUses,
    ambiguousUses,
    pricedRows,
    unpricedRows: rows.length - pricedRows,
    totalCopper: rows.reduce((sum, row) => sum + (row.totalCopper ?? 0), 0),
    maxUses: Math.max(0, ...rows.map((row) => row.uses), ...ambiguous.map((row) => row.uses)),
  };
}

/** Roster display order: melee/physical classes first, mirroring raid-frame convention. */
export const CLASS_ORDER = [
  "WARRIOR", "ROGUE", "HUNTER", "DRUID", "PALADIN", "SHAMAN", "PRIEST", "MAGE", "WARLOCK", "DEATHKNIGHT",
];

export function classRank(cls: string | undefined): number {
  const index = CLASS_ORDER.indexOf(cls ?? "");
  return index === -1 ? CLASS_ORDER.length : index;
}

export function classColor(cls: string | undefined): string {
  return `var(--color-class-${(cls ?? "unknown").toLowerCase()})`;
}

const CLASS_ABBREVIATIONS: Record<string, string> = {
  WARRIOR: "WAR", ROGUE: "ROG", HUNTER: "HUN", DRUID: "DRU", PALADIN: "PAL",
  SHAMAN: "SHM", PRIEST: "PRI", MAGE: "MAG", WARLOCK: "LOCK", DEATHKNIGHT: "DK",
};

export function classAbbreviation(cls: string | undefined): string {
  if (!cls) return "?";
  return CLASS_ABBREVIATIONS[cls] ?? cls.slice(0, 3).toUpperCase();
}

export interface ItemBreakoutCount {
  player: string;
  uses: number;
}

/**
 * Per-player use counts for one identified item, most uses first. Uses must
 * already be resolved through `resolveConsumableUse`; single-candidate uses
 * count toward their item like everywhere else in the ledger.
 */
export function aggregateItemBreakout(
  uses: Iterable<ConsumableUse>,
  itemId: number,
): ItemBreakoutCount[] {
  const counts = new Map<string, number>();
  for (const use of uses) {
    if (itemIdentity(use).itemId !== itemId) continue;
    counts.set(use.player, (counts.get(use.player) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([player, count]) => ({ player, uses: count }))
    .sort((a, b) => b.uses - a.uses || a.player.localeCompare(b.player));
}

export interface PlayerItemUse {
  offsetMilli: number;
  /** Only ever seen as an already-active pre-pull buff (or before the pull). */
  prePull: boolean;
}

export interface PlayerItemEncounterRow {
  encounterID: string;
  uses: PlayerItemUse[];
}

/**
 * One player's uses of one identified item, grouped by encounter in
 * first-use order. Uses must already be resolved through
 * `resolveConsumableUse`.
 */
export function aggregatePlayerItemEncounters(
  uses: Iterable<ConsumableUse>,
  player: string,
  itemId: number,
): PlayerItemEncounterRow[] {
  const rows = new Map<string, PlayerItemEncounterRow>();
  for (const use of uses) {
    if (use.player !== player || itemIdentity(use).itemId !== itemId) continue;
    let row = rows.get(use.encounterID);
    if (!row) {
      row = { encounterID: use.encounterID, uses: [] };
      rows.set(use.encounterID, row);
    }
    row.uses.push({
      offsetMilli: use.offsetMilli,
      prePull: use.activeAtPullOnly || use.offsetMilli < 0,
    });
  }
  for (const row of rows.values()) {
    row.uses.sort((a, b) => a.offsetMilli - b.offsetMilli);
  }
  return [...rows.values()];
}

/** In-fight timestamp for a use: "m:ss" into the encounter, or "pre-pull". */
export function formatEncounterOffset(use: PlayerItemUse): string {
  if (use.prePull) return "pre-pull";
  const totalSeconds = Math.floor(use.offsetMilli / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Compact WoW money format: gold-led, sub-gold amounts fall back to s/c. */
export function formatGold(copper: number): string {
  const gold = copper / 10_000;
  if (gold >= 100) return `${Math.round(gold).toLocaleString()}g`;
  if (gold >= 1) {
    const rounded = Math.round(gold * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}g`;
  }
  const silver = Math.floor(copper / 100);
  if (silver >= 1) return `${silver}s`;
  return `${copper}c`;
}

/**
 * Header coverage line. Never total across a gap silently: the gold figure is
 * always qualified where it's read. No prices is a layout, not an error.
 */
export function ledgerCoverage(ledger: ConsumablesLedger): {
  label: string;
  tone: "muted" | "warn" | "ok";
  /** False in the no-price-data state: gold was never a column. */
  showGold: boolean;
} {
  if (ledger.rows.length === 0 || ledger.pricedRows === 0) {
    return { label: "no price data", tone: "muted", showGold: false };
  }
  if (ledger.unpricedRows > 0) {
    return {
      label: `${ledger.unpricedRows} of ${ledger.rows.length} unpriced`,
      tone: "warn",
      showGold: true,
    };
  }
  return {
    label: `${ledger.rows.length} of ${ledger.rows.length} priced`,
    tone: "ok",
    showGold: true,
  };
}
