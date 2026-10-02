import { describe, expect, it } from "vitest";
import type { LegacyTalentEntry, LegacyTalentTreeData } from "@/components/ui/TalentTreeViewer/talentLogic";
import {
  canUseLegacyTalent,
  decodeLegacyBuild,
  encodeLegacyBuild,
  legacyTotalPoints,
  normalizeLegacyBuild,
  updateLegacyTalentRank,
} from "./legacyTalentLogic";

function talent(id: number, columnIndex: number, rowIndex: number, maxRank = 1): LegacyTalentEntry {
  return { id, name: `Talent ${id}`, columnIndex, rowIndex, maxRank, tabIndex: 0, spellRanks: [id], iconTexture: "test" };
}

const first = talent(1, 0, 0, 5);
const filler = talent(2, 0, 1, 5);
const second = talent(3, 1, 0, 3);
const gated = { ...talent(4, 2, 0), prereqAnyTalent: [3] };
const tree: LegacyTalentTreeData = { id: 1187, name: "Professions", orderIndex: 0, talents: [first, filler, second, gated] };
const other: LegacyTalentTreeData = { id: 1188, name: "Adventure", orderIndex: 1, talents: [talent(5, 0, 0, 5)] };

describe("Forever Legacy talent logic", () => {
  it("unlocks columns from left to right using points spent in the same tree", () => {
    expect(canUseLegacyTalent(second, tree, { 1: 4 }, 5)).toBe(false);
    expect(canUseLegacyTalent(second, tree, { 1: 5 }, 5)).toBe(true);
    expect(canUseLegacyTalent(gated, tree, { 1: 5, 2: 5, 3: 2 }, 5)).toBe(false);
    expect(canUseLegacyTalent(gated, tree, { 1: 5, 2: 5, 3: 3 }, 5)).toBe(true);
  });

  it("shares the sixteen point cap across all three trees", () => {
    const trees = [tree, other];
    const ranks = { 1: 5, 2: 5, 5: 5 };
    expect(updateLegacyTalentRank(second, 1, trees, ranks, 16, 5)).toEqual({ ...ranks, 3: 1 });
    expect(updateLegacyTalentRank(second, 2, trees, { ...ranks, 3: 1 }, 16, 5)).toEqual({ ...ranks, 3: 1 });
  });

  it("does not remove points that would invalidate a later column", () => {
    const ranks = { 1: 5, 3: 1 };
    expect(updateLegacyTalentRank(first, 4, [tree], ranks, 16, 5)).toEqual(ranks);
  });

  it("round-trips positional URL builds and normalizes invalid ranks", () => {
    const trees = [tree, other];
    const ranks = { 1: 5, 3: 2, 5: 3 };
    const encoded = encodeLegacyBuild(trees, ranks);
    expect(decodeLegacyBuild(encoded, trees)).toEqual(ranks);
    const normalized = normalizeLegacyBuild("9500-9", trees, 16, 5);
    expect(legacyTotalPoints(normalized)).toBeLessThanOrEqual(16);
    expect(normalized[1]).toBe(5);
    expect(normalized[5]).toBe(5);
  });
});
