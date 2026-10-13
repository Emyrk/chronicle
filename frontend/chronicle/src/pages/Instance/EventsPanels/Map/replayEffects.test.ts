import { describe, expect, it } from "vitest";
import {
  addEffectEvent,
  BEAM_MS,
  createEncounterEffects,
  DEFAULT_EFFECT_OPTIONS,
  deriveActiveEffects,
  eventWindow,
  HIT_WOBBLE_MS,
  INTERRUPT_COLOR,
  isDeadAt,
  MELEE_FLASH_MS,
  schoolColor,
  type DeriveEffectsOptions,
  type EncounterEffects,
  type ReplayEffectEvent,
} from "./replayEffects";

function event(timestampMs: number, kind: ReplayEffectEvent["kind"], source: string, target: string, extra: Partial<ReplayEffectEvent> = {}): ReplayEffectEvent {
  return {
    timestampMs,
    kind,
    source,
    target,
    school: 4,
    amount: 100,
    crit: false,
    periodic: false,
    melee: false,
    aoe: false,
    castTimeMs: 0,
    spellId: 133,
    ...extra,
  };
}

function effects(...events: ReplayEffectEvent[]): EncounterEffects {
  const fx = createEncounterEffects();
  for (const entry of events) addEffectEvent(fx, entry);
  return fx;
}

function derive(fx: EncounterEffects, cursorMs: number, options: Partial<DeriveEffectsOptions> = {}) {
  // Copy: the returned objects are reused between calls.
  return deriveActiveEffects(fx, cursorMs, { ...DEFAULT_EFFECT_OPTIONS, ...options }).map((effect) => ({ ...effect }));
}

describe("eventWindow", () => {
  const fx = effects(event(100, "damage", "a", "b"), event(200, "damage", "a", "b"), event(200, "heal", "a", "b"), event(300, "damage", "a", "b"));

  it("returns the inclusive range by binary search", () => {
    expect(eventWindow(fx.events, 150, 200)).toEqual([1, 3]);
    expect(eventWindow(fx.events, 0, 99)).toEqual([0, 0]);
    expect(eventWindow(fx.events, 0, 1_000)).toEqual([0, 4]);
    expect(eventWindow(fx.events, 301, 1_000)).toEqual([4, 4]);
  });

  it("keeps out-of-order arrivals sorted", () => {
    const sorted = effects(event(300, "damage", "a", "b"), event(100, "damage", "a", "b"), event(200, "damage", "a", "b"));
    expect(sorted.events.map((entry) => entry.timestampMs)).toEqual([100, 200, 300]);
  });
});

