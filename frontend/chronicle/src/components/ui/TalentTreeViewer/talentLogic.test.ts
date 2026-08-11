import { describe, expect, it } from "vitest";
import type { TalentEntry } from "./talentLogic";
import {
  aggregateTalentPopularity,
  buildPointsSummary,
  calculateRequiredPlayerLevel,
  computeBuildDiff,
  formatPopularityAvg,
  canUseTalent,
  canonicalTalentBuildUrl,
  copyTalentBuildUrl,
  decodeTalentBuild,
  encodeTalentBuild,
  isTalentBackgroundVisible,
  isTalentBuildLocked,
  lockedTalentReasons,
  mergeTalentRankDescriptions,
  normalizeTalentRanks,
  prerequisiteArrowPathData,
  prerequisiteArrowPolylinePoints,
  prerequisiteArrows,
  populatedTalentTabs,
  rankDescriptionsForTooltip,
  rankingsLayoutToBuild,
  resetTalentTabRanks,
  rowPointRequirement,
  searchParamsWithTalentBuild,
  searchParamsWithTalentLock,
  searchParamsWithTalentPopularity,
  talentBuildExportName,
  talentPopularitySelection,
  talentTabPoints,
  talentTooltipPosition,
  talentVisualState,
  totalTalentPoints,
  updateTalentRank,
} from "./talentLogic";

function talent(partial: Partial<TalentEntry> & Pick<TalentEntry, "id" | "tierID" | "columnIndex">): TalentEntry {
  return {
    name: `Talent ${partial.id}`,
    maxRank: 1,
    tabIndex: 0,
    spellRanks: [partial.id],
    iconTexture: "inv_misc_questionmark",
    ...partial,
  };
}

describe("TalentTreeViewer required player level", () => {
  it("derives level from max level, max talent points, and current spend", () => {
    expect(calculateRequiredPlayerLevel(0, { maxLevel: 60, maxTalentPoints: 51 })).toBe(1);
    expect(calculateRequiredPlayerLevel(1, { maxLevel: 60, maxTalentPoints: 51 })).toBe(10);
    expect(calculateRequiredPlayerLevel(31, { maxLevel: 60, maxTalentPoints: 51 })).toBe(40);
    expect(calculateRequiredPlayerLevel(51, { maxLevel: 60, maxTalentPoints: 51 })).toBe(60);
    expect(calculateRequiredPlayerLevel(999, { maxLevel: 60, maxTalentPoints: 51 })).toBe(60);
    expect(calculateRequiredPlayerLevel(71, { maxLevel: 80, maxTalentPoints: 71 })).toBe(80);
  });

  it("tracks required level as ranks are added and removed through builder rules", () => {
    const first = talent({ id: 1, tierID: 0, columnIndex: 0, maxRank: 5 });
    const second = talent({ id: 2, tierID: 0, columnIndex: 1, maxRank: 5 });
    const tabTalents = [first, second];
    const flavor = { maxLevel: 60, maxTalentPoints: 51 };

    const onePoint = updateTalentRank(first, 1, tabTalents, {}, { maxPoints: 5 });
    const capped = updateTalentRank(second, 1, tabTalents, { 1: 5 }, { maxPoints: 5 });
    const removed = updateTalentRank(first, 4, tabTalents, { 1: 5 }, { maxPoints: 5 });

    expect(calculateRequiredPlayerLevel(totalTalentPoints(onePoint), flavor)).toBe(10);
    expect(calculateRequiredPlayerLevel(totalTalentPoints(capped), flavor)).toBe(14);
    expect(calculateRequiredPlayerLevel(totalTalentPoints(removed), flavor)).toBe(13);
  });
});

