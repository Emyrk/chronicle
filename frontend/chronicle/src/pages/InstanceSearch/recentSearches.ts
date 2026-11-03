/** A search the user ran, kept in this browser so it can be reloaded. */
export interface RecentSearch {
  /** The encoded query, as in the `q` URL param. */
  q: string;
  mode: "form" | "blocks" | "code";
  /** Epoch milliseconds of the last time it ran. */
  at: number;
}

export const RECENT_SEARCHES_KEY = "chronicle.instanceSearch.recent";
export const MAX_RECENT_SEARCHES = 10;

function isRecent(v: unknown): v is RecentSearch {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return typeof r.q === "string" && typeof r.at === "number" && (r.mode === "form" || r.mode === "blocks" || r.mode === "code");
}

/** Reads recent searches, newest first. Storage can be missing or blocked. */
export function loadRecentSearches(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): RecentSearch[] {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(RECENT_SEARCHES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

/** Moves (or adds) a search to the front, keeping the newest ten. */
export function addRecentSearch(list: RecentSearch[], entry: RecentSearch): RecentSearch[] {
  return [entry, ...list.filter((r) => r.q !== entry.q)].slice(0, MAX_RECENT_SEARCHES);
}

export function saveRecentSearches(list: RecentSearch[], storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage) {
  try {
    storage?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    // Private windows and full storage just lose history.
  }
}
