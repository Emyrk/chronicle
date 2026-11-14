import { describe, expect, it } from "vitest";
import { achievementsResponse, PERSONAS } from "./achievements.fixtures";
import {
  FEATS_CATEGORY_ID,
  buildAchievementsModel,
  filterEntries,
  formatCompletionRate,
  keybindKeys,
} from "./achievementsModel";

const rate = (earned: number, eligible: number) => ({
  earned_account_count: earned,
  eligible_account_count: eligible,
  calculated_at: "2026-11-07T00:00:00Z",
});

describe("formatCompletionRate", () => {
  it.each([
    [0, 1000, "0%"],
    [1, 10_000, "Less than 0.1%"],
    [1, 1000, "0.1%"],
    [124, 1000, "12.4%"],
    [9999, 10_000, "99.9%"],
    [99_999, 100_000, "99.9%"],
    [1000, 1000, "100%"],
    [0, 0, "0%"],
  ])("%i of %i is %s", (earned, eligible, expected) => {
    expect(formatCompletionRate(rate(earned, eligible))).toBe(expected);
  });
});

describe("keybindKeys", () => {
  it("renders Option and Cmd on macOS", () => {
    expect(keybindKeys("Alt+Click", true)).toEqual(["Option", "Click"]);
    expect(keybindKeys("Ctrl+K", true)).toEqual(["Cmd", "K"]);
    expect(keybindKeys("Alt+Click", false)).toEqual(["Alt", "Click"]);
  });
});

describe("buildAchievementsModel", () => {
  it("groups series, sets, and states", () => {
    const model = buildAchievementsModel(achievementsResponse({ persona: PERSONAS.explorer }));
    const layouts = model.categories.find((category) => category.category.id === "layouts")!;
    const series = layouts.entries.find((entry) => entry.kind === "series");
    expect(series?.kind === "series" && series.view.tiers.map((tier) => tier.achievement.tier)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const commandCenter = model.byId.get("command-center")!;
    expect(commandCenter.state).toBe("in_progress");
    expect(commandCenter.setMembers?.filter((member) => member.earned).map((member) => member.id)).toEqual(["panel-craft-4", "layouts-5"]);

    expect(model.byId.get("guild-builder-1")!.state).toBe("locked");
    expect(model.byId.get("known-by-name")!.state).toBe("not_started");
    expect(model.byId.get("replay-hidden")!.concealed).toBe(true);
    expect(model.categories.some((category) => category.category.id === FEATS_CATEGORY_ID)).toBe(false);
    expect(model.earnedPoints).toBe(model.recent.reduce((total, view) => total + view.achievement.points, 0));
  });

  it("lists earned Feats of Strength without counting points", () => {
    const model = buildAchievementsModel(achievementsResponse({ persona: PERSONAS.completionist }));
    const feats = model.categories.find((category) => category.category.id === FEATS_CATEGORY_ID);
    expect(feats?.totalCount).toBe(1);
    expect(model.earnedCount).toBe(model.totalCount - 3); // Live Collaboration is unreleased
  });

  it("has no progress when signed out", () => {
    const model = buildAchievementsModel(achievementsResponse({ signedOut: true }));
    expect(model.signedIn).toBe(false);
    expect(model.recent).toEqual([]);
  });
});

describe("filterEntries", () => {
  const model = buildAchievementsModel(achievementsResponse({ persona: PERSONAS.explorer }));
  const reportExplorer = model.categories.find((category) => category.category.id === "report-explorer")!;

  it("keeps only matching tiers of a series", () => {
    const entries = filterEntries(reportExplorer.entries, "all", "fine print");
    expect(entries).toHaveLength(1);
    expect(entries[0].kind === "series" && entries[0].view.tiers.map((tier) => tier.achievement.id)).toEqual(["filter-craft-5"]);
  });

  it("filters by earned", () => {
    const earned = filterEntries(reportExplorer.entries, "earned", "");
    const ids = earned.flatMap((entry) => (entry.kind === "series" ? entry.view.tiers : [entry.view])).map((view) => view.state);
    expect(new Set(ids)).toEqual(new Set(["earned"]));
  });

  it("never matches concealed achievements by search", () => {
    const replay = model.categories.find((category) => category.category.id === "replay")!;
    expect(filterEntries(replay.entries, "all", "edge of the map")).toEqual([]);
  });
});