describe("TalentTreeViewer talent locking", () => {
  it("requires five points per talent row before a row can be used", () => {
    const firstRow = talent({ id: 1, tierID: 0, columnIndex: 0 });
    const secondRow = talent({ id: 2, tierID: 1, columnIndex: 0 });
    const thirdRow = talent({ id: 3, tierID: 2, columnIndex: 0 });
    const tabTalents = [firstRow, secondRow, thirdRow];

    expect(rowPointRequirement(firstRow)).toBe(0);
    expect(rowPointRequirement(secondRow)).toBe(5);
    expect(rowPointRequirement(thirdRow)).toBe(10);
    expect(canUseTalent(secondRow, tabTalents, { 1: 4 })).toBe(false);
    expect(canUseTalent(secondRow, tabTalents, { 1: 5 })).toBe(true);
    expect(canUseTalent(thirdRow, tabTalents, { 1: 5, 2: 4 })).toBe(false);
    expect(canUseTalent(thirdRow, tabTalents, { 1: 5, 2: 5 })).toBe(true);
  });

  it("requires prerequisite arrow sources to be full before the target can be used", () => {
    const source = talent({ id: 10, tierID: 0, columnIndex: 1, maxRank: 3 });
    const filler = talent({ id: 12, tierID: 0, columnIndex: 2, maxRank: 5 });
    const target = talent({ id: 11, tierID: 1, columnIndex: 1, prereqTalent: [10], prereqRank: [1] });
    const tabTalents = [source, filler, target];

    expect(canUseTalent(target, tabTalents, { 10: 2, 12: 5 })).toBe(false);
    expect(canUseTalent(target, tabTalents, { 10: 3, 12: 5 })).toBe(true);
  });

  it("does not add points to locked talents", () => {
    const source = talent({ id: 20, tierID: 0, columnIndex: 1, maxRank: 2 });
    const filler = talent({ id: 22, tierID: 0, columnIndex: 2, maxRank: 5 });
    const target = talent({ id: 21, tierID: 1, columnIndex: 1, prereqTalent: [20] });
    const tabTalents = [source, filler, target];

    expect(updateTalentRank(target, 1, tabTalents, { 20: 1, 22: 5 })).toEqual({ 20: 1, 22: 5 });
    expect(updateTalentRank(target, 1, tabTalents, { 20: 2, 22: 5 })).toEqual({ 20: 2, 21: 1, 22: 5 });
  });

  it("does not remove row-unlocking points while lower-row talents are spent", () => {
    const first = talent({ id: 40, tierID: 0, columnIndex: 0, maxRank: 5 });
    const second = talent({ id: 41, tierID: 1, columnIndex: 0, maxRank: 5 });
    const tabTalents = [first, second];

    expect(updateTalentRank(first, 4, tabTalents, { 40: 5, 41: 1 })).toEqual({ 40: 5, 41: 1 });
    expect(updateTalentRank(first, 4, tabTalents, { 40: 5, 41: 0 })).toEqual({ 40: 4, 41: 0 });
  });

  it("enforces a total point cap while adding ranks", () => {
    const first = talent({ id: 50, tierID: 0, columnIndex: 0, maxRank: 5 });
    const second = talent({ id: 51, tierID: 0, columnIndex: 1, maxRank: 5 });
    const tabTalents = [first, second];

    expect(updateTalentRank(second, 1, tabTalents, { 50: 5 }, { maxPoints: 5 })).toEqual({ 50: 5 });
    expect(updateTalentRank(second, 1, tabTalents, { 50: 4 }, { maxPoints: 5 })).toEqual({ 50: 4, 51: 1 });
  });

  it("clamps a max-rank dump to the remaining point budget", () => {
    const first = talent({ id: 60, tierID: 0, columnIndex: 0, maxRank: 5 });
    const second = talent({ id: 61, tierID: 0, columnIndex: 1, maxRank: 5 });
    const tabTalents = [first, second];

    // Ctrl-click asks for maxRank; only 4 points remain, so 4 are spent.
    expect(updateTalentRank(second, 5, tabTalents, { 60: 2 }, { maxPoints: 6 })).toEqual({ 60: 2, 61: 4 });
    // No points remaining: no-op.
    expect(updateTalentRank(second, 5, tabTalents, { 60: 5 }, { maxPoints: 5 })).toEqual({ 60: 5 });
    // Without a cap, a dump fills the talent to maxRank.
    expect(updateTalentRank(second, 5, tabTalents, {})).toEqual({ 61: 5 });
    // Decreases are unaffected by the budget clamp.
    expect(updateTalentRank(first, 1, tabTalents, { 60: 5 }, { maxPoints: 5 })).toEqual({ 60: 1 });
  });
});

describe("TalentTreeViewer visual state", () => {
  it("does not highlight empty talents in read-only views", () => {
    expect(talentVisualState(0, 5, false, true)).toBe("locked");
    expect(talentVisualState(0, 5, false, false)).toBe("available");
  });

  it("keeps spent talents highlighted in read-only views", () => {
    expect(talentVisualState(1, 5, false, true)).toBe("selected");
    expect(talentVisualState(5, 5, false, true)).toBe("maxed");
  });
});

