import { describe, expect, it } from "vitest";
import { selectTechnicalHint } from "./technicalHintRotation";
import { STATIC_TECHNICAL_HINTS, STATIC_TECHNICAL_HINTS_RESPONSE } from "./staticTechnicalHints";
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
  generated_at: "1970-01-01T00:00:00.000Z",
  refresh_after: "1970-01-01T00:00:00.000Z",
  payloads: [
    { id: "tip-one", kind: "tip", title: "One", body: "First tip" },
    { id: "tip-two", kind: "tip", title: "Two", body: "Second tip" },
    { id: "tip-three", kind: "tip", title: "Three", body: "Third tip" },
  ],
};

describe("static technical hints", () => {
  it("uses feature-oriented destinations and excludes vehicle support", () => {
    const byID = new Map(STATIC_TECHNICAL_HINTS.map((hint) => [hint.id, hint]));

    expect(byID.get("blog-armory-refresh")).toMatchObject({ title: "Player Armory", href: "/armory" });
    expect(byID.get("blog-talent-builder-refresh")).toMatchObject({ title: "Talent Calculator", href: "/talents" });
    expect(byID.get("blog-youtube-sync-refresh")).toMatchObject({ title: "YouTube Sync", href: "/youtube-sync-v3" });
    expect(byID.get("blog-consumables-panel")?.title).toBe("Consumable Tracking");
    expect(byID.has("blog-vehicle-support")).toBe(false);
  });

  it("provides tips, panel insights, and articles without an API", () => {
    expect(STATIC_TECHNICAL_HINTS_RESPONSE.payloads).toHaveLength(STATIC_TECHNICAL_HINTS.length);
    expect(STATIC_TECHNICAL_HINTS.some((hint) => hint.kind === "tip")).toBe(true);
    expect(STATIC_TECHNICAL_HINTS.some((hint) => hint.kind === "panel")).toBe(true);
    expect(STATIC_TECHNICAL_HINTS.some((hint) => hint.kind === "blog")).toBe(true);
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
