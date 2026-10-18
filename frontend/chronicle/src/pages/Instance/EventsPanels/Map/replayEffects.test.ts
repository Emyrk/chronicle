import { describe, expect, it } from "vitest";
import {
  effectiveCastIconGuids,
  addEffectEvent,
  collectCastSpellIds,
  iconPreloadUrls,
  MAX_PRELOAD_ICONS,
  BEAM_MS,
  CAST_ICON_MS,
  COMBAT_TEXT_MS,
  createEncounterEffects,
  DEFAULT_EFFECT_OPTIONS,
  deriveActiveEffects,
  deriveCastIcons,
  deriveLastHitTargets,
  deriveUnitCasts,
  deriveCombatText,
  deriveRecentHealGain,
  formatHealAmount,
  HEAL_CHUNK_MS,
  HEAL_COLOR,
  HEAL_CRIT_COLOR,
  HEAL_PULSE_MS,
  OVERHEAL_COLOR,
  eventWindow,
  HIT_WOBBLE_MS,
  INTERRUPT_COLOR,
  INTERRUPTED_ICON_MS,
  INTERRUPTED_PLAYER_ICON_MS,
  isBasicAttack,
  isDeadAt,
  MELEE_FLASH_MS,
  RANGED_AUTO_COLOR,
  schoolColor,
  SLASH_MS,
  STREAK_MS,
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
    overheal: 0,
    absorbed: 0,
    effective: kind === "heal" ? (extra.amount ?? 100) - (extra.overheal ?? 0) : 0,
    crit: false,
    periodic: false,
    attack: "spell",
    aoe: false,
    castTimeMs: 0,
    spellId: 133,
    spellName: "Fireball",
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

  it("draws swings as a lunge and slash, never a beam", () => {
    const fx = effects(event(1_000, "damage", "warrior", "boss", { attack: "swing", school: 2, spellId: 6603 }));
    expect(derive(fx, 1_050)).toEqual([
      expect.objectContaining({ type: "lunge", source: "warrior", target: "boss" }),
      expect.objectContaining({ type: "slash", source: "warrior", target: "boss" }),
      expect.objectContaining({ type: "hit", target: "boss", color: schoolColor(2) }),
    ]);
    expect(derive(fx, 1_000 + MELEE_FLASH_MS).map((effect) => effect.type)).toEqual(["slash"]);
    expect(derive(fx, 1_000 + SLASH_MS)).toEqual([]);
  });

  it("adds an impact burst for melee abilities", () => {
    const fx = effects(event(1_000, "damage", "warrior", "boss", { attack: "melee_ability", school: 2, spellId: 78 }));
    expect(derive(fx, 1_050).map((effect) => effect.type)).toEqual(["lunge", "slash", "impact", "hit"]);
  });

  it("draws ranged auto attacks as a fast white streak", () => {
    const fx = effects(event(1_000, "damage", "hunter", "boss", { attack: "ranged_auto", school: 2, spellId: 75 }));
    expect(derive(fx, 1_050)).toEqual([
      expect.objectContaining({ type: "streak", source: "hunter", target: "boss", color: RANGED_AUTO_COLOR }),
      expect.objectContaining({ type: "hit", target: "boss" }),
    ]);
    expect(derive(fx, 1_000 + STREAK_MS).map((effect) => effect.type)).toEqual(["hit"]);
  });

  it("drops periodic ticks and heals unless enabled", () => {
    const fx = effects(event(1_000, "damage", "lock", "boss", { periodic: true }), event(1_000, "heal", "priest", "tank"));
    expect(derive(fx, 1_010, { showHeals: false })).toEqual([]);
    expect(derive(fx, 1_010).map((effect) => effect.type)).toEqual(["beam", "heal"]);
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
    const fx = effects(event(1_000, "damage", "mage", "boss"), event(1_000, "damage", "rogue", "boss", { attack: "swing", school: 2 }));
    expect(derive(fx, 1_010, { filterGuids: new Set(["rogue"]) }).map((effect) => effect.type)).toEqual(["lunge", "slash", "hit"]);
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
      event(1_200, "damage", "rogue", "boss", { attack: "swing" }),
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

  it("draws no effect for a cast in progress (the token's cast arc shows it), only its interrupt", () => {
    const fx = effects(
      event(1_000, "cast_start", "priest", "", { castTimeMs: 2_000 }),
      event(2_000, "cast_start", "mage", "", { castTimeMs: 2_000 }),
      event(2_500, "interrupt", "rogue", "mage"),
    );
    expect(derive(fx, 2_000)).toEqual([]);
    expect(derive(fx, 2_600)).toEqual([expect.objectContaining({ type: "hit", target: "mage", color: INTERRUPT_COLOR })]);
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

describe("effect spell info", () => {
  it("carries the event's spell and amount for hover tooltips", () => {
    const fx = effects(event(1_000, "damage", "mage", "boss", { spellId: 116, spellName: "Frostbolt", amount: 812, school: 6 }));
    expect(derive(fx, 1_010)[0]).toMatchObject({ type: "beam", eventKind: "damage", spellId: 116, spellName: "Frostbolt", amount: 812 });
  });
});

describe("deriveCombatText", () => {
  const options = { showPeriodic: false, showHeals: true, showOverheal: false };
  const fx = effects(
    event(1_000, "damage", "mage", "boss", { spellName: "Frostbolt", school: 6, crit: true }),
    event(1_200, "damage", "lock", "boss", { spellName: "Shadow Bolt" }),
    event(1_300, "damage", "mage", "boss", { spellName: "Ignite", periodic: true }),
    event(1_400, "heal", "priest", "tank", { spellName: "Heal", amount: 1_234 }),
    event(1_450, "heal", "priest", "tank", { spellName: "Heal", amount: 800, overheal: 800 }),
    event(1_500, "cast_go", "mage", "boss", { spellName: "Frostbolt" }),
  );

  it("names the sources' hits and numbers heals on the heal units, newest first", () => {
    const texts = deriveCombatText(fx, 1_500, new Set(["mage"]), new Set(["tank"]), null, options, 8).map((text) => ({ ...text }));
    expect(texts).toEqual([
      { target: "tank", text: "+1.2k", color: HEAL_COLOR, crit: false, progress: 100 / COMBAT_TEXT_MS },
      { target: "boss", text: "Frostbolt", color: schoolColor(6), crit: true, progress: 500 / COMBAT_TEXT_MS },
    ]);
    expect(deriveCombatText(fx, 1_500, new Set(["mage"]), new Set(["tank"]), null, { ...options, showOverheal: true }, 8)[0])
      .toMatchObject({ text: "+800", color: OVERHEAL_COLOR });
    expect(deriveCombatText(fx, 1_500, new Set(["mage"]), null, null, options, 8).map((text) => text.text)).toEqual(["Frostbolt"]);
    expect(deriveCombatText(fx, 1_500, null, new Set(["priest"]), null, { ...options, showHeals: false }, 8)).toEqual([]);
    expect(deriveCombatText(fx, 1_500, new Set(["mage"]), new Set(["tank"]), null, options, 1)).toHaveLength(1);
  });

  it("expires after COMBAT_TEXT_MS and re-derives the same text when scrubbing back", () => {
    const sources = new Set(["mage"]);
    const out = deriveCombatText(fx, 1_050, sources, null, null, options, 8);
    const forward = out.map((text) => ({ ...text }));
    expect(deriveCombatText(fx, 1_000 + COMBAT_TEXT_MS + 500, sources, null, null, options, 8, out)).toEqual([]);
    expect(deriveCombatText(fx, 1_050, sources, null, null, options, 8, out).map((text) => ({ ...text }))).toEqual(forward);
  });
});

describe("formatHealAmount", () => {
  it.each([
    [56, "+56"],
    [987, "+990"],
    [1_234, "+1.2k"],
    [12_345, "+12k"],
    [1_550_000, "+1.6M"],
  ])("rounds %d to %s", (amount, text) => {
    expect(formatHealAmount(amount)).toBe(text);
  });
});

describe("heals", () => {
  it("draws only effective healing unless overheal is on", () => {
    const fx = effects(event(1_000, "heal", "priest", "tank", { amount: 500, overheal: 500 }));
    expect(derive(fx, 1_010)).toEqual([]);
    expect(derive(fx, 1_010, { showOverheal: true })).toEqual([
      expect.objectContaining({ type: "beam", color: OVERHEAL_COLOR }),
    ]);
  });

  it("draws a green bolt and a pulse sized by effective healing, gold on crits", () => {
    const fx = effects(
      event(1_000, "heal", "priest", "tank", { amount: 3_000, overheal: 2_500 }),
      event(1_000, "heal", "paladin", "rogue", { amount: 3_000, crit: true }),
    );
    const active = derive(fx, 1_010);
    const pulse = (target: string) => active.find((effect) => effect.type === "heal" && effect.target === target)!;
    expect(active.find((effect) => effect.type === "beam" && effect.target === "tank")).toMatchObject({ color: HEAL_COLOR });
    expect(pulse("tank")).toMatchObject({ color: HEAL_COLOR, amount: 500 });
    expect(pulse("rogue")).toMatchObject({ color: HEAL_CRIT_COLOR, amount: 3_000 });
    expect(pulse("rogue").intensity).toBeGreaterThan(pulse("tank").intensity);
    expect(derive(fx, 1_000 + HEAL_PULSE_MS).some((effect) => effect.type === "heal")).toBe(false);
  });

  it("merges heal-over-time ticks on one target within 500 ms into one pulse", () => {
    const fx = effects(
      event(1_000, "heal", "priest", "tank", { periodic: true, amount: 300 }),
      event(1_300, "heal", "druid", "tank", { periodic: true, amount: 200 }),
      event(2_000, "heal", "druid", "tank", { periodic: true, amount: 200 }),
    );
    const pulses = (cursorMs: number) => derive(fx, cursorMs).filter((effect) => effect.type === "heal");
    // No bolts for ticks by default; one pulse holding both ticks' healing,
    // even after the older tick's own pulse would have expired.
    expect(derive(fx, 1_310).map((effect) => effect.type)).toEqual(["heal"]);
    expect(pulses(1_310)).toEqual([expect.objectContaining({ amount: 500, eventMs: 1_300 })]);
    expect(pulses(1_700)).toEqual([expect.objectContaining({ amount: 500 })]);
    expect(pulses(2_010)).toEqual([expect.objectContaining({ amount: 200, eventMs: 2_000 })]);
  });

  it("derives the recent heal gain, shrinking over HEAL_CHUNK_MS", () => {
    const fx = effects(
      event(1_000, "heal", "priest", "tank", { amount: 1_000 }),
      event(1_000, "heal", "priest", "tank", { amount: 400, overheal: 400 }),
      event(1_000, "heal", "priest", "rogue", { amount: 700 }),
    );
    expect(deriveRecentHealGain(fx, "tank", 999)).toBe(0);
    expect(deriveRecentHealGain(fx, "tank", 1_000)).toBe(1_000);
    expect(deriveRecentHealGain(fx, "tank", 1_000 + HEAL_CHUNK_MS / 2)).toBeCloseTo(500);
    expect(deriveRecentHealGain(fx, "tank", 1_000 + HEAL_CHUNK_MS)).toBe(0);
    expect(deriveRecentHealGain(fx, "nobody", 1_000)).toBe(0);
  });

  it("re-derives identical heal frames after scrubbing backwards", () => {
    const fx = effects(
      event(1_000, "heal", "priest", "tank", { periodic: true, amount: 300 }),
      event(1_200, "heal", "druid", "tank", { periodic: true, amount: 250 }),
      event(1_400, "heal", "priest", "tank", { amount: 2_000, crit: true }),
      event(1_500, "heal", "priest", "tank", { amount: 500, overheal: 500 }),
    );
    const frame = (cursorMs: number) => ({ effects: derive(fx, cursorMs), gain: deriveRecentHealGain(fx, "tank", cursorMs) });
    const forward = [1_100, 1_250, 1_450, 1_600].map(frame);
    frame(3_000);
    const backward = [1_600, 1_450, 1_250, 1_100].map(frame).reverse();
    expect(backward).toEqual(forward);
  });
});

describe("deriveLastHitTargets", () => {
  it("finds each source's latest damage target within the lookback", () => {
    const fx = effects(
      event(1_000, "damage", "boss", "tank"),
      event(2_000, "damage", "boss", "mage"),
      event(2_500, "heal", "boss", "boss"),
      event(3_000, "damage", "add", "add"),
      event(3_000, "damage", "mage", "boss"),
    );
    const enemies = new Set(["boss", "add"]);
    expect(deriveLastHitTargets(fx, 1_500, enemies)).toEqual(new Map([["boss", "tank"]]));
    expect(deriveLastHitTargets(fx, 3_000, enemies)).toEqual(new Map([["boss", "mage"]]));
    expect(deriveLastHitTargets(fx, 20_000, enemies).size).toBe(0);
  });
});

describe("deriveUnitCasts", () => {
  it("reports a cast bar until it goes off, is interrupted or the caster dies", () => {
    const fx = effects(
      event(1_000, "cast_start", "mage", "boss", { castTimeMs: 2_000, school: 4 }),
      event(3_000, "cast_go", "mage", "boss"),
      event(4_000, "cast_start", "priest", "tank", { castTimeMs: 2_500 }),
      event(4_500, "interrupt", "boss", "priest"),
      event(5_000, "cast_start", "boss", "tank", { castTimeMs: 2_000 }),
      event(6_500, "slain", "mage", "boss"),
    );
    expect(deriveUnitCasts(fx, 2_000).get("mage")).toEqual({ progress: 0.5, school: 4, spellId: 133, spellName: "Fireball" });
    expect(deriveUnitCasts(fx, 3_000).has("mage")).toBe(false);
    expect(deriveUnitCasts(fx, 4_400).get("priest")?.progress).toBeCloseTo(0.16);
    expect(deriveUnitCasts(fx, 4_600).has("priest")).toBe(false);
    expect(deriveUnitCasts(fx, 6_000).get("boss")?.progress).toBe(0.5);
    expect(deriveUnitCasts(fx, 6_600).has("boss")).toBe(false);
  });
});

describe("deriveCastIcons", () => {
  const casters = new Set(["mage", "boss"]);
  const icons = (fx: EncounterEffects, cursorMs: number, max = 12) =>
    deriveCastIcons(fx, cursorMs, casters, max).map((icon) => ({ ...icon }));

  it("shows a cast from its start until it goes off, then briefly as an instant", () => {
    const fx = effects(
      event(1_000, "cast_start", "mage", "boss", { castTimeMs: 2_000 }),
      event(3_000, "cast_go", "mage", "boss"),
    );
    expect(icons(fx, 999)).toEqual([]);
    const icon = { caster: "mage", spellId: 133, spellName: "Fireball", progress: 0.5, cutProgress: 0, enemy: false };
    expect(icons(fx, 2_000)).toEqual([{ ...icon, elapsedMs: 1_000, phase: "casting" }]);
    expect(icons(fx, 3_000 + CAST_ICON_MS / 2)).toEqual([{ ...icon, elapsedMs: CAST_ICON_MS / 2, phase: "instant" }]);
    expect(icons(fx, 3_000 + CAST_ICON_MS)).toEqual([]);
  });

  it("ends a cast at an interrupt, the caster's next cast, or the capped cast time", () => {
    const interrupted = effects(
      event(1_000, "cast_start", "mage", "boss", { castTimeMs: 2_500 }),
      event(1_500, "interrupt", "rogue", "mage"),
    );
    expect(icons(interrupted, 1_400)).toMatchObject([{ phase: "casting" }]);
    expect(icons(interrupted, 1_600))
      .toMatchObject([{ phase: "interrupted", elapsedMs: 100, progress: 100 / INTERRUPTED_PLAYER_ICON_MS, cutProgress: 0.2 }]);
    expect(icons(interrupted, 1_500 + INTERRUPTED_PLAYER_ICON_MS)).toEqual([]);
    const replaced = effects(
      event(1_000, "cast_start", "mage", "boss", { castTimeMs: 2_500 }),
      event(1_500, "cast_start", "mage", "boss", { castTimeMs: 1_500, spellId: 116 }),
    );
    expect(icons(replaced, 1_600).map((icon) => icon.spellId)).toEqual([116]);
    const long = effects(event(1_000, "cast_start", "boss", "", { castTimeMs: 10_000 }));
    expect(icons(long, 3_999)).toHaveLength(1);
    expect(icons(long, 4_000)).toEqual([]);
  });

  it("keeps a cast up through another spell going off", () => {
    const fx = effects(
      event(1_000, "cast_start", "mage", "boss", { castTimeMs: 2_000 }),
      event(1_500, "cast_go", "mage", "boss", { spellId: 12_654 }),
    );
    expect(icons(fx, 1_600).map((icon) => [icon.spellId, icon.phase])).toEqual([[12_654, "instant"], [133, "casting"]]);
  });

  it("depends only on the cursor, so scrubbing backwards matches playing forwards", () => {
    const fx = effects(
      event(1_000, "cast_start", "mage", "boss", { castTimeMs: 2_000 }),
      event(1_800, "interrupt", "rogue", "mage"),
      event(2_000, "cast_go", "boss", "mage", { spellId: 2120 }),
    );
    const frames = [500, 1_050, 1_200, 1_850, 1_900, 2_100, 2_300, 2_950];
    const forward = frames.map((ms) => icons(fx, ms));
    icons(fx, 10_000);
    const backward = [...frames].reverse().map((ms) => icons(fx, ms)).reverse();
    expect(backward).toEqual(forward);
    // Grow-in, interrupt and pop phases are all covered.
    expect(forward[1]).toMatchObject([{ phase: "casting", elapsedMs: 50 }]);
    expect(forward[3]).toMatchObject([{ phase: "interrupted", elapsedMs: 50 }]);
    expect(forward[5]).toMatchObject([{ phase: "instant", elapsedMs: 100 }, { phase: "interrupted", elapsedMs: 300 }]);
    expect(forward[7]).toEqual([]);
  });

  it("skips auto attacks, unknown spells and other casters", () => {
    const fx = effects(
      event(1_000, "cast_go", "mage", "boss", { spellId: 6603 }),
      event(1_000, "cast_go", "mage", "boss", { spellId: 75 }),
      event(1_000, "cast_go", "mage", "boss", { spellId: 5019 }),
      event(1_000, "cast_go", "mage", "boss", { spellId: null }),
      event(1_000, "cast_go", "mage", "boss", { spellId: 99_999, spellName: "Auto Shot" }),
      event(1_000, "cast_go", "priest", "mage"),
    );
    expect(icons(fx, 1_100)).toEqual([]);
  });

  it("limits icons per caster and in all", () => {
    const fx = effects(
      event(1_000, "cast_go", "mage", "boss", { spellId: 1 }),
      event(1_100, "cast_go", "mage", "boss", { spellId: 2 }),
      event(1_200, "cast_go", "mage", "boss", { spellId: 3 }),
      event(1_200, "cast_go", "boss", "mage", { spellId: 4 }),
    );
    expect(icons(fx, 1_300).map((icon) => icon.spellId)).toEqual([4, 3, 2]);
    expect(icons(fx, 1_300, 1).map((icon) => icon.spellId)).toEqual([4]);
  });

  it("keeps bosses, then ongoing casts, then the newest over the cap", () => {
    const fx = effects(
      event(1_000, "cast_start", "boss", "mage", { spellId: 1, castTimeMs: 2_000 }),
      event(1_100, "cast_start", "mage", "boss", { spellId: 2, castTimeMs: 2_000 }),
      event(1_200, "cast_go", "lock", "boss", { spellId: 3 }),
      event(1_300, "cast_go", "priest", "boss", { spellId: 4 }),
    );
    const all = new Set(["boss", "mage", "lock", "priest"]);
    const options = { priorityGuids: new Set(["boss"]), filterGuids: null };
    const capped = (max: number) => deriveCastIcons(fx, 1_400, all, max, [], options).map((icon) => icon.spellId);
    expect(capped(4)).toEqual([4, 3, 2, 1]);
    expect(capped(3)).toEqual([4, 2, 1]);
    expect(capped(2)).toEqual([2, 1]);
    expect(capped(1)).toEqual([1]);
  });

  it("honours the Only selected filter", () => {
    const fx = effects(
      event(1_000, "cast_go", "boss", "mage", { spellId: 1 }),
      event(1_000, "cast_go", "boss", "", { spellId: 2 }),
    );
    const filtered = deriveCastIcons(fx, 1_100, casters, 12, [], { priorityGuids: null, filterGuids: new Set(["mage"]) });
    expect(filtered.map((icon) => icon.spellId)).toEqual([1]);
  });
});

describe("interrupted casts", () => {
  const boss = new Set(["boss"]);
  const enemies = { priorityGuids: null, filterGuids: null, enemyGuids: boss };
  const icons = (fx: EncounterEffects, cursorMs: number, sources: ReadonlySet<string> = boss) =>
    deriveCastIcons(fx, cursorMs, sources, 12, [], enemies).map((icon) => ({ ...icon }));
  const cut = effects(
    event(1_000, "cast_start", "boss", "", { spellId: 2120, castTimeMs: 2_500 }),
    event(2_000, "interrupt", "rogue", "boss", { spellId: 2120 }),
  );

  it("is in colour before the interrupt, greyed after it and gone INTERRUPTED_ICON_MS later", () => {
    expect(icons(cut, 1_999)).toMatchObject([{ phase: "casting" }]);
    expect(icons(cut, 2_001)).toMatchObject([{ phase: "interrupted", elapsedMs: 1, cutProgress: 1_000 / 2_500, enemy: true }]);
    expect(icons(cut, 2_000 + INTERRUPTED_ICON_MS - 1)).toHaveLength(1);
    expect(icons(cut, 2_000 + INTERRUPTED_ICON_MS)).toEqual([]);
  });

  it("returns to casting when scrubbing back before the interrupt", () => {
    const forward = [1_500, 1_999, 2_001, 2_400, 2_799].map((ms) => icons(cut, ms));
    icons(cut, 10_000);
    const backward = [2_799, 2_400, 2_001, 1_999, 1_500].map((ms) => icons(cut, ms)).reverse();
    expect(backward).toEqual(forward);
    expect(icons(cut, 1_999)[0].phase).toBe("casting");
  });

  it("leaves an instant icon unchanged by an interrupt after the cast went off", () => {
    const fx = effects(
      event(1_000, "cast_start", "boss", "", { spellId: 2120, castTimeMs: 1_000 }),
      event(2_000, "cast_go", "boss", "", { spellId: 2120 }),
      event(2_100, "interrupt", "rogue", "boss", { spellId: null }),
    );
    expect(icons(fx, 2_200)).toEqual([{
      caster: "boss", spellId: 2120, spellName: "Fireball", phase: "instant", elapsedMs: 200, progress: 200 / CAST_ICON_MS, cutProgress: 0, enemy: true,
    }]);
  });

  it("greys the open cast for its own or an unknown spell id only", () => {
    const withId = (spellId: number | null) => effects(
      event(1_000, "cast_start", "boss", "", { spellId: 2120, castTimeMs: 2_500 }),
      event(2_000, "interrupt", "rogue", "boss", { spellId }),
    );
    expect(icons(withId(686), 2_100)).toMatchObject([{ phase: "casting" }]);
    expect(icons(withId(null), 2_100)).toMatchObject([{ phase: "interrupted" }]);
    expect(icons(withId(0), 2_100)).toMatchObject([{ phase: "interrupted" }]);
  });

  it("greys only the cut cast when a caster shows two icons", () => {
    const fx = effects(
      event(1_000, "cast_start", "boss", "", { spellId: 2120, castTimeMs: 2_500 }),
      event(1_800, "cast_go", "boss", "", { spellId: 8_042 }),
      event(2_000, "interrupt", "rogue", "boss", { spellId: 2120 }),
    );
    expect(icons(fx, 2_100).map((icon) => [icon.spellId, icon.phase])).toEqual([[8_042, "instant"], [2120, "interrupted"]]);
  });

  it("works for a boss with no players selected, and for interrupts past the capped cast time", () => {
    const long = effects(
      event(1_000, "cast_start", "boss", "", { spellId: 2120, castTimeMs: 3_500 }),
      event(4_200, "interrupt", "rogue", "boss", { spellId: null }),
    );
    expect(icons(long, 4_100)).toEqual([]);
    expect(icons(long, 4_300)).toMatchObject([{ phase: "interrupted", cutProgress: 1 }]);
    // An interrupt after the full cast time does not cut it.
    const late = effects(
      event(1_000, "cast_start", "boss", "", { spellId: 2120, castTimeMs: 2_000 }),
      event(3_100, "interrupt", "rogue", "boss", { spellId: null }),
    );
    expect(icons(late, 3_200)).toEqual([]);
  });

  it("drops the icon at once when the caster dies", () => {
    const fx = effects(
      event(1_000, "cast_start", "boss", "", { spellId: 2120, castTimeMs: 2_500 }),
      event(2_000, "slain", "rogue", "boss"),
      event(2_000, "interrupt", "rogue", "boss", { spellId: null }),
    );
    expect(icons(fx, 1_999)).toHaveLength(1);
    expect(icons(fx, 2_000)).toEqual([]);
  });

  it("keeps the spell (and so the icon texture) through the interrupt", () => {
    const textures = new Set<number>();
    for (let ms = 900; ms <= 3_000; ms += 10) for (const icon of icons(cut, ms)) textures.add(icon.spellId);
    expect([...textures]).toEqual([2120]);
  });
});

describe("isBasicAttack", () => {
  const hit = (extra: Partial<ReplayEffectEvent>, kind: ReplayEffectEvent["kind"] = "damage") => isBasicAttack(event(0, kind, "a", "b", extra));

  it("matches auto attack spell ids with any name", () => {
    for (const spellId of [6603, 75, 5019]) {
      expect(hit({ spellId, spellName: "Whatever" })).toBe(true);
      expect(hit({ spellId, spellName: "" }, "cast_go")).toBe(true);
    }
  });

  it("matches swings and ranged autos without a spell id, and casts without a spell", () => {
    expect(hit({ spellId: null, spellName: "", attack: "swing" })).toBe(true);
    expect(hit({ spellId: null, spellName: "", attack: "ranged_auto" })).toBe(true);
    expect(hit({ spellId: null, spellName: "" }, "cast_start")).toBe(true);
    expect(hit({ spellId: null, spellName: "" }, "cast_go")).toBe(true);
  });

  it("matches basic attack names exactly, ignoring case and whitespace", () => {
    for (const spellName of ["Auto Attack", "Auto Attack (OH)", "auto attack - offhand", " Auto Shot ", "SHOOT", "Melee", "Attack"]) {
      expect(hit({ spellId: 1, spellName })).toBe(true);
    }
  });

  it("does not match abilities, spells, heals or names that merely contain one", () => {
    expect(hit({ spellId: 78, spellName: "Heroic Strike", attack: "melee_ability" })).toBe(false);
    expect(hit({ spellId: 116, spellName: "Frostbolt" })).toBe(false);
    expect(hit({ spellId: 116, spellName: "Frostbolt" }, "cast_go")).toBe(false);
    expect(hit({ spellId: 2054, spellName: "Heal" }, "heal")).toBe(false);
    expect(hit({ spellId: 1, spellName: "Attack Power" })).toBe(false);
  });
});

describe("basic attacks and cast parity", () => {
  // Auto Shot, Auto Attack, wand Shoot and a Frostbolt that lands 600 ms after it goes off.
  const fx = effects(
    event(1_000, "cast_start", "mage", "boss", { spellId: 116, spellName: "Frostbolt", castTimeMs: 2_000, school: 6 }),
    event(1_500, "cast_go", "hunter", "boss", { spellId: 75, spellName: "Auto Shot" }),
    event(1_500, "damage", "hunter", "boss", { spellId: 75, spellName: "Auto Shot", attack: "ranged_auto" }),
    event(1_600, "damage", "warrior", "boss", { spellId: 6603, spellName: "Auto Attack", attack: "swing" }),
    event(1_700, "damage", "warrior", "boss", { spellId: null, spellName: "", attack: "swing" }),
    event(1_800, "cast_go", "priest", "boss", { spellId: 5019, spellName: "Shoot" }),
    event(1_800, "damage", "priest", "boss", { spellId: 5019, spellName: "Shoot", attack: "ranged_auto" }),
    event(3_000, "cast_go", "mage", "boss", { spellId: 116, spellName: "Frostbolt", school: 6 }),
    event(3_600, "damage", "mage", "boss", { spellId: 116, spellName: "Frostbolt", school: 6 }),
  );
  const everyone = new Set(["mage", "hunter", "warrior", "priest"]);
  const options = { showPeriodic: false, showHeals: true, showOverheal: false };

  it("never floats text or icons for basic attacks", () => {
    for (let ms = 1_000; ms <= 4_000; ms += 50) {
      expect(deriveCombatText(fx, ms, everyone, null, null, options, 8).every((text) => text.text === "Frostbolt")).toBe(true);
      expect(deriveCastIcons(fx, ms, everyone, 12).every((icon) => icon.spellId === 116)).toBe(true);
    }
  });

  it("shows the Frostbolt icon at the caster from its start to CAST_ICON_MS after it goes off", () => {
    for (let ms = 1_000; ms < 3_000 + CAST_ICON_MS; ms += 50) {
      expect(deriveCastIcons(fx, ms, everyone, 12)).toMatchObject([{ caster: "mage", spellId: 116 }]);
    }
    expect(deriveCastIcons(fx, 3_000 + CAST_ICON_MS, everyone, 12)).toEqual([]);
    // The bolt lands while the icon is still up.
    expect(deriveCastIcons(fx, 3_600, everyone, 12)).toMatchObject([{ phase: "instant" }]);
  });

  it("drops the spell name for casters whose icon shows it", () => {
    expect(deriveCombatText(fx, 3_700, everyone, null, null, options, 8)).toMatchObject([{ target: "boss", text: "Frostbolt" }]);
    expect(deriveCombatText(fx, 3_700, everyone, null, new Set(["mage"]), options, 8)).toEqual([]);
    // Heal numbers are kept.
    const heals = effects(event(1_000, "heal", "mage", "tank", { spellName: "Heal", amount: 500 }));
    expect(deriveCombatText(heals, 1_100, everyone, new Set(["tank"]), new Set(["mage"]), options, 8)).toMatchObject([{ text: "+500" }]);
  });
});

describe("castIconGuidSet", () => {
  const players = ["p1", "p2", "p3"];
  const bosses = new Set(["boss"]);
  const big = Array.from({ length: 11 }, (_, i) => `r${i}`);

  it("shows everyone in a small group with nothing selected", () => {
    expect(effectiveCastIconGuids("selected", players, null, bosses)).toEqual(new Set(["p1", "p2", "p3", "boss"]));
  });
  it("shows only the selection plus bosses when players are selected", () => {
    expect(effectiveCastIconGuids("selected", players, new Set(["p2"]), bosses)).toEqual(new Set(["p2", "boss"]));
  });
  it("keeps selected + bosses only in groups over 10", () => {
    expect(effectiveCastIconGuids("selected", big, null, bosses)).toEqual(new Set(["boss"]));
    expect(effectiveCastIconGuids("selected", big, new Set(["r1"]), bosses)).toEqual(new Set(["r1", "boss"]));
  });
  it("treats exactly 10 players as small", () => {
    expect(effectiveCastIconGuids("selected", big.slice(0, 10), null, null)?.size).toBe(10);
  });
  it("All overrides group size and selection", () => {
    expect(effectiveCastIconGuids("all", big, new Set(["r1"]), bosses)?.size).toBe(12);
  });
  it("Off shows nothing", () => {
    expect(effectiveCastIconGuids("off", players, null, bosses)).toBeNull();
  });
});

describe("collectCastSpellIds", () => {
  const cast = (ms: number, kind: "cast_start" | "cast_go", source: string, spellId: number | null, spellName = "Spell") =>
    event(ms, kind, source, "t", { spellId, spellName });

  it("includes every caster, orders by first cast, dedupes, and drops basic attacks", () => {
    const ids = collectCastSpellIds([
      cast(500, "cast_go", "boss", 20),
      cast(100, "cast_start", "p1", 10),
      cast(200, "cast_go", "p2", 10),
      cast(300, "cast_go", "p1", 6603, "Auto Attack"),
      cast(400, "cast_go", "p1", null, ""),
      event(50, "damage", "p1", "t", { spellId: 30, spellName: "Dmg" }),
    ]);
    expect(ids).toEqual([10, 20]);
  });

  it("is independent of mode and selection (takes events only)", () => {
    expect(collectCastSpellIds([])).toEqual([]);
  });
});

describe("iconPreloadUrls", () => {
  it("keeps spell order, dedupes urls and skips excluded ones", () => {
    const urls = iconPreloadUrls([1, 2, 3, 4], (id) => (id === 3 ? "q" : id === 4 ? "a" : `i${id % 2}`), new Set(["q"]));
    expect(urls).toEqual(["i1", "i0", "a"]);
  });

  it("caps below the icon cache size", () => {
    const ids = Array.from({ length: 300 }, (_, i) => i + 1);
    const urls = iconPreloadUrls(ids, (id) => `u${id}`);
    expect(urls).toHaveLength(MAX_PRELOAD_ICONS);
    expect(MAX_PRELOAD_ICONS).toBeLessThanOrEqual(96);
    expect(urls[0]).toBe("u1");
  });
});