describe("TalentTreeViewer popularity URL state", () => {
  it("stores a compact instance, spec, and metric selection", () => {
    const params = searchParamsWithTalentPopularity(
      new URLSearchParams("build=505&foo=bar&pop=stale"),
      { instance: "Molten Core", spec: "Fire", metric: "dps" },
    );

    expect(params.toString()).toBe("build=505&foo=bar&pop=molten-core.fire.dps");
    expect(talentPopularitySelection(params)).toEqual({
      instance: "molten-core",
      spec: "fire",
      metric: "dps",
    });
  });

  it("clears popularity without dropping other query params", () => {
    const params = new URLSearchParams("build=505&pop=molten-core.fire.dps");
    const cleared = searchParamsWithTalentPopularity(params, null);

    expect(cleared.toString()).toBe("build=505");
    expect(talentPopularitySelection(cleared)).toBeNull();
  });

  it("ignores malformed popularity selections", () => {
    expect(talentPopularitySelection(new URLSearchParams("pop=molten-core.fire"))).toBeNull();
    expect(talentPopularitySelection(new URLSearchParams("pop=molten-core.fire.damage"))).toBeNull();
    expect(talentPopularitySelection(new URLSearchParams("pop=molten-core.fire.dps.extra"))).toBeNull();
  });
});

describe("TalentTreeViewer tree point totals", () => {
  it("identifies empty and populated trees from their talent ranks", () => {
    const tab = {
      talents: [
        talent({ id: 70, tierID: 0, columnIndex: 0, maxRank: 5 }),
        talent({ id: 71, tierID: 0, columnIndex: 1, maxRank: 5 }),
      ],
    };

    expect(talentTabPoints(tab, {})).toBe(0);
    expect(talentTabPoints(tab, { 70: 3, 71: 2, 999: 5 })).toBe(5);
  });

  it("returns populated trees together in their original order", () => {
    const tabs = [
      { id: 1, talents: [talent({ id: 80, tierID: 0, columnIndex: 0 })] },
      { id: 2, talents: [talent({ id: 81, tierID: 0, columnIndex: 0 })] },
      { id: 3, talents: [talent({ id: 82, tierID: 0, columnIndex: 0 })] },
    ];

    expect(populatedTalentTabs(tabs, { 80: 1, 82: 1 }).map((tab) => tab.id)).toEqual([1, 3]);
  });
});

describe("TalentTreeViewer export filename", () => {
  const tab = (id: number, name: string, talentIds: number[]) => ({
    id,
    name,
    backgroundFile: "",
    orderIndex: id,
    iconTexture: "",
    talents: talentIds.map((talentId) => talent({ id: talentId, tierID: 0, columnIndex: 0, maxRank: 5 })),
  });
  const tabs = [
    tab(0, "Holy", [1, 2]),
    tab(1, "Protection", [3, 4]),
    tab(2, "Retribution", [5, 6]),
  ];

  it("names the file after the highest-point tab with per-tab point totals", () => {
    expect(talentBuildExportName(tabs, { 3: 5, 4: 5, 5: 4 }, "Paladin")).toBe("Protection_0.10.4");
    expect(talentBuildExportName(tabs, { 5: 5 }, "Paladin")).toBe("Retribution_0.0.5");
  });

  it("prefers the earlier tab on ties and falls back to the class name at zero points", () => {
    expect(talentBuildExportName(tabs, { 1: 3, 5: 3 }, "Paladin")).toBe("Holy_3.0.3");
    expect(talentBuildExportName(tabs, {}, "Paladin")).toBe("Paladin_0.0.0");
  });

  it("replaces whitespace in spec names", () => {
    const feralTabs = [tab(0, "Feral Combat", [1])];
    expect(talentBuildExportName(feralTabs, { 1: 2 }, "Druid")).toBe("Feral-Combat_2");
  });
});

