import { describe, expect, it } from "vitest";
import {
  readCachedTechnicalHints,
  TECHNICAL_HINTS_CACHE_TTL_MS,
  writeCachedTechnicalHints,
} from "./technicalHintsCache";
import { selectTechnicalHint } from "./technicalHintRotation";
import { mergeTechnicalHints, STATIC_TECHNICAL_HINTS } from "./staticTechnicalHints";
import type { TechnicalHintsResponse } from "./types";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const response: TechnicalHintsResponse = {
  version: "v1",
  generated_at: "2026-10-23T12:00:00Z",
  refresh_after: "2026-10-23T12:15:00Z",
  payloads: [
    { id: "tip-one", kind: "tip", title: "One", body: "First tip" },
    { id: "tip-two", kind: "tip", title: "Two", body: "Second tip" },
    { id: "tip-three", kind: "tip", title: "Three", body: "Third tip" },
  ],
};

describe("technical hints cache", () => {
  it("round-trips a valid response", () => {
    const storage = createStorage();
    writeCachedTechnicalHints(response, storage, 1_000);
    expect(readCachedTechnicalHints(storage, 2_000)).toEqual(response);
  });

  it("discards malformed and stale cache entries", () => {
    const malformed = createStorage();
    malformed.setItem("chronicle-technical-hints-v1", "not-json");
    expect(readCachedTechnicalHints(malformed, 2_000)).toBeUndefined();

    const stale = createStorage();
    writeCachedTechnicalHints(response, stale, 1_000);
    expect(readCachedTechnicalHints(stale, 1_000 + TECHNICAL_HINTS_CACHE_TTL_MS)).toBeUndefined();
  });

  it("filters expired dynamic payloads without removing static tips", () => {
    const storage = createStorage();
    writeCachedTechnicalHints({
      ...response,
      payloads: [
        response.payloads[0],
        {
          id: "activity-old",
          kind: "community_fact",
          title: "Yesterday",
          body: "Old activity",
          expires_at: "2026-10-23T12:00:00Z",
        },
      ],
    }, storage, Date.parse("2026-10-23T11:00:00Z"));

    expect(readCachedTechnicalHints(storage, Date.parse("2026-10-23T13:00:00Z"))?.payloads)
      .toEqual([response.payloads[0]]);
  });
});

describe("static technical hints", () => {
  it("uses feature-oriented destinations and excludes vehicle support", () => {
    const byID = new Map(STATIC_TECHNICAL_HINTS.map((hint) => [hint.id, hint]));

    expect(byID.get("blog-armory-refresh")).toMatchObject({
      title: "Player Armory",
      href: "/armory",
    });
    expect(byID.get("blog-talent-builder-refresh")).toMatchObject({
      title: "Talent Calculator",
      href: "/talents",
    });
    expect(byID.get("blog-youtube-sync-refresh")).toMatchObject({
      title: "YouTube Sync",
      href: "/youtube-sync-v3",
    });
    expect(byID.get("blog-consumables-panel")?.title).toBe("Consumable Tracking");
    expect(byID.has("blog-vehicle-support")).toBe(false);
    expect(mergeTechnicalHints({
      ...response,
      payloads: [{
        id: "blog-vehicle-support",
        kind: "blog",
        title: "Vehicle support",
        body: "Stale API payload",
      }],
    }).payloads.some((hint) => hint.id === "blog-vehicle-support")).toBe(false);
  });

  it("provides a catalog without the API and merges dynamic facts by stable ID", () => {
    const fallback = mergeTechnicalHints(undefined);
    expect(fallback.payloads).toHaveLength(STATIC_TECHNICAL_HINTS.length);
    expect(fallback.payloads.some((hint) => hint.kind === "tip")).toBe(true);
    expect(fallback.payloads.some((hint) => hint.kind === "panel")).toBe(true);
    expect(fallback.payloads.some((hint) => hint.kind === "blog")).toBe(true);

    const merged = mergeTechnicalHints({
      ...response,
      payloads: [
        ...response.payloads,
        { id: "activity-24h", kind: "community_fact", title: "Today", body: "42 runs" },
      ],
    });
    expect(merged.payloads.some((hint) => hint.id === "activity-24h")).toBe(true);
  });
});

describe("technical hint rotation", () => {
  it("assigns distinct hints before repeating and keeps placements stable", () => {
    const storage = createStorage();
    const random = () => 0;

    const first = selectTechnicalHint(response, "recent-grid-card-1", storage, random);
    const second = selectTechnicalHint(response, "recent-grid-card-2", storage, random);
    const third = selectTechnicalHint(response, "recent-grid-card-3", storage, random);

    expect(new Set([first?.id, second?.id, third?.id]).size).toBe(3);
    expect(selectTechnicalHint(response, "recent-grid-card-1", storage, random)).toEqual(first);
  });

  it("starts a new board when the response version changes", () => {
    const storage = createStorage();
    const initial = selectTechnicalHint(response, "recent-grid-card-1", storage, () => 0);
    const changed = selectTechnicalHint({
      ...response,
      version: "v2",
      payloads: [{ id: "replacement", kind: "tip", title: "New", body: "New tip" }],
    }, "recent-grid-card-1", storage, () => 0);

    expect(initial?.id).not.toBe(changed?.id);
    expect(changed?.id).toBe("replacement");
  });
});
