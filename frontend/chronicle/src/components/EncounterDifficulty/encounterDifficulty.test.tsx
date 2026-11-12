import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EncounterDifficultyMark, EncounterDifficultySummary, EncounterDifficultyTooltipBody } from "./EncounterDifficultyMark";
import { type DifficultyEncounter, summarizeDifficulty } from "./encounterDifficulty";

const boss = (difficulty: string, kill_type: DifficultyEncounter["kill_type"] = "clean"): DifficultyEncounter => ({ name: "Boss", boss: true, kill_type, difficulty });

describe("canonical encounter difficulties", () => {
  it("counts successful attempts separately and excludes wipes and trash", () => {
    const { kills, counts } = summarizeDifficulty([boss(""), boss("heroic"), boss("heroic", "partial"), boss("challenge", "wipe"), { ...boss("challenge"), boss: false }]);
    expect(kills).toHaveLength(3);
    expect([...counts]).toEqual([["", 1], ["heroic", 2]]);
  });

  it("hides Normal chips and renders generic tooltip labels", () => {
    expect(renderToStaticMarkup(<EncounterDifficultyMark difficulty="" />)).toBe("");
    expect(renderToStaticMarkup(<EncounterDifficultyTooltipBody difficulty="mythic_plus" />)).toContain("Mythic Plus");
  });

  it("leaves a pure Normal raid header unchanged", () => {
    expect(renderToStaticMarkup(<EncounterDifficultySummary encounters={[boss(""), boss("", "partial")]} mixedDifficulty={false} />)).toBe("");
  });

  it("preserves authoritative mixed status even with only Normal kills", () => {
    const html = renderToStaticMarkup(<EncounterDifficultySummary encounters={[boss(""), boss("heroic", "wipe")]} mixedDifficulty />);
    expect(html).toContain("Mixed");
    expect(html).toContain("Normal kills 1/1");
  });

  it("labels arbitrary variants and kill counts without hard-mode inference", () => {
    const html = renderToStaticMarkup(<EncounterDifficultySummary encounters={[boss(""), boss("challenge")]} mixedDifficulty />);
    expect(html).toContain("Challenge kills 1/2");
    expect(html).not.toContain("Hard mode");
  });

  it("uses the Heroic badge only for a non-mixed all-Heroic kill summary", () => {
    const encounters = [boss("heroic"), boss("heroic", "partial")];
    const homogeneous = renderToStaticMarkup(<EncounterDifficultySummary encounters={encounters} mixedDifficulty={false} />);
    expect(homogeneous).toContain("Heroic");
    expect(homogeneous).not.toContain("kills");
    const mixed = renderToStaticMarkup(<EncounterDifficultySummary encounters={encounters} mixedDifficulty />);
    expect(mixed).toContain("Mixed");
    expect(mixed).toContain("Heroic kills 2/2");
  });

  it("retains Mixed with no successful kills", () => {
    const html = renderToStaticMarkup(<EncounterDifficultySummary encounters={[boss("heroic", "wipe")]} mixedDifficulty />);
    expect(html).toContain("Mixed");
    expect(html).not.toContain("kills");
  });
});