describe("TalentTreeViewer same-tier prerequisite normalization", () => {
  // Mirrors Turtle's Owlkin Frenzy: the dependent talent sits in the same
  // tier at a LOWER column than its prerequisite (Moonkin Form), so a
  // single-pass replay in (tier, column) order would drop its points.
  const filler = talent({ id: 900, tierID: 0, columnIndex: 0, maxRank: 5 });
  const filler2 = talent({ id: 901, tierID: 0, columnIndex: 1, maxRank: 5 });
  const filler3 = talent({ id: 902, tierID: 1, columnIndex: 0, maxRank: 5 });
  const filler4 = talent({ id: 903, tierID: 2, columnIndex: 0, maxRank: 5 });
  const filler5 = talent({ id: 904, tierID: 3, columnIndex: 0, maxRank: 5 });
  const owlkin = talent({ id: 314, tierID: 4, columnIndex: 0, maxRank: 3, prereqTalent: [315] });
  const moonkin = talent({ id: 315, tierID: 4, columnIndex: 1, maxRank: 1 });
  const tabTalents = [filler, filler2, filler3, filler4, filler5, owlkin, moonkin];

  it("keeps points in a talent whose same-tier prereq sorts after it", () => {
    const raw = { 900: 5, 901: 5, 902: 5, 903: 5, 904: 5, 314: 2, 315: 1 };
    const normalized = normalizeTalentRanks([tabTalents], raw, 51);
    expect(normalized[314]).toBe(2);
    expect(normalized[315]).toBe(1);
    expect(totalTalentPoints(normalized)).toBe(28);
  });

  it("still drops the dependent talent when the prereq is missing", () => {
    const raw = { 900: 5, 901: 5, 902: 5, 903: 5, 904: 5, 314: 2 };
    const normalized = normalizeTalentRanks([tabTalents], raw, 51);
    expect(normalized[314]).toBeUndefined();
    expect(totalTalentPoints(normalized)).toBe(25);
  });

  it("round-trips through encode/decode without losing the dependent talent", () => {
    const raw = { 900: 5, 901: 5, 902: 5, 903: 5, 904: 5, 314: 2, 315: 1 };
    const normalized = normalizeTalentRanks([tabTalents], raw, 51);
    const encoded = encodeTalentBuild(normalized, [tabTalents]);
    const roundTripped = normalizeTalentRanks([tabTalents], decodeTalentBuild(encoded, [tabTalents]), 51);
    expect(roundTripped).toEqual(normalized);
  });
});

describe("TalentTreeViewer rankings layout conversion", () => {
  it("converts }-separated layouts to dash-separated builds with zeros trimmed", () => {
    expect(rankingsLayoutToBuild("05230}30200}0000")).toBe("0523-302");
    expect(rankingsLayoutToBuild("500}000}000")).toBe("5");
    expect(rankingsLayoutToBuild("000}000}550")).toBe("--55");
    expect(rankingsLayoutToBuild("")).toBe("");
    expect(rankingsLayoutToBuild(null)).toBe("");
    expect(rankingsLayoutToBuild(undefined)).toBe("");
  });

  it("round-trips through the points summary", () => {
    expect(buildPointsSummary(rankingsLayoutToBuild("05230}30200}0000"))).toBe("10/5");
  });
});

describe("TalentTreeViewer build diff", () => {
  it("reports only differing talents with signed deltas", () => {
    const diff = computeBuildDiff(
      { 1: 5, 2: 3, 3: 1 },
      { 1: 5, 2: 5, 4: 2 },
    );
    expect(diff[1]).toBeUndefined();
    expect(diff[2]).toEqual({ yours: 3, theirs: 5, delta: 2 });
    expect(diff[3]).toEqual({ yours: 1, theirs: 0, delta: -1 });
    expect(diff[4]).toEqual({ yours: 0, theirs: 2, delta: 2 });
  });

  it("returns empty for identical or empty builds", () => {
    expect(computeBuildDiff({}, {})).toEqual({});
    expect(computeBuildDiff({ 1: 3 }, { 1: 3 })).toEqual({});
  });
});

describe("TalentTreeViewer talent popularity aggregation", () => {
  it("computes percent of builds with points and average rank among takers", () => {
    const popularity = aggregateTalentPopularity([
      { 1: 5, 2: 2 },
      { 1: 5 },
      { 1: 3, 3: 1 },
      { 2: 1, 3: 1 },
      { 1: 5 },
    ]);
    expect(popularity[1]).toEqual({ pct: 80, avg: 4.5, sample: 5 });
    expect(popularity[2]).toEqual({ pct: 40, avg: 1.5, sample: 5 });
    expect(popularity[3]).toEqual({ pct: 40, avg: 1, sample: 5 });
    expect(popularity[4]).toBeUndefined();
  });

  it("handles empty input and zero ranks", () => {
    expect(aggregateTalentPopularity([])).toEqual({});
    expect(aggregateTalentPopularity([{ 1: 0 }])).toEqual({});
  });

  it("formats averages without trailing .0", () => {
    expect(formatPopularityAvg(1)).toBe("1");
    expect(formatPopularityAvg(1.5)).toBe("1.5");
    expect(formatPopularityAvg(4.6667)).toBe("4.7");
  });
});

describe("TalentTreeViewer build points summary", () => {
  it("sums digits per dash-separated tab section", () => {
    expect(buildPointsSummary("35003-0503")).toBe("11/8");
    expect(buildPointsSummary("505")).toBe("10");
    expect(buildPointsSummary("")).toBe("0");
    expect(buildPointsSummary("0-0-55")).toBe("0/0/10");
  });
});

