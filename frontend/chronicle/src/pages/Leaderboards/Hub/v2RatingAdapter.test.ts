import { afterEach, describe, expect, it, vi } from "vitest";
import { configuration } from "./v2RatingAdapter.testdata";
import { resolvedHubMetadata } from "./resolvedHubAdapter";
import {
  createV2Pager,
  v2RatingParams,
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
  it("maps exact performance cohort and preset, never silently combines cohorts", () => {
    expect(
      Object.fromEntries(v2RatingParams(context, {}, "mastery")),
    ).toMatchObject({
      max_players: "0",
      difficulty: "",
      set: "default",
      class: "MAGE",
      spec: "Frost",
      metric: "dps",
    });
    expect(() =>
      v2RatingParams(
        {
          ...context,
          cohorts: [...cohorts, { ...cohorts[0], player_spec: "Fire" }],
        },
        {},
        "peak",
      ),
    ).toThrow("exact performance cohort");
    expect(() =>
      v2RatingParams({ ...context, selected: ["A", "B"] }, {}, "peak"),
    ).toThrow("configured encounter set");
  });
  it("Renown ignores boss/class selections while retaining selected variant and realm", () => {
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
    });
    expect(
      v2RatingParams({ ...context, subject: "guild" }, {}, "mastery").has(
        "class",
      ),
    ).toBe(false);
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
