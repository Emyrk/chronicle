import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuickStats from "./QuickStats";
import { classEntity, entityKey, specEntity } from "./entity";

const rankings = vi.hoisted(() => ({
  stats: vi.fn(),
}));

vi.mock("@/api/rankingsQueries", () => ({
  useRankingsInstances: () => ({
    data: [
      { instance_name: "Molten Core", difficulty_name: "Normal", max_players: 40, category: "raid" },
      { instance_name: "Naxxramas", difficulty_name: "Normal", max_players: 40, category: "raid" },
    ],
    isLoading: false,
  }),
  useRankingsEncounters: (instanceName: string) => ({
    data: instanceName === "Naxxramas"
      ? [{ encounter_name: "Patchwerk" }, { encounter_name: "Thaddius" }]
      : [{ encounter_name: "Lucifron" }, { encounter_name: "Ragnaros" }],
    isLoading: false,
  }),
  useRankingsStats: (params: unknown) => {
    rankings.stats(params);
    return {
      data: [
        { player_class: "MAGE", player_spec: "", min_dps: 100, q1_dps: 200, median_dps: 300, q3_dps: 400, max_dps: 500, count: 1240 },
        { player_class: "ROGUE", player_spec: "", min_dps: 90, q1_dps: 190, median_dps: 290, q3_dps: 390, max_dps: 490, count: 980 },
        { player_class: "MAGE", player_spec: "Fire", min_dps: 100, q1_dps: 200, median_dps: 1234, q3_dps: 1400, max_dps: 1600, count: 42 },
        { player_class: "MAGE", player_spec: "Frost", min_dps: 80, q1_dps: 180, median_dps: 987, q3_dps: 1100, max_dps: 1300, count: 35 },
      ],
      isLoading: false,
      isError: false,
    };
  },
}));

const common = {
  raid: null,
  picked: null,
  onPick: vi.fn(),
  rangeDays: 180,
};

describe("class and spec quick stats", () => {
  beforeEach(() => rankings.stats.mockClear());

  it("renders a comparison box for class snapshots", () => {
    const entities = [
      classEntity("MAGE", "Mage", [
        { label: "Specs", value: "3" },
        { label: "Runs", value: "1,240" },
      ]),
      classEntity("ROGUE", "Rogue", [
        { label: "Specs", value: "2" },
        { label: "Runs", value: "980" },
      ]),
    ];
    const html = renderToStaticMarkup(
      <QuickStats {...common} kind="class" entities={entities} hidden={new Set()} />,
    );

    expect(html).toContain("Comparing 2 classes");
    expect(html).toContain("Mage statistics");
    expect(html).toContain("Rogue statistics");
    expect(html).toContain("1,240");
    expect(html).toContain("500/s");
    expect(html).toContain('title="Pick the raid to compare on"');
  });

  it("shows the leaderboard raid context for cohort comparisons", () => {
    const entity = classEntity("MAGE", "Mage", [{ label: "Runs", value: "42" }]);
    const html = renderToStaticMarkup(
      <QuickStats
        {...common}
        kind="class"
        entities={[entity]}
        hidden={new Set()}
        raid={{
          instanceName: "Molten Core",
          difficultyName: "Normal",
          maxPlayers: 40,
          bossNames: ["Lucifron", "Ragnaros"],
        }}
      />,
    );

    expect(html).toContain("Molten Core");
    expect(html).toContain("Normal · 40-player · 2 bosses");
  });

  it("loads statistics for a raid selected in the compare panel", () => {
    const entity = classEntity("MAGE", "Mage");
    const html = renderToStaticMarkup(
      <QuickStats
        {...common}
        kind="class"
        entities={[entity]}
        hidden={new Set()}
        picked={{ instanceName: "Naxxramas", difficultyName: "Normal", maxPlayers: 40 }}
      />,
    );

    expect(html).toContain("Naxxramas");
    expect(html).toContain("Normal · 40-player · 2 bosses");
    expect(rankings.stats).toHaveBeenCalledWith(expect.objectContaining({
      instance_names: "Naxxramas",
      encounter_names: "Patchwerk,Thaddius",
      difficulty_names: "Normal",
      max_players: 40,
      group_by_class: true,
    }));
  });

  it("renders spec snapshots and respects hidden pins", () => {
    const fire = specEntity("MAGE", "Mage", "Fire", undefined, [
      { label: "Typical", value: "1,234/s" },
      { label: "Runs", value: "42" },
    ]);
    const frost = specEntity("MAGE", "Mage", "Frost", undefined, [{ label: "Typical", value: "987/s" }]);
    const html = renderToStaticMarkup(
      <QuickStats {...common} kind="spec" entities={[fire, frost]} hidden={new Set([entityKey(frost)])} />,
    );

    expect(html).toContain("Comparing 1 spec");
    expect(html).toContain("Fire Mage statistics");
    expect(html).toContain("1,234/s");
    expect(html).not.toContain("Frost Mage statistics");
  });
});