describe("TalentTreeViewer build lock URL state", () => {
  it("sets and clears the lock param while preserving other params", () => {
    const locked = searchParamsWithTalentLock(new URLSearchParams("build=505"), true);
    expect(locked.toString()).toBe("build=505&lock=1");
    expect(isTalentBuildLocked(locked)).toBe(true);

    const unlocked = searchParamsWithTalentLock(locked, false);
    expect(unlocked.toString()).toBe("build=505");
    expect(isTalentBuildLocked(unlocked)).toBe(false);
  });

  it("only treats lock=1 as locked", () => {
    expect(isTalentBuildLocked(new URLSearchParams("lock=true"))).toBe(false);
    expect(isTalentBuildLocked(new URLSearchParams(""))).toBe(false);
    expect(isTalentBuildLocked(new URLSearchParams("lock=1"))).toBe(true);
  });

  it("reports exhausted points as a lock reason", () => {
    const first = talent({ id: 70, tierID: 0, columnIndex: 0, maxRank: 5 });
    const second = talent({ id: 71, tierID: 1, columnIndex: 0, maxRank: 5 });
    const tabTalents = [first, second];

    // Otherwise-usable talent locked only because no points remain.
    expect(lockedTalentReasons(second, tabTalents, { 70: 5 }, true)).toEqual(["No talent points remaining."]);
    // Exhausted points stack with row requirements.
    expect(lockedTalentReasons(second, tabTalents, { 70: 3 }, true)).toEqual([
      "No talent points remaining.",
      "Spend 5 points in this tree to unlock this row.",
    ]);
  });
});

describe("TalentTreeViewer rank description merging", () => {
  it("builds mergeable tooltip descriptions from fetched spell rank notes when talent data omits rank text", () => {
    expect(rankDescriptionsForTooltip([], 0, undefined, "Reduces the casting time of your Fireball spell by 0.1 sec.", [
      "Reduces the casting time of your Fireball spell by 0.1 sec.",
      "Reduces the casting time of your Fireball spell by 0.2 sec.",
      "Reduces the casting time of your Fireball spell by 0.3 sec.",
      "Reduces the casting time of your Fireball spell by 0.4 sec.",
      "Reduces the casting time of your Fireball spell by 0.5 sec.",
    ])).toEqual([
      "Reduces the casting time of your Fireball spell by 0.1 sec.",
      "Reduces the casting time of your Fireball spell by 0.2 sec.",
      "Reduces the casting time of your Fireball spell by 0.3 sec.",
      "Reduces the casting time of your Fireball spell by 0.4 sec.",
      "Reduces the casting time of your Fireball spell by 0.5 sec.",
    ]);
  });

  it("overlays selected middle-rank fetched spell notes before merging real tooltip text", () => {
    const descriptions = rankDescriptionsForTooltip([], 3, "Reduces the casting time of your Fireball spell by 0.3 sec.", "Reduces the casting time of your Fireball spell by 0.4 sec.", [
      "Reduces the casting time of your Fireball spell by 0.1 sec.",
      "Reduces the casting time of your Fireball spell by 0.2 sec.",
      "Reduces the casting time of your Fireball spell by 0.3 sec.",
      "Reduces the casting time of your Fireball spell by 0.4 sec.",
      "Reduces the casting time of your Fireball spell by 0.5 sec.",
    ]);

    expect(mergeTalentRankDescriptions(descriptions, 3)).toEqual([
      { type: "text", text: "Reduces the casting time of your Fireball spell by " },
      { type: "ladder", values: ["0.1", "0.2", "0.3", "0.4", "0.5"], activeIndex: 2 },
      { type: "text", text: " sec." },
    ]);
  });

  it("collapses one changing percent value into an inline ladder", () => {
    expect(mergeTalentRankDescriptions([
      "Gives your Fireball 2% chance to stun for 2 sec.",
      "Gives your Fireball 4% chance to stun for 2 sec.",
      "Gives your Fireball 6% chance to stun for 2 sec.",
    ], 1)).toEqual([
      { type: "text", text: "Gives your Fireball " },
      { type: "ladder", values: ["2", "4", "6"], activeIndex: 0 },
      { type: "text", text: "% chance to stun for 2 sec." },
    ]);
  });

  it("highlights the current rank in the middle of the ladder", () => {
    expect(mergeTalentRankDescriptions([
      "Increases your chance to hit by 1%.",
      "Increases your chance to hit by 2%.",
      "Increases your chance to hit by 3%.",
    ], 2)?.[1]).toEqual({ type: "ladder", values: ["1", "2", "3"], activeIndex: 1 });
  });

  it("does not merge structurally different descriptions", () => {
    expect(mergeTalentRankDescriptions([
      "+1% hit.",
      "Causes 28 to 35 Holy damage within 10 yards.",
      "+3% hit.",
    ], 1)).toBeNull();
  });

  it("strips '(More effective than Rank N)' boilerplate before merging", () => {
    expect(mergeTalentRankDescriptions([
      "You retain up to an additional 5 of your rage points when you change stances.",
      "You retain up to an additional 10 of your rage points when you change stances (More effective than Rank 1).",
      "You retain up to an additional 15 of your rage points when you change stances (More effective than Rank 2).",
    ], 2)).toEqual([
      { type: "text", text: "You retain up to an additional " },
      { type: "ladder", values: ["5", "10", "15"], activeIndex: 1 },
      { type: "text", text: " of your rage points when you change stances." },
    ]);
  });

  it("merges descriptions after WoW spell variables have already resolved", () => {
    expect(mergeTalentRankDescriptions([
      "Reduces the casting time of your Fireball spell by 0.1 sec.",
      "Reduces the casting time of your Fireball spell by 0.2 sec.",
      "Reduces the casting time of your Fireball spell by 0.3 sec.",
    ], 3)).toEqual([
      { type: "text", text: "Reduces the casting time of your Fireball spell by " },
      { type: "ladder", values: ["0.1", "0.2", "0.3"], activeIndex: 2 },
      { type: "text", text: " sec." },
    ]);
  });

  it("merges descriptions with singular/plural text differences", () => {
    expect(mergeTalentRankDescriptions([
      "Reduces the cost of your Heroic Strike ability by 1 rage point.",
      "Reduces the cost of your Heroic Strike ability by 2 rage points.",
      "Reduces the cost of your Heroic Strike ability by 3 rage points.",
    ], 2)).toEqual([
      { type: "text", text: "Reduces the cost of your Heroic Strike ability by " },
      { type: "ladder", values: ["1", "2", "3"], activeIndex: 1 },
      { type: "text", text: " rage points." },
    ]);
  });

  it("uses active rank text for singular/plural when rank 1 is active", () => {
    expect(mergeTalentRankDescriptions([
      "Reduces the cost of your Heroic Strike ability by 1 rage point.",
      "Reduces the cost of your Heroic Strike ability by 2 rage points.",
      "Reduces the cost of your Heroic Strike ability by 3 rage points.",
    ], 1)).toEqual([
      { type: "text", text: "Reduces the cost of your Heroic Strike ability by " },
      { type: "ladder", values: ["1", "2", "3"], activeIndex: 0 },
      { type: "text", text: " rage point." },
    ]);
  });
});

