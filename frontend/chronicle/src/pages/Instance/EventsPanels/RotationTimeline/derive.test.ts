import { describe, expect, it } from "vitest";
import type { PlayerTimelineData, TimelineCast } from "./rotationTimeline.processor";
import {
  alignOffsetMs,
  busySegments,
  castKind,
  withConsumeCasts,
  withOverrideBuffCasts,
  nearbyActivity,
  castAt,
  castEndMs,
  castEnds,
  castSlotEnd,
  damageLead,
  dpsSeries,
  idleGaps,
  playerCasts,
  type GcdLookup,
} from "./derive";

function cast(startMs: number, spellId = 1, extra: Partial<TimelineCast> = {}): TimelineCast {
  return {
    source: "spell_go",
    startMs,
    endMs: startMs,
    spellId,
    spellName: `spell ${spellId}`,
    target: "",
    castTimeMs: null,
    channelTimeMs: null,
    channel: false,
    tickMs: [],
    failed: false,
    itemId: null,
    damage: 0,
    periodicDamage: 0,
    hits: 0,
    crits: 0,
    healing: 0,
    overheal: 0,
    healCrits: 0,
    ...extra,
  };
}

function player(extra: Partial<PlayerTimelineData> = {}): PlayerTimelineData {
  return {
    guid: "p",
    goCasts: [],
    textCasts: [],
    swings: [],
    damageBins: [],
    totalDamage: 0,
    healBins: [],
    totalHealing: 0,
    totalOverheal: 0,
    aurasOn: [],
    debuffsCast: [],
    damageByTarget: {},
    consumes: [],
    ...extra,
  };
}

const gcd15: GcdLookup = () => 1500;

describe("playerCasts", () => {
  it("prefers spell_go casts over text casts", () => {
    const p = player({ goCasts: [cast(2000, 2)], textCasts: [cast(1000, 1)] });
    expect(playerCasts(p).map((c) => c.spellId)).toEqual([2]);
  });

  it("falls back to text casts, sorted by start", () => {
    const p = player({ textCasts: [cast(3000), cast(1000)] });
    expect(playerCasts(p).map((c) => c.startMs)).toEqual([1000, 3000]);
  });
});

describe("castSlotEnd", () => {
  it("uses the GCD for instants", () => {
    expect(castSlotEnd(cast(1000), gcd15)).toBe(2500);
  });

  it("uses the cast time when longer than the GCD", () => {
    expect(castSlotEnd(cast(1000, 1, { endMs: 4000 }), gcd15)).toBe(4000);
  });

  it("uses the channel time", () => {
    expect(castSlotEnd(cast(1000, 1, { channel: true, channelTimeMs: 8000 }), gcd15)).toBe(9000);
  });
});

describe("castEndMs", () => {
  it("ends a channel at its last tick when cut short", () => {
    expect(castEndMs(cast(1000, 1, { channel: true, channelTimeMs: 15000, tickMs: [4000, 7000] }))).toBe(7000);
  });

  it("ignores ticks after the planned channel end", () => {
    expect(castEndMs(cast(0, 1, { channel: true, channelTimeMs: 3000, tickMs: [1000, 2000, 3000, 9000] }))).toBe(3000);
  });

  it("falls back to the planned length without ticks", () => {
    expect(castEndMs(cast(0, 1, { channel: true, channelTimeMs: 5000 }))).toBe(5000);
  });

  it("uses ticks for text-log channels with no logged duration", () => {
    expect(castEndMs(cast(0, 1, { channel: true, tickMs: [1000, 2000, 3000] }))).toBe(3000);
  });

  it("cuts a channel short at the next interrupting cast", () => {
    expect(castEndMs(cast(0, 1, { channel: true, channelTimeMs: 5000 }), 3800)).toBe(3800);
  });

  it("ends a cast when the spell went off and ignores DoT ticks", () => {
    expect(castEndMs(cast(0, 1, { endMs: 2500, tickMs: [5000, 8000] }))).toBe(2500);
  });
});

