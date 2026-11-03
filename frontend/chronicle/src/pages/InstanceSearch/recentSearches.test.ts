import { describe, expect, it } from "vitest";
import { addRecentSearch, loadRecentSearches, MAX_RECENT_SEARCHES, RECENT_SEARCHES_KEY, saveRecentSearches, type RecentSearch } from "./recentSearches";

const entry = (q: string, at = 1): RecentSearch => ({ q, mode: "form", at });

describe("recent searches", () => {
  it("moves a repeated search to the front instead of duplicating it", () => {
    const list = addRecentSearch([entry("a"), entry("b")], entry("b", 2));
    expect(list.map((r) => r.q)).toEqual(["b", "a"]);
    expect(list[0].at).toBe(2);
  });

  it("keeps only the newest ten", () => {
    let list: RecentSearch[] = [];
    for (let i = 0; i < 15; i++) list = addRecentSearch(list, entry(String(i)));
    expect(list).toHaveLength(MAX_RECENT_SEARCHES);
    expect(list[0].q).toBe("14");
  });

  it("round-trips through storage and ignores junk", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    saveRecentSearches([entry("a")], storage);
    expect(loadRecentSearches(storage)).toEqual([entry("a")]);

    store.set(RECENT_SEARCHES_KEY, JSON.stringify([entry("a"), { q: 1 }, "x"]));
    expect(loadRecentSearches(storage)).toEqual([entry("a")]);
    store.set(RECENT_SEARCHES_KEY, "{not json");
    expect(loadRecentSearches(storage)).toEqual([]);
  });

  it("survives blocked storage", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadRecentSearches(blocked)).toEqual([]);
    expect(() => saveRecentSearches([entry("a")], blocked)).not.toThrow();
  });
});