describe("TalentTreeViewer tooltip positioning", () => {
  it("keeps touch tooltip positions inside a phone viewport", () => {
    const position = talentTooltipPosition(
      { left: 288, top: 160, right: 332, bottom: 204, width: 44, height: 44 },
      { innerWidth: 360, innerHeight: 320 },
    );

    expect(position.left).toBeLessThanOrEqual(56);
    expect(position.left).toBeGreaterThanOrEqual(16);
    expect(position.top).toBeLessThanOrEqual(80);
    expect(position.top).toBeGreaterThanOrEqual(16);
  });
});

describe("TalentTreeViewer tree reset and background", () => {
  it("treats a failed talent background load as hidden while keeping fallback styling", () => {
    const backgroundUrl = "https://icons.chronicleclassic.com/turtle/talent-backgrounds/magefire.webp";

    expect(isTalentBackgroundVisible(backgroundUrl, null)).toBe(true);
    expect(isTalentBackgroundVisible(backgroundUrl, backgroundUrl)).toBe(false);
    expect(isTalentBackgroundVisible(null, backgroundUrl)).toBe(false);
  });

  it("resets one tree through the same normalized build-state path without clearing other trees", () => {
    const arcane = [talent({ id: 310, tierID: 0, columnIndex: 0, maxRank: 5 })];
    const fire = [talent({ id: 320, tierID: 0, columnIndex: 0, maxRank: 5 })];
    const frost = [talent({ id: 330, tierID: 0, columnIndex: 0, maxRank: 5 })];
    const allTabs = [arcane, fire, frost];

    const resetArcane = resetTalentTabRanks(allTabs, { 310: 3, 320: 2, 330: 1 }, arcane, 51);

    expect(resetArcane).toEqual({ 320: 2, 330: 1 });
    expect(searchParamsWithTalentBuild(new URLSearchParams("build=old"), resetArcane, allTabs).toString()).toBe("build=-2-1");
  });

  it("reset-all still clears every tree and removes the canonical build param", () => {
    const allTabs = [[talent({ id: 310, tierID: 0, columnIndex: 0, maxRank: 5 })]];
    expect(searchParamsWithTalentBuild(new URLSearchParams("build=old"), {}, allTabs).toString()).toBe("");
  });
});