describe("castEnds", () => {
  it("clamps overlapping channels to the next GCD cast but not to off-GCD spells", () => {
    const gcd: GcdLookup = (id) => (id === 99 ? 0 : 1500);
    const a = cast(0, 1, { channel: true, channelTimeMs: 5000 });
    const trinket = cast(1000, 99);
    const b = cast(3800, 1, { channel: true, channelTimeMs: 5000 });
    const ends = castEnds([a, trinket, b], gcd);
    expect(ends.get(a)).toBe(3800);
    expect(ends.get(b)).toBe(8800);
  });
});

describe("idleGaps", () => {
  it("finds gaps at or above the threshold", () => {
    const casts = [cast(0), cast(1500), cast(3400), cast(5000)];
    // 0→1.5 busy, 1.5→3.0 busy, gap 3.0→3.4 (400ms), 3.4→4.9 busy, gap 4.9→5.0 (100ms, below)
    expect(idleGaps(casts, gcd15, 400)).toEqual([{ startMs: 3000, endMs: 3400 }]);
  });

  it("does not let an off-GCD spell end the busy window early", () => {
    const gcd: GcdLookup = (id) => (id === 99 ? 0 : 1500);
    const casts = [cast(0), cast(200, 99), cast(2500)];
    expect(idleGaps(casts, gcd, 400)).toEqual([{ startMs: 1500, endMs: 2500 }]);
  });

  it("ignores failed casts", () => {
    const casts = [cast(0), cast(1500, 1, { failed: true }), cast(3000)];
    expect(idleGaps(casts, gcd15, 400)).toEqual([{ startMs: 1500, endMs: 3000 }]);
  });
});

describe("dpsSeries", () => {
  it("averages over the trailing window", () => {
    expect(dpsSeries([100, 300, 0, 0], 4, 2)).toEqual([100, 200, 150, 0]);
  });

  it("pads to the requested length", () => {
    expect(dpsSeries([], 2, 5)).toEqual([0, 0]);
  });
});

describe("damageLead", () => {
  it("accumulates A minus B", () => {
    expect(damageLead([10, 10, 0], [0, 30, 0], 3)).toEqual([10, -10, -10]);
  });
});

describe("alignOffsetMs", () => {
  const casts = [cast(500, 1, { failed: true }), cast(800, 7), cast(1200, 2)];

  it("is zero when aligned to pull", () => {
    expect(alignOffsetMs(casts, "pull")).toBe(0);
  });

  it("skips failed and ignored casts", () => {
    expect(alignOffsetMs(casts, "first_cast", (name) => name === "spell 7")).toBe(1200);
  });
});

describe("castAt", () => {
  it("returns the cast covering the time, or null when idle", () => {
    const casts = [cast(0, 1), cast(4000, 2)];
    expect(castAt(casts, 1000, gcd15)?.spellId).toBe(1);
    expect(castAt(casts, 2000, gcd15)).toBeNull();
    expect(castAt(casts, 4100, gcd15)?.spellId).toBe(2);
  });
});

describe("busySegments", () => {
  it("merges slots across gaps shorter than the threshold", () => {
    const casts = [cast(0), cast(1500), cast(3400), cast(5000)];
    // gap 3.0→3.4 is exactly the threshold, so it splits; 4.9→5.0 merges
    expect(busySegments(casts, gcd15, 400)).toEqual([
      { startMs: 0, endMs: 3000 },
      { startMs: 3400, endMs: 6500 },
    ]);
  });
});

