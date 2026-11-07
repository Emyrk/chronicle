import { afterEach, describe, expect, it, vi } from "vitest";
import { configuration } from "./v2RatingAdapter.testdata";
import { resolvedHubMetadata } from "./resolvedHubAdapter";
import {
  createV2Pager,
  v2RatingParams,
  v2PlayerEntry,
  type V2RatingContext,
} from "./v2RatingAdapter";
const cohorts = [
  {
    player_class: "MAGE",
    player_spec: "Frost",
    player_sub_spec: "",
    metric: "dps",
  },
];
const context: V2RatingContext = {
  configuration,
  cohorts,
  instance: "Raid",
  difficulty: "",
  size: 0,
  subject: "player",
  performance: "dps",
  selected: [],
};
afterEach(() => vi.unstubAllGlobals());
describe("existing Hub adapter", () => {
  it("adapts Vanilla metadata without inventing variants and preserves named empty sets", () => {
    const data = resolvedHubMetadata(
      configuration,
      { instanceName: "Raid", performance: "dps" },
      [],
      cohorts,
    );
    expect(data.instances).toHaveLength(1);
    expect(data.selected_cohort).toEqual({
      difficulty_name: "",
      max_players: 0,
    });
    expect(data.ranking_encounter_sets).toContainEqual({
      id: "empty",
      label: "Empty",
      encounters: [],
    });
    expect(() =>
      resolvedHubMetadata(
        { ...configuration, conflict: "Conflict" },
        { performance: "dps" },
        [],
        [],
      ),
    ).toThrow("Conflict");
    expect(() =>
      resolvedHubMetadata(
        { ...configuration, tenant_id: null },
        { performance: "dps" },
        [],
        [],
      ),
    ).toThrow("specific server");
  });
  it("defaults to all cohorts and narrows only explicit class/spec filters", () => {
    const all = v2RatingParams(context, {}, "mastery");
    expect(Object.fromEntries(all)).toMatchObject({
      max_players: "0",
      difficulty: "",
      set: "default",
      metric: "dps",
    });
    expect(all.has("class")).toBe(false);
    expect(all.has("spec")).toBe(false);
    const exact = v2RatingParams(
      context,
      { cls: "MAGE", spec: "Frost", subSpec: "" },
      "peak",
    );
    expect(Object.fromEntries(exact)).toMatchObject({
      class: "MAGE",
      spec: "Frost",
      sub_spec: "",
      metric: "dps",
    });
    expect(
      v2RatingParams(
        { ...context, selected: ["B", "A", "A"] },
        {},
        "peak",
      ).getAll("bosses"),
    ).toEqual(["A", "B"]);
  });
  it("Renown follows boss selections and ignores class filters while retaining variant and realm", () => {
    const p = v2RatingParams(
      {
        ...context,
        difficulty: "Heroic",
        size: 25,
        realmIDs: ["realm"],
        selected: ["A"],
      },
      { boss: "A", cls: "MAGE", spec: "Frost" },
      "renown",
    );
    expect(Object.fromEntries(p)).toEqual({
      instance: "Raid",
      difficulty: "Heroic",
      max_players: "25",
      subject: "player",
      kind: "renown",
      score: "renown",
      realm: "realm",
      boss: "A",
    });
    expect(
      v2RatingParams({ ...context, subject: "guild" }, {}, "mastery").has(
        "class",
      ),
    ).toBe(false);
  });
  it("uses the same default and arbitrary selection for player and guild Renown", () => {
    for (const subject of ["player", "guild"] as const) {
      expect(
        v2RatingParams({ ...context, subject }, {}, "renown").get("set"),
      ).toBe("default");
      const group = v2RatingParams(
        { ...context, subject, selected: ["B", "A", "A"] },
        {},
        "renown",
      );
      expect(group.getAll("bosses")).toEqual(["A", "B"]);
      expect(group.has("metric")).toBe(false);
      expect(group.toString()).not.toBe(
        v2RatingParams(
          { ...context, subject, selected: ["A"] },
          {},
          "renown",
        ).toString(),
      );
    }
  });
  it("uses API cursors in existing page controls, scopes search and preserves zeros without global ranks", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          entries: [
            {
              realm_id: "r",
              subject_id: "p",
              name: "Player",
              peak: 0,
              mastery: 0,
              renown: 0,
            },
          ],
          next_cursor: "opaque",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ entries: [], next_cursor: "" }),
      });
    vi.stubGlobal("fetch", fetch);
    const pager = createV2Pager(context);
    const first = await pager({
      scope: {},
      metric: "mastery",
      query: "",
      page: 0,
    });
    expect(first.rows[0].entry.score).toBe(0);
    expect(first.total).toBeUndefined();
    expect(first.rows[0].rank).toBe(0);
    expect(first.hasNextPage).toBe(true);
    await pager({ scope: {}, metric: "mastery", query: "", page: 1 });
    expect(fetch.mock.calls[1][0]).toContain("cursor=opaque");
    await expect(
      pager({ scope: {}, metric: "mastery", query: "other", page: 1 }),
    ).rejects.toThrow("first page");
  });
});

it("preserves returned cohort identity for two specs of the same player", () => {
  const common = {
    realm_id: "realm",
    subject_id: "same",
    name: "Mage",
    score: 98,
    peak: 98,
    mastery: 98,
    renown: 0,
    sample_count: 10,
    computed_at: "2026-01-01",
    player_class: "MAGE",
    player_spec: "Frost",
    player_sub_spec: "",
  };
  const frost = v2PlayerEntry(common, new URLSearchParams(), "peak");
  const arcane = v2PlayerEntry(
    { ...common, player_spec: "Arcane" },
    new URLSearchParams(),
    "peak",
  );
  expect(frost.cls).toBe("MAGE");
  expect(frost.spec).toBe("Frost");
  expect(frost.id).not.toBe(arcane.id);
  expect(frost.guid).toBe(arcane.guid);
});