describe("TalentTreeViewer prerequisite arrows", () => {
  it("maps prerequisite talent metadata into arrows", () => {
    const source = talent({ id: 1, tierID: 1, columnIndex: 2, maxRank: 2 });
    const target = talent({ id: 2, tierID: 3, columnIndex: 2, prereqTalent: [1], prereqRank: [2] });

    expect(prerequisiteArrows([source, target])).toEqual([
      { from: source, to: target, requiredRank: 2 },
    ]);
  });

  it("uses the source max rank for arrow state even when prereqRank says less", () => {
    const source = talent({ id: 1, tierID: 1, columnIndex: 2, maxRank: 2 });
    const target = talent({ id: 2, tierID: 3, columnIndex: 2, prereqTalent: [1], prereqRank: [1] });

    expect(prerequisiteArrows([source, target])).toEqual([
      { from: source, to: target, requiredRank: 2 },
    ]);
  });

  it("falls back to the source max rank when prereqRank is absent", () => {
    const source = talent({ id: 10, tierID: 1, columnIndex: 1, maxRank: 5 });
    const target = talent({ id: 11, tierID: 2, columnIndex: 1, prereqTalent: [10] });

    expect(prerequisiteArrows([source, target])[0]?.requiredRank).toBe(5);
  });

  it("ignores prerequisites outside the current tab", () => {
    const target = talent({ id: 3, tierID: 2, columnIndex: 1, prereqTalent: [999], prereqRank: [1] });

    expect(prerequisiteArrows([target])).toEqual([]);
  });

  it("draws same-row prerequisites horizontally from side edge to side edge", () => {
    const source = talent({ id: 20, tierID: 2, columnIndex: 1 });
    const target = talent({ id: 21, tierID: 2, columnIndex: 2, prereqTalent: [20] });

    expect(prerequisiteArrowPolylinePoints(source, target)).toBe("112,170 136,170");
  });

  it("keeps one-row vertical prerequisites compact instead of arrowhead dominated", () => {
    const source = talent({ id: 22, tierID: 0, columnIndex: 1 });
    const target = talent({ id: 23, tierID: 1, columnIndex: 1, prereqTalent: [22] });

    expect(prerequisiteArrowPolylinePoints(source, target)).toBe("90,44 90,74");
  });

  it("routes one-column-right and two-row-down prerequisites side-exit horizontal-first then down", () => {
    const source = talent({ id: 30, tierID: 0, columnIndex: 1 });
    const target = talent({ id: 31, tierID: 2, columnIndex: 2, prereqTalent: [30] });

    // Exits right side of source, goes right to target column, then down to target.
    expect(prerequisiteArrowPolylinePoints(source, target)).toBe("112,22 158,22 158,148");
  });

  it("routes VanillaPlus Fire Mage prerequisite arrows side-exit horizontal-first past blocker", () => {
    const source = talent({ id: 32, tierID: 2, columnIndex: 1, tabIndex: 8, spellRanks: [11113] });
    const blocker = talent({ id: 31, tierID: 3, columnIndex: 1, tabIndex: 10, spellRanks: [33897, 33898] });
    const target = talent({ id: 1766, tierID: 4, columnIndex: 2, tabIndex: 14, spellRanks: [34125], prereqTalent: [32], prereqRank: [0] });

    // Exits right side of source, goes right to target column, then down (avoids blocker below source).
    expect(prerequisiteArrowPolylinePoints(source, target, [source, blocker, target])).toBe("112,170 158,170 158,296");
  });

  it("softens kinked prerequisite paths so turns do not read like flowchart elbows", () => {
    expect(prerequisiteArrowPathData("88,44 88,128 156,128 156,142")).toBe(
      "M 88 44 L 88 122 Q 88 128 94 128 L 150 128 Q 156 128 156 134 L 156 142",
    );
  });
});