describe("nearbyActivity", () => {
  const casts = [cast(0), cast(1500), cast(5000)];

  it("is busy while a cast's GCD is running", () => {
    expect(nearbyActivity(casts, 2000, gcd15)).toMatchObject({ sinceLastMs: 500, untilNextMs: 3000, idleMs: 0 });
  });

  it("counts idle time after the last slot ends", () => {
    expect(nearbyActivity(casts, 4000, gcd15)).toEqual({
      sinceLastMs: 2500,
      untilNextMs: 1000,
      idleMs: 1000,
      lastMs: 1500,
      nextMs: 5000,
      busyUntilMs: 3000,
    });
  });

  it("has no last action before the first cast", () => {
    expect(nearbyActivity(casts, -500, gcd15)).toMatchObject({ sinceLastMs: null, untilNextMs: 500, idleMs: 0, lastMs: null });
  });

  it("treats pauses shorter than the idle threshold as busy when given the gaps", () => {
    // Slot ends at 3000, next cast at 3300: a 300ms pause, under the 400ms threshold.
    const tight = [cast(0), cast(1500), cast(3300)];
    const gaps = idleGaps(tight, gcd15, 400);
    expect(nearbyActivity(tight, 3200, gcd15).idleMs).toBe(200);
    expect(nearbyActivity(tight, 3200, gcd15, gaps).idleMs).toBe(0);
  });

  it("reports idle inside a real gap when given the gaps", () => {
    const gaps = idleGaps(casts, gcd15, 400);
    expect(nearbyActivity(casts, 4000, gcd15, gaps)).toMatchObject({ idleMs: 1000, busyUntilMs: 3000 });
  });

  it("has no next action after the last cast", () => {
    expect(nearbyActivity(casts, 9000, gcd15).untilNextMs).toBeNull();
  });
});

describe("withOverrideBuffCasts", () => {
  const overrides = [{ id: "e", names: ["Nature Eclipse"], showAsCooldown: {}, note: "" }];
  const buff = (startMs: number, endMs: number | null) => ({
    spellId: 51442,
    spellName: "Nature Eclipse",
    isBuff: true,
    caster: null,
    target: "p",
    startMs,
    endMs,
    maxStacks: 1,
  });

  it("turns each buff into a cast that ends when the buff faded", () => {
    const data = player({ goCasts: [cast(0, 9)], aurasOn: [buff(1000, 9000), buff(20_000, null)] });
    const out = withOverrideBuffCasts(data, overrides, 30_000);
    const added = out.goCasts.filter((c) => c.spellName === "Nature Eclipse");
    expect(added.map((c) => [c.startMs, c.buffEndMs])).toEqual([
      [1000, 9000],
      [20_000, 30_000],
    ]);
  });

  it("leaves data alone when the spell was cast", () => {
    const data = player({ goCasts: [cast(500, 51442, { spellName: "Nature Eclipse" })], aurasOn: [buff(500, 15_500)] });
    expect(withOverrideBuffCasts(data, overrides, 30_000)).toBe(data);
  });
});

describe("withConsumeCasts", () => {
  const potion = { offsetMs: 5000, consumeId: "c1", itemId: 13444, itemName: "Major Mana Potion", spellId: 17531, spellName: "Restore Mana" };

  it("adds consumes as consume casts and drops the matching item cast", () => {
    const data = player({ goCasts: [cast(1000, 1), cast(5200, 17531)], consumes: [potion] });
    const out = withConsumeCasts(data);
    expect(out.goCasts.map((c) => [c.startMs, c.spellName])).toEqual([
      [1000, "spell 1"],
      [5000, "Major Mana Potion"],
    ]);
    const consumeCast = out.goCasts[1];
    expect(castKind(consumeCast, () => 0, () => null)).toBe("consume");
  });

  it("takes the tint duration from the buff the consumable applied", () => {
    const buff = { spellId: 17531, spellName: "Restore Mana", isBuff: true, caster: null, target: "p", startMs: 5100, endMs: 17_100, maxStacks: 1 };
    const out = withConsumeCasts(player({ consumes: [potion], aurasOn: [buff] }));
    expect(out.textCasts[0].buffEndMs).toBe(17_100);
  });

  it("returns the data unchanged without consumes", () => {
    const data = player({ goCasts: [cast(0)] });
    expect(withConsumeCasts(data)).toBe(data);
  });
});
