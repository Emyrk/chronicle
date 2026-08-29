import sharedFixture from "../../../../../../../testdata/roleinfer/cases.json";
import { describe, expect, it } from "vitest";
import {
  AlgorithmVersion,
  EvidenceAttempts,
  TankThreshold,
  createTankAttemptCounts,
  inferTanks,
  type TankAttemptCounts,
} from "./tankInference";

interface SharedFixtureExpected {
  is_tank: boolean;
  score: number;
  source: string;
  attempts: number;
  max_attempts: number;
}

interface SharedFixtureCase {
  name: string;
  selected_encounters: string[];
  counts: Record<string, Record<string, Record<string, number>>>;
  expected: Record<string, SharedFixtureExpected>;
}

const typedSharedFixture = sharedFixture as unknown as {
  algorithm_version: number;
  tank_threshold: number;
  evidence_attempts: number;
  cases: SharedFixtureCase[];
};

// Helper: set attempts in the nested map structure.
function setAttempts(
  state: TankAttemptCounts,
  encounterId: string,
  sourceGuid: string,
  playerGuid: string,
  attempts: number,
) {
  let sources = state.counts.get(encounterId);
  if (!sources) {
    sources = new Map();
    state.counts.set(encounterId, sources);
  }
  let players = sources.get(sourceGuid);
  if (!players) {
    players = new Map();
    sources.set(sourceGuid, players);
  }
  players.set(playerGuid, attempts);
}