describe("TalentTreeViewer URL build state", () => {
  const tab1 = [
    talent({ id: 10, tierID: 0, columnIndex: 0, maxRank: 5, tabIndex: 0 }),
    talent({ id: 11, tierID: 0, columnIndex: 1, maxRank: 5, tabIndex: 1 }),
    talent({ id: 12, tierID: 0, columnIndex: 2, maxRank: 3, tabIndex: 2 }),
    talent({ id: 13, tierID: 1, columnIndex: 0, maxRank: 2, tabIndex: 3 }),
    talent({ id: 14, tierID: 1, columnIndex: 1, maxRank: 5, tabIndex: 4 }),
  ];
  const tab2 = [
    talent({ id: 20, tierID: 0, columnIndex: 0, maxRank: 5, tabIndex: 0 }),
    talent({ id: 21, tierID: 0, columnIndex: 1, maxRank: 3, tabIndex: 1 }),
  ];
  const tabs = [tab1, tab2];

  it("encodes positional build as digits-per-talent with dash-separated tabs", () => {
    expect(encodeTalentBuild({ 10: 3, 11: 5, 14: 2 }, tabs)).toBe("35002");
    expect(encodeTalentBuild({ 10: 3, 20: 1 }, tabs)).toBe("3-1");
    expect(encodeTalentBuild({ 20: 2, 21: 1 }, tabs)).toBe("-21");
    expect(encodeTalentBuild({}, tabs)).toBe("");
  });

  it("decodes positional build back to talent IDs", () => {
    expect(decodeTalentBuild("35002", tabs)).toEqual({ 10: 3, 11: 5, 14: 2 });
    expect(decodeTalentBuild("3-1", tabs)).toEqual({ 10: 3, 20: 1 });
    expect(decodeTalentBuild("-21", tabs)).toEqual({ 20: 2, 21: 1 });
  });

  it("still decodes legacy base36 dot-underscore format", () => {
    expect(decodeTalentBuild("k.2_u.1")).toEqual({ 20: 2, 30: 1 });
    expect(decodeTalentBuild("20:2,30:1,wat:2,40:0")).toEqual({ 20: 2, 30: 1 });
  });

  it("writes positional build into URL search params", () => {
    const params = searchParamsWithTalentBuild(new URLSearchParams("foo=bar"), { 10: 2, 21: 1 }, tabs);
    expect(params.toString()).toBe("foo=bar&build=2-01");
  });

  it("normalizes shared ranks through row, arrow, max-rank, and point-cap rules", () => {
    const source = talent({ id: 1, tierID: 0, columnIndex: 0, maxRank: 2 });
    const filler = talent({ id: 2, tierID: 0, columnIndex: 1, maxRank: 5 });
    const target = talent({ id: 3, tierID: 1, columnIndex: 0, maxRank: 3, prereqTalent: [1], prereqRank: [1] });
    const tabTalents = [source, filler, target];

    expect(normalizeTalentRanks([tabTalents], { 1: 1, 2: 5, 3: 9 }, 6)).toEqual({ 1: 1, 2: 5 });
    expect(normalizeTalentRanks([tabTalents], { 1: 2, 2: 5, 3: 9 }, 8)).toEqual({ 1: 2, 2: 5, 3: 1 });
  });

  it("clears build state from URL search params without dropping other params", () => {
    const params = searchParamsWithTalentBuild(new URLSearchParams("foo=bar"), { 10: 2 }, tabs);
    const cleared = searchParamsWithTalentBuild(params, {}, tabs);
    expect(cleared.toString()).toBe("foo=bar");
  });

  it("builds the canonical copy URL with positional encoding", () => {
    const url = canonicalTalentBuildUrl("https://wiki.chronicleclassic.com/turtle/talents/mage?foo=bar", { 10: 3, 20: 1 }, tabs);
    expect(url).toBe("https://wiki.chronicleclassic.com/turtle/talents/mage?foo=bar&build=3-1");
  });

  it("copies the canonical build URL through the Copy build link action", async () => {
    const copied: string[] = [];
    await copyTalentBuildUrl({ writeText: async (value) => { copied.push(value); } }, "https://wiki.chronicleclassic.com/turtle/talents/mage?build=stale", { 10: 2 }, tabs);
    expect(copied).toEqual(["https://wiki.chronicleclassic.com/turtle/talents/mage?build=2"]);
  });

  it("normalizes invalid or stale shared build strings before generating the canonical copy URL", () => {
    const valid = talent({ id: 1, tierID: 0, columnIndex: 0, maxRank: 2 });
    const stale = talent({ id: 2, tierID: 1, columnIndex: 0, maxRank: 3 });
    const normTabs = [[valid, stale]];
    const normalized = normalizeTalentRanks(normTabs, decodeTalentBuild("1.9_2.2_missing"), 2);

    expect(normalized).toEqual({ 1: 2 });
    expect(canonicalTalentBuildUrl("https://wiki.chronicleclassic.com/turtle/talents/mage?build=1.9_2.2_missing", normalized, normTabs)).toBe(
      "https://wiki.chronicleclassic.com/turtle/talents/mage?build=2",
    );
  });
});