describe("deriveActiveEffects", () => {
  it("draws a beam and a hit wobble for a spell hit", () => {
    const fx = effects(event(1_000, "damage", "mage", "boss"));
    expect(derive(fx, 999)).toEqual([]);
    const active = derive(fx, 1_000 + BEAM_MS / 2);
    expect(active).toEqual([
      expect.objectContaining({ type: "beam", source: "mage", target: "boss", progress: 0.5, color: schoolColor(4) }),
      expect.objectContaining({ type: "hit", target: "boss", progress: (BEAM_MS / 2) / HIT_WOBBLE_MS }),
    ]);
    expect(derive(fx, 1_000 + BEAM_MS).map((effect) => effect.type)).toEqual([]);
  });

  it("flashes the target without a beam for melee", () => {
    const fx = effects(event(1_000, "damage", "warrior", "boss", { melee: true, school: 2 }));
    expect(derive(fx, 1_050)).toEqual([expect.objectContaining({ type: "hit", target: "boss", color: schoolColor(2) })]);
    expect(derive(fx, 1_000 + MELEE_FLASH_MS)).toEqual([]);
  });

  it("drops periodic ticks and heals unless enabled", () => {
    const fx = effects(event(1_000, "damage", "lock", "boss", { periodic: true }), event(1_000, "heal", "priest", "tank"));
    expect(derive(fx, 1_010, { showHeals: false })).toEqual([]);
    expect(derive(fx, 1_010).map((effect) => effect.type)).toEqual(["beam"]);
    expect(derive(fx, 1_010, { showPeriodic: true, showHeals: false }).map((effect) => effect.type)).toEqual(["beam", "hit"]);
  });

  it("merges same source -> target hits within 100 ms", () => {
    const fx = effects(event(1_000, "damage", "mage", "boss"), event(1_080, "damage", "mage", "boss"), event(1_250, "damage", "mage", "boss"));
    const beams = derive(fx, 1_260).filter((effect) => effect.type === "beam");
    expect(beams).toHaveLength(2);
    expect(beams[0].eventMs).toBe(1_250);
    expect(beams[1].eventMs).toBe(1_080);
    expect(beams[1].intensity).toBeGreaterThan(1);
  });

  it("honours the guid filter and visibility", () => {
    const fx = effects(event(1_000, "damage", "mage", "boss"), event(1_000, "damage", "rogue", "boss", { melee: true, school: 2 }));
    expect(derive(fx, 1_010, { filterGuids: new Set(["rogue"]) })).toEqual([expect.objectContaining({ type: "hit", target: "boss" })]);
    expect(derive(fx, 1_010, { visibleGuids: new Set(["boss"]) }).map((effect) => effect.type)).toEqual(["hit", "hit"]);
  });

  it("caps effects and keeps priority units", () => {
    const events = Array.from({ length: 100 }, (_, index) => event(1_000 + index, "damage", `p${index}`, `t${index}`));
    events.push(event(900, "damage", "selected", "t0"));
    const fx = effects(...events);
    const active = derive(fx, 1_100, { maxEffects: 64, priorityGuids: new Set(["selected"]) });
    expect(active).toHaveLength(64);
    expect(active.some((effect) => effect.source === "selected")).toBe(true);
  });

  it("is deterministic when scrubbing back and forth", () => {
    const fx = effects(
      event(1_000, "damage", "mage", "boss"),
      event(1_100, "cast_start", "priest", "", { castTimeMs: 2_500 }),
      event(1_200, "damage", "rogue", "boss", { melee: true }),
      event(1_400, "cast_go", "mage", "", { aoe: true }),
    );
    const out = deriveActiveEffects(fx, 1_450, DEFAULT_EFFECT_OPTIONS, []);
    const forward = out.map((effect) => ({ ...effect }));
    deriveActiveEffects(fx, 5_000, DEFAULT_EFFECT_OPTIONS, out);
    expect(out).toEqual([]);
    deriveActiveEffects(fx, 300, DEFAULT_EFFECT_OPTIONS, out);
    expect(out).toEqual([]);
    expect(deriveActiveEffects(fx, 1_450, DEFAULT_EFFECT_OPTIONS, out).map((effect) => ({ ...effect }))).toEqual(forward);
  });

  it("draws cast rings until the cast goes off or is interrupted", () => {
    const fx = effects(
      event(1_000, "cast_start", "priest", "", { castTimeMs: 2_000 }),
      event(2_000, "cast_start", "mage", "", { castTimeMs: 2_000 }),
      event(2_500, "interrupt", "rogue", "mage"),
      event(3_000, "cast_go", "priest", ""),
    );
    expect(derive(fx, 2_000)).toEqual([
      expect.objectContaining({ type: "cast", target: "mage", progress: 0 }),
      expect.objectContaining({ type: "cast", target: "priest", progress: 0.5 }),
    ]);
    expect(derive(fx, 2_600)).toEqual([
      expect.objectContaining({ type: "hit", target: "mage", color: INTERRUPT_COLOR }),
      expect.objectContaining({ type: "cast", target: "priest" }),
    ]);
    expect(derive(fx, 3_010)).toEqual([]);
  });

  it("pulses a ring for AoE casts", () => {
    const fx = effects(event(1_000, "cast_go", "mage", "", { aoe: true }), event(1_000, "cast_go", "priest", ""));
    expect(derive(fx, 1_300)).toEqual([expect.objectContaining({ type: "ring", target: "mage", progress: 0.5 })]);
  });
});

describe("isDeadAt", () => {
  const fx = effects(
    event(1_000, "slain", "boss", "tank"),
    event(5_000, "resurrect", "priest", "tank"),
    event(8_000, "slain", "boss", "tank"),
  );

  it("stays dead until resurrected", () => {
    expect(isDeadAt(fx, "tank", 999)).toBe(false);
    expect(isDeadAt(fx, "tank", 1_000)).toBe(true);
    expect(isDeadAt(fx, "tank", 4_999)).toBe(true);
    expect(isDeadAt(fx, "tank", 5_000)).toBe(false);
    expect(isDeadAt(fx, "tank", 9_000)).toBe(true);
    expect(isDeadAt(fx, "healer", 9_000)).toBe(false);
  });
});
