import { useCallback, useEffect, useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";
import type { PaidBillingTier } from "@/pages/Settings/billingPricing";
import { entityKey, type EntityKind, type EntityRef } from "./entity";
import type { EntityAction } from "./EntityMenu";

/** Matches the comparison limit on the performance and guild history pages. */
export const MAX_COMPARE = 5;
/**
 * The lowest tier that sees player and guild quick stats in the compare tray and can expand them;
 * below it, a preview. Encounter kill times are free for everyone.
 */
export const STATS_TIER: PaidBillingTier = "revered";

const STORAGE_KEY = "chronicle.entity-compare";
const HIDDEN_KEY = "chronicle.entity-compare-hidden";
const RANGE_KEY = "chronicle.quick-stats-range";

/** How far back the tray's stats and chart look. */
export type QuickRange = "30d" | "60d" | "180d";
export const QUICK_RANGES: readonly QuickRange[] = ["30d", "60d", "180d"];
export const QUICK_RANGE_DAYS: Record<QuickRange, number> = { "30d": 30, "60d": 60, "180d": 180 };

/** The tray's range, remembered per browser. */
export function useQuickRange(): [QuickRange, (range: QuickRange) => void] {
  const [range, setRange] = useState<QuickRange>(() => {
    try {
      const stored = localStorage.getItem(RANGE_KEY);
      return QUICK_RANGES.includes(stored as QuickRange) ? (stored as QuickRange) : "180d";
    } catch {
      return "180d";
    }
  });
  const choose = useCallback((next: QuickRange) => {
    setRange(next);
    try {
      localStorage.setItem(RANGE_KEY, next);
    } catch {
      // Remembering the range is a convenience.
    }
  }, []);
  return [range, choose];
}

export const KIND_LABEL: Record<EntityKind, { one: string; many: string }> = {
  character: { one: "player", many: "players" },
  guild: { one: "guild", many: "guilds" },
  encounter: { one: "encounter", many: "encounters" },
};

/** Same colors as the Alt outlines in index.css. */
export function kindColor(kind: EntityKind): string {
  if (kind === "guild") return "var(--color-amber-400)";
  if (kind === "encounter") return "var(--color-rose-400)";
  return "var(--color-sky-400)";
}

function readList<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeList(key: string, values: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Storage can be unavailable (private windows); the tray still works for this page.
  }
}

/** Where a pin was added, so the tray can say so after you've moved on. */
export interface PinOrigin {
  /** Path and query of the page. */
  path: string;
  label: string;
  /** When it was added (ISO). */
  at: string;
}

export type Pin = EntityRef & { origin?: PinOrigin };

/** A name for pages that don't describe themselves, from their path. */
export function originLabelForPath(pathname: string): string {
  const routes: [string, string][] = [
    ["/instances/", "A log"],
    ["/performance-history", "Performance history"],
    ["/guild-history", "Guild clear-time history"],
    ["/armory", "Armory"],
    ["/g/", "Guild page"],
    ["/leaderboards", "Leaderboards"],
  ];
  return routes.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "Chronicle";
}

/**
 * Players, guilds and encounters collected to compare, and which of them are hidden from the stats
 * (Shift+click, as on the history pages). Kept per browser so the tray follows you between pages.
 */
export function useComparePins() {
  const [pins, setPins] = useState<Pin[]>(() => readList<Pin>(STORAGE_KEY));
  const [hiddenKeys, setHiddenKeys] = useState<string[]>(() => readList<string>(HIDDEN_KEY));

  useEffect(() => writeList(STORAGE_KEY, pins), [pins]);
  useEffect(() => writeList(HIDDEN_KEY, hiddenKeys), [hiddenKeys]);

  const toggle = useCallback((entity: EntityRef, origin?: PinOrigin) => {
    const key = entityKey(entity);
    setPins((current) => {
      if (current.some((pin) => entityKey(pin) === key)) return current.filter((pin) => entityKey(pin) !== key);
      if (current.filter((pin) => pin.kind === entity.kind).length >= MAX_COMPARE) return current;
      return [...current, origin ? { ...entity, origin } : entity];
    });
    // Re-adding someone always shows them.
    setHiddenKeys((current) => current.filter((hidden) => hidden !== key));
  }, []);

  const toggleHidden = useCallback((entity: EntityRef) => {
    const key = entityKey(entity);
    setHiddenKeys((current) => (current.includes(key) ? current.filter((hidden) => hidden !== key) : [...current, key]));
  }, []);

  const clear = useCallback((kind: EntityKind) => {
    setPins((current) => current.filter((pin) => pin.kind !== kind));
    setHiddenKeys((current) => current.filter((key) => !key.startsWith(`${kind}:`)));
  }, []);

  const hidden = useMemo(() => new Set(hiddenKeys), [hiddenKeys]);
  return { pins, hidden, toggle, toggleHidden, clear };
}

/** The menu's "Add to compare" entry, for everyone; disabled once that kind is full. */
export function compareAction(
  entity: EntityRef,
  pins: EntityRef[],
  toggle: (entity: EntityRef, origin?: PinOrigin) => void,
  origin: () => PinOrigin,
): EntityAction {
  const key = entityKey(entity);
  if (pins.some((pin) => entityKey(pin) === key)) {
    return { id: "compare", label: "Remove from compare", icon: Minus, onSelect: () => toggle(entity) };
  }
  const full = pins.filter((pin) => pin.kind === entity.kind).length >= MAX_COMPARE;
  return {
    id: "compare",
    label: "Add to compare",
    icon: Plus,
    onSelect: () => toggle(entity, origin()),
    disabled: full ? `Compare holds ${MAX_COMPARE} ${KIND_LABEL[entity.kind].many}` : undefined,
  };
}
