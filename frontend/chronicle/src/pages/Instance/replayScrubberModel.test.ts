import { describe, expect, it } from "vitest";
import {
  deathMarkers,
  fractionAt,
  markerPercent,
  pointerFraction,
  REPLAY_SPEEDS,
  scrubAria,
  scrubDrag,
  scrubKeyTarget,
  timeAtFraction,
} from "./replayScrubberModel";

const bounds = { startMs: 10_000, endMs: 70_000 };
const rect = { left: 100, width: 600 };

describe("speed list", () => {
  it("offers the page Replay's speeds", () => {
    expect(REPLAY_SPEEDS).toEqual([0.25, 0.5, 1, 2, 4]);
  });
});

describe("time and track position", () => {
  it("maps time to a fraction at and between the bounds", () => {
    expect(fractionAt(10_000, bounds)).toBe(0);
    expect(fractionAt(40_000, bounds)).toBe(0.5);
    expect(fractionAt(70_000, bounds)).toBe(1);
  });

  it("clamps times outside the bounds, and reads 0 without a time, bounds or span", () => {
    expect(fractionAt(0, bounds)).toBe(0);
    expect(fractionAt(99_000, bounds)).toBe(1);
    expect(fractionAt(null, bounds)).toBe(0);
    expect(fractionAt(40_000, null)).toBe(0);
    expect(fractionAt(5_000, { startMs: 5_000, endMs: 5_000 })).toBe(0);
  });

  it("maps a fraction back to time, clamped to the bounds", () => {
    expect(timeAtFraction(0, bounds)).toBe(10_000);
    expect(timeAtFraction(0.25, bounds)).toBe(25_000);
    expect(timeAtFraction(1, bounds)).toBe(70_000);
    expect(timeAtFraction(-1, bounds)).toBe(10_000);
    expect(timeAtFraction(2, bounds)).toBe(70_000);
  });

  it("reads the pointer's fraction, holding the ends past either side", () => {
    expect(pointerFraction(100, rect)).toBe(0);
    expect(pointerFraction(400, rect)).toBe(0.5);
    expect(pointerFraction(20, rect)).toBe(0);
    expect(pointerFraction(900, rect)).toBe(1);
    expect(pointerFraction(400, { left: 100, width: 0 })).toBe(0);
  });
});

describe("pointer drag", () => {
  it("seeks on press, follows the pointer outside the track, and ends at release", () => {
    let state = scrubDrag(false, { type: "down", button: 0, clientX: 250, rect });
    expect(state).toEqual({ dragging: true, scrub: { phase: "start", fraction: 0.25 } });
    state = scrubDrag(state.dragging, { type: "move", clientX: 1_000, rect });
    expect(state).toEqual({ dragging: true, scrub: { phase: "move", fraction: 1 } });
    state = scrubDrag(state.dragging, { type: "move", clientX: -50, rect });
    expect(state.scrub).toEqual({ phase: "move", fraction: 0 });
    state = scrubDrag(state.dragging, { type: "up", clientX: 400, rect });
    expect(state).toEqual({ dragging: false, scrub: { phase: "end", fraction: 0.5 } });
  });

  it("ignores moves and releases without a press, other buttons and a disabled track", () => {
    expect(scrubDrag(false, { type: "move", clientX: 400, rect })).toEqual({ dragging: false, scrub: null });
    expect(scrubDrag(false, { type: "up", clientX: 400, rect })).toEqual({ dragging: false, scrub: null });
    expect(scrubDrag(false, { type: "down", button: 2, clientX: 400, rect })).toEqual({ dragging: false, scrub: null });
    expect(scrubDrag(false, { type: "down", button: 0, clientX: 400, rect }, true)).toEqual({ dragging: false, scrub: null });
  });

  it("cancel ends the drag without a seek", () => {
    expect(scrubDrag(true, { type: "cancel" })).toEqual({ dragging: false, scrub: null });
  });
});