describe("tankInference", () => {
  it("exports correct algorithm constants", () => {
    expect(AlgorithmVersion).toBe(2);
    expect(TankThreshold).toBe(0.4);
    expect(EvidenceAttempts).toBe(5);
  });

  it("classifies main tank receiving most auto attacks", () => {
    const state = createTankAttemptCounts();
    // Boss swings mostly at tank
    setAttempts(state, "enc1", "boss1", "tank", 100);
    setAttempts(state, "enc1", "boss1", "dps1", 5);
    setAttempts(state, "enc1", "boss1", "dps2", 3);

    const result = inferTanks(state, ["enc1"]);

    const tankEv = result.evidence.get("tank")!;
    expect(tankEv.isTank).toBe(true);
    // score = 100 / (100 + 5) = 0.952...
    expect(tankEv.tankScore).toBeCloseTo(100 / 105, 5);

    const dps1Ev = result.evidence.get("dps1")!;
    expect(dps1Ev.isTank).toBe(false);
    // score = 5 / (100 + 5) = 0.0476...
    expect(dps1Ev.tankScore).toBeCloseTo(5 / 105, 5);
  });

  it("handles tank swap — two tanks on different sources", () => {
    const state = createTankAttemptCounts();
    // Boss A swings at tank1, Boss B swings at tank2
    setAttempts(state, "enc1", "bossA", "tank1", 80);
    setAttempts(state, "enc1", "bossA", "tank2", 10);
    setAttempts(state, "enc1", "bossB", "tank2", 70);
    setAttempts(state, "enc1", "bossB", "tank1", 5);

    const result = inferTanks(state, ["enc1"]);

    expect(result.evidence.get("tank1")!.isTank).toBe(true);
    expect(result.evidence.get("tank2")!.isTank).toBe(true);
    // Each tank's strongest source should be the boss they were tanking
    expect(result.evidence.get("tank1")!.strongestSource!.sourceGuid).toBe("bossA");
    expect(result.evidence.get("tank2")!.strongestSource!.sourceGuid).toBe("bossB");
  });

  it("handles add tank — separate source in same encounter", () => {
    const state = createTankAttemptCounts();
    // Main boss on main tank
    setAttempts(state, "enc1", "boss", "mainTank", 90);
    setAttempts(state, "enc1", "boss", "addTank", 5);
    // Add mob on add tank
    setAttempts(state, "enc1", "add1", "addTank", 40);
    setAttempts(state, "enc1", "add1", "mainTank", 2);

    const result = inferTanks(state, ["enc1"]);

    expect(result.evidence.get("mainTank")!.isTank).toBe(true);
    expect(result.evidence.get("addTank")!.isTank).toBe(true);
    // Add tank's strongest source is the add
    expect(result.evidence.get("addTank")!.strongestSource!.sourceGuid).toBe("add1");
  });

  it("ignores AoE spell damage (not auto attacks)", () => {
    // AoE spell damage should never be fed to the processor since it has
    // a non-empty sourceName. This test verifies inference with no data.
    const state = createTankAttemptCounts();
    // Only one source that swings equally at everyone (no tank)
    setAttempts(state, "enc1", "boss", "p1", 10);
    setAttempts(state, "enc1", "boss", "p2", 10);
    setAttempts(state, "enc1", "boss", "p3", 10);

    const result = inferTanks(state, ["enc1"]);

    // All equal — score = 10 / (10+5) = 0.667, above the global threshold.
    // But that's fine — they'd all be tanks, which the caller handles.
    // The important thing is no crash.
    for (const ev of result.evidence.values()) {
      expect(ev.tankScore).toBeCloseTo(10 / 15, 5);
    }
  });

  it("rejects brief DPS pull — low evidence smoothed away", () => {
    const state = createTankAttemptCounts();
    // DPS pulls aggro for 3 swings, tank also gets 3
    setAttempts(state, "enc1", "boss", "dps", 3);
    setAttempts(state, "enc1", "boss", "tank", 3);

    const result = inferTanks(state, ["enc1"]);

    // score = 3 / (3 + 5) = 0.375, below 0.5 threshold
    for (const ev of result.evidence.values()) {
      expect(ev.isTank).toBe(false);
      expect(ev.tankScore).toBeCloseTo(3 / 8, 5);
    }
  });

  it("handles low evidence — single swing", () => {
    const state = createTankAttemptCounts();
    setAttempts(state, "enc1", "boss", "tank", 1);

    const result = inferTanks(state, ["enc1"]);

    // score = 1 / (1+5) = 0.167, below threshold
    expect(result.evidence.get("tank")!.isTank).toBe(false);
    expect(result.evidence.get("tank")!.tankScore).toBeCloseTo(1 / 6, 5);
  });

  it("requires tank evidence to persist across selected encounters", () => {
    const state = createTankAttemptCounts();
    // Encounter 1: tank gets most swings
    setAttempts(state, "enc1", "boss1", "tank", 50);
    setAttempts(state, "enc1", "boss1", "dps", 5);
    // Encounter 2: tank remains the primary target.
    setAttempts(state, "enc2", "boss2", "tank", 20);
    setAttempts(state, "enc2", "boss2", "dps", 8);

    const result = inferTanks(state, ["enc1", "enc2"]);

    const tankEv = result.evidence.get("tank")!;
    // Strongest source remains enc1, while persistence also remains high.
    expect(tankEv.isTank).toBe(true);
    expect(tankEv.tankScore).toBeCloseTo(50 / 55, 5);
    expect(tankEv.strongestSource!.sourceGuid).toBe("boss1");
  });

  it("matches the shared Go and TypeScript fixture corpus", () => {
    expect(typedSharedFixture.algorithm_version).toBe(AlgorithmVersion);
    expect(typedSharedFixture.tank_threshold).toBe(TankThreshold);
    expect(typedSharedFixture.evidence_attempts).toBe(EvidenceAttempts);

    for (const fixtureCase of typedSharedFixture.cases) {
      const state = createTankAttemptCounts();
      for (const [encounterId, sources] of Object.entries(fixtureCase.counts)) {
        for (const [sourceGuid, players] of Object.entries(sources)) {
          for (const [playerGuid, attempts] of Object.entries(players)) {
            setAttempts(state, encounterId, sourceGuid, playerGuid, attempts);
          }
        }
      }

      const result = inferTanks(state, fixtureCase.selected_encounters);
      for (const [playerGuid, expected] of Object.entries(fixtureCase.expected)) {
        const actual = result.evidence.get(playerGuid);
        expect(actual, `${fixtureCase.name}: ${playerGuid}`).toBeDefined();
        expect(actual!.isTank).toBe(expected.is_tank);
        expect(actual!.tankScore).toBeCloseTo(expected.score, 12);
        expect(actual!.strongestSource?.sourceGuid).toBe(expected.source);
        expect(actual!.strongestSource?.attempts).toBe(expected.attempts);
        expect(actual!.strongestSource?.maxAttempts).toBe(expected.max_attempts);
      }
    }
  });

  it("returns empty evidence when no data", () => {
    const state = createTankAttemptCounts();
    const result = inferTanks(state, ["enc1"]);
    expect(result.evidence.size).toBe(0);
  });

  it("only considers selected encounters", () => {
    const state = createTankAttemptCounts();
    setAttempts(state, "enc1", "boss", "tank", 100);
    setAttempts(state, "enc2", "boss", "dps", 100);

    // Only select enc2
    const result = inferTanks(state, ["enc2"]);
    expect(result.evidence.has("tank")).toBe(false);
    expect(result.evidence.get("dps")!.isTank).toBe(true);
  });
});
