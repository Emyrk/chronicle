import { describe, expect, it } from "vitest";
import { calculateRelativeHealth, type RelativeHealthMessage } from "./relativeHealth";

function message(overrides: Partial<RelativeHealthMessage>): RelativeHealthMessage {
  return {
    id: "event",
    timestamp: 0,
    sequence: 0,
    kind: "damage",
    amount: 0,
    ...overrides,
  };
}

describe("calculateRelativeHealth", () => {
  it("moves left for damage and right for effective healing", () => {
    const state = calculateRelativeHealth([
      message({ id: "damage", timestamp: 1, kind: "damage", amount: 100 }),
      message({ id: "heal", timestamp: 2, kind: "healing", amount: 160, overheal: 20 }),
    ]);

    expect(state.current).toBe(40);
    expect(state.minimum).toBe(-100);
    expect(state.maximum).toBe(40);
    expect(state.effectiveHealing).toBe(140);
    expect(state.overhealing).toBe(20);
    expect(state.lastTransition).toEqual({
      kind: "healing",
      from: -100,
      to: 40,
      amount: 140,
      overheal: 20,
      prevented: 0,
    });
  });

  it("tracks the latest damage movement and its prevented region", () => {
    const state = calculateRelativeHealth([
      message({ kind: "damage", amount: 100, prevented: 30 }),
    ]);

    expect(state.current).toBe(-100);
    expect(state.minimum).toBe(-100);
    expect(state.maximum).toBe(0);
    expect(state.prevented).toBe(30);
    expect(state.lastTransition).toEqual({
      kind: "damage",
      from: 0,
      to: -100,
      amount: 100,
      overheal: 0,
      prevented: 30,
    });
  });

  it("anchors health to unit-resource samples and applies later events", () => {
    const state = calculateRelativeHealth([
      message({ id: "sample", timestamp: 1, kind: "health", amount: 800, currentHealth: 800, maximumHealth: 1_000 }),
      message({ id: "damage", timestamp: 2, kind: "damage", amount: 250 }),
      message({ id: "heal", timestamp: 3, kind: "healing", amount: 100 }),
    ]);

    expect(state.actualHealth).toBe(true);
    expect(state.maximumHealth).toBe(1_000);
    expect(state.current).toBe(650);
    expect(state.minimum).toBe(550);
    expect(state.maximum).toBe(800);
    expect(state.lastTransition).toMatchObject({ kind: "healing", from: 550, to: 650 });
  });

  it("clamps inferred movement to sampled health bounds", () => {
    const state = calculateRelativeHealth([
      message({ id: "sample", timestamp: 1, kind: "health", amount: 100, currentHealth: 100, maximumHealth: 1_000 }),
      message({ id: "damage", timestamp: 2, kind: "damage", amount: 500 }),
      message({ id: "heal", timestamp: 3, kind: "healing", amount: 2_000 }),
    ]);

    expect(state.current).toBe(1_000);
    expect(state.minimum).toBe(0);
    expect(state.maximum).toBe(1_000);
  });

  it("does not move health for standalone prevented-damage messages", () => {
    const state = calculateRelativeHealth([
      message({ kind: "prevented", amount: 500 }),
    ]);

    expect(state.current).toBe(0);
    expect(state.minimum).toBe(0);
    expect(state.maximum).toBe(0);
    expect(state.prevented).toBe(500);
    expect(state.lastTransition).toBeNull();
  });

  it("orders messages by timestamp and sequence before calculating extrema", () => {
    const state = calculateRelativeHealth([
      message({ id: "heal", timestamp: 10, sequence: 2, kind: "healing", amount: 150 }),
      message({ id: "damage", timestamp: 10, sequence: 1, kind: "damage", amount: 100 }),
    ]);

    expect(state.current).toBe(50);
    expect(state.minimum).toBe(-100);
    expect(state.maximum).toBe(50);
  });
});