describe("keyboard", () => {
  const options = { stepMs: 5_000, pageFraction: 0.1 };

  it("steps with the arrows, clamped to the bounds", () => {
    expect(scrubKeyTarget("ArrowRight", 40_000, bounds, options)).toBe(45_000);
    expect(scrubKeyTarget("ArrowUp", 40_000, bounds, options)).toBe(45_000);
    expect(scrubKeyTarget("ArrowLeft", 40_000, bounds, options)).toBe(35_000);
    expect(scrubKeyTarget("ArrowDown", 40_000, bounds, options)).toBe(35_000);
    expect(scrubKeyTarget("ArrowLeft", 12_000, bounds, options)).toBe(10_000);
    expect(scrubKeyTarget("ArrowRight", 68_000, bounds, options)).toBe(70_000);
  });

  it("goes to the ends with Home and End, and pages a tenth with Page Up and Down", () => {
    expect(scrubKeyTarget("Home", 40_000, bounds, options)).toBe(10_000);
    expect(scrubKeyTarget("End", 40_000, bounds, options)).toBe(70_000);
    expect(scrubKeyTarget("PageUp", 40_000, bounds, options)).toBe(46_000);
    expect(scrubKeyTarget("PageDown", 40_000, bounds, options)).toBe(34_000);
  });

  it("ignores other keys, and the keys a host leaves out (the landing: Left and Right only)", () => {
    expect(scrubKeyTarget("a", 40_000, bounds, options)).toBeNull();
    const landing = { stepMs: 5_000, homeEnd: false, vertical: false };
    expect(scrubKeyTarget("Home", 40_000, bounds, landing)).toBeNull();
    expect(scrubKeyTarget("ArrowUp", 40_000, bounds, landing)).toBeNull();
    expect(scrubKeyTarget("PageUp", 40_000, bounds, landing)).toBeNull();
    expect(scrubKeyTarget("ArrowRight", 40_000, bounds, landing)).toBe(45_000);
  });
});

describe("ARIA values", () => {
  it("reports a percentage (the mini map)", () => {
    expect(scrubAria(25_000, bounds, "percent")).toEqual({ valueMin: 0, valueMax: 100, valueNow: 25 });
  });

  it("reports elapsed whole seconds, rounded (the strip) or floored (the landing)", () => {
    expect(scrubAria(41_600, bounds, "seconds")).toEqual({ valueMin: 0, valueMax: 60, valueNow: 32 });
    expect(scrubAria(41_600, bounds, "seconds", Math.floor)).toEqual({ valueMin: 0, valueMax: 60, valueNow: 31 });
    expect(scrubAria(null, null, "seconds")).toEqual({ valueMin: 0, valueMax: 0, valueNow: 0 });
  });
});

describe("marker placement", () => {
  const deaths = [{ at: 25_000, who: "a" }, { at: 5_000, who: "early" }, { at: 70_000, who: "end" }, { at: 99_000, who: "late" }];

  it("places markers along the track", () => {
    expect(markerPercent(25_000, bounds)).toBe(25);
    expect(markerPercent(5_000, bounds)).toBeCloseTo(-8.333, 3);
    expect(markerPercent(5_000, { startMs: 5_000, endMs: 5_000 })).toBe(0);
  });

  it("drops deaths outside the bounds (ends included), in the given order, dimming those after the cursor", () => {
    expect(deathMarkers(deaths, (death) => death.at, bounds, { outside: "drop", cursorMs: 40_000 })).toEqual([
      { death: deaths[0], atMs: 25_000, left: 25, past: true },
      { death: deaths[2], atMs: 70_000, left: 100, past: false },
    ]);
  });

  it("pins deaths outside the bounds to the nearer end (the landing)", () => {
    expect(deathMarkers(deaths, (death) => death.at, bounds, { outside: "clamp" }).map((marker) => marker.left)).toEqual([25, 0, 100, 100]);
  });

  it("counts every death as past without a cursor, and drops all for an empty span", () => {
    expect(deathMarkers(deaths, (death) => death.at, bounds, { outside: "drop" }).every((marker) => marker.past)).toBe(true);
    expect(deathMarkers(deaths, (death) => death.at, { startMs: 25_000, endMs: 25_000 }, { outside: "drop" })).toEqual([]);
  });
});
