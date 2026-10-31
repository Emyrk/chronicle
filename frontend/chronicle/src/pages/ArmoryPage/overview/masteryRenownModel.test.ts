import { describe, expect, it } from "vitest";
import { MASTERY_PLAYERS } from "./MasteryRenown.fixtures";
import { calculateMastery, calculateRenown, masteryCeiling, masteryConfidence, renownTitle } from "./masteryRenownModel";

describe("Mastery", () => {
  it("keeps a perfect one-kill performance visibly provisional", () => {
    const result = calculateMastery({ peak: 100, form: 100, floor: 100, kills: 1 });

    expect(result.estimate).toBe(100);
    expect(result.confidence).toBeCloseTo(0.2212, 4);
    expect(result.rankedCeiling).toBeCloseTo(64.95, 2);
    expect(result.rankedMastery).toBeCloseTo(64.95, 2);
  });

  it("rewards repeat evidence with diminishing returns", () => {
    const ceilings = [1, 2, 3, 5, 8, 14].map(masteryCeiling);
    const gains = ceilings.slice(1).map((ceiling, index) => ceiling - ceilings[index]);

    expect(ceilings).toEqual([...ceilings].sort((a, b) => a - b));
    expect(gains[0]).toBeGreaterThan(gains[gains.length - 1]);
    expect(ceilings[ceilings.length - 1]).toBeGreaterThan(98);
    expect(ceilings[ceilings.length - 1]).toBeLessThan(100);
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
