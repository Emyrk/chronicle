import { describe, expect, it } from "vitest";
import { MASTERY_PLAYERS } from "./MasteryRenown.fixtures";
import { calculateMastery, calculateRenown, masteryCeiling, masteryConfidence, renownTitle } from "./masteryRenownModel";

describe("Mastery", () => {
  it("keeps a perfect one-kill performance visibly provisional", () => {
    const result = calculateMastery({ peak: 100, form: 100, floor: 100, kills: 1 });

    expect(result.estimate).toBe(100);
    expect(result.confidence).toBeCloseTo(0.2212, 4);
    expect(result.rankedCeiling).toBe(65);
    expect(result.rankedMastery).toBe(65);
  });

  it("ends the provisional ranking discount at five kills per boss", () => {
    [55, 65, 73.75, 82.5, 91.25, 100, 100].forEach((ceiling, index) => {
      expect(masteryCeiling([0, 1, 2, 3, 4, 5, 20][index])).toBeCloseTo(ceiling, 5);
    });
    const fiveKills = calculateMastery({ peak: 90, form: 80, floor: 70, kills: 5 });
    expect(fiveKills.rankedMastery).toBe(fiveKills.estimate);
    expect(fiveKills.confidence).toBeLessThan(1);
  });

  it("keeps a lucky peak from overpowering weak form and floor", () => {
    const volatile = calculateMastery({ peak: 99.1, form: 45.1, floor: 28.5, kills: 6.8 });
    const proven = calculateMastery({ peak: 99.1, form: 94, floor: 86, kills: 6.8 });

    expect(volatile.estimate).toBeLessThan(60);
    expect(proven.rankedMastery).toBeGreaterThan(volatile.rankedMastery + 30);
  });

  it("can calculate a single-instance score without changing the career score", () => {
    const port = MASTERY_PLAYERS.find((player) => player.id === "port")!;
    const moltenCore = port.scopes.find((scope) => scope.id === "molten-core")!;
    const lowerKarazhan = port.scopes.find((scope) => scope.id === "lower-karazhan")!;

    const moltenCoreMastery = calculateMastery(moltenCore.performance);
    const lowerKarazhanMastery = calculateMastery(lowerKarazhan.performance);

    expect(moltenCoreMastery.rankedMastery).toBeGreaterThan(lowerKarazhanMastery.rankedMastery);
    expect(port.mastery.rankedMastery).not.toBe(moltenCoreMastery.rankedMastery);
    expect(port.renown).toBeGreaterThan(0);
  });

  it("sanitizes non-finite prototype inputs", () => {
    const result = calculateMastery({ peak: Number.NaN, form: Number.POSITIVE_INFINITY, floor: 80, kills: Number.NaN });

    expect(result.peak).toBe(0);
    expect(result.form).toBe(0);
    expect(result.floor).toBe(80);
    expect(result.confidence).toBe(0);
    expect(result.rankedMastery).toBeCloseTo(8.8, 5);
  });

  it("never decreases confidence as kills accumulate", () => {
    expect(masteryConfidence(0)).toBe(0);
    expect(masteryConfidence(2)).toBeGreaterThan(masteryConfidence(1));
    expect(masteryConfidence(10)).toBeGreaterThan(masteryConfidence(2));
  });
});

describe("Renown", () => {
  it("grows with witnessed career breadth while remaining distinct from Mastery", () => {
    const briefFlash = calculateRenown({ kills: 1, bosses: 1, completedRaids: 0 });
    const longCareer = calculateRenown({ kills: 250, bosses: 30, completedRaids: 4 });

    expect(briefFlash).toBe(50);
    expect(longCareer).toBeGreaterThan(briefFlash);
    expect(renownTitle(briefFlash)).toBe("Known");
    expect(renownTitle(longCareer)).toBe("Exalted");
  });
});
