import { describe, expect, it } from "vitest";
import type { PlayerTimelineData, TimelineCast } from "./rotationTimeline.processor";
import {
  alignOffsetMs,
  busySegments,
  castAt,
  castSlotEnd,
  damageLead,
  dpsSeries,
  idleGaps,
  playerCasts,
  type GcdLookup,
} from "./derive";

function cast(startMs: number, spellId = 1, extra: Partial<TimelineCast> = {}): TimelineCast {
  return {
    startMs,
    endMs: startMs,
    spellId,
    spellName: `spell ${spellId}`,
    target: "",
    castTimeMs: null,
    channelTimeMs: null,
    failed: false,
    itemId: null,
    damage: 0,
    periodicDamage: 0,
    hits: 0,
    crits: 0,
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
    aurasOn: [],
    debuffsCast: [],
    damageByTarget: {},
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
    expect(castSlotEnd(cast(1000, 1, { channelTimeMs: 8000 }), gcd15)).toBe(9000);
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
