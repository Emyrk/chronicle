import { describe, expect, it } from "vitest";
import { inferFloorTrack, inferredFloorAt, type FloorObservation } from "./floorInference";

const row = (timestampMs: number, unit: string, candidates: number[], floor?: number): FloorObservation => ({ timestampMs, unit, candidates, floor });
const options = { evidenceWindowMs: 1000, continuityMs: 5000 };

describe("floor inference", () => {
  it("ignores synthetic cached snapshots and resolves offline starts only with bounded fresh evidence", () => {
    const rows = [{ ...row(0, "a", [1]), synthetic: true }, row(500, "a", [2])];
    expect(inferFloorTrack(rows, options)[0].floor).toBeNull();
    expect(inferFloorTrack(rows, { ...options, lookaheadMs: 1000 })[0]).toMatchObject({ floor: 2, source: "lookahead" });
    expect(inferFloorTrack(rows, { ...options, lookaheadMs: 100 })[0].floor).toBeNull();
  });
  it("requires compatible party support and never smooths conflicting telemetry or gaps", () => {
    expect(inferFloorTrack([row(0, "a", [1]), row(0, "b", [1, 2])], options)[0].floor).toBe(1);
    const rows = [row(0, "a", [1, 2], 1), row(0, "b", [1, 2], 2), row(500, "a", [2])];
    expect(inferFloorTrack(rows, { ...options, lookaheadMs: 5000 })[0].floor).toBeNull();
    expect(inferFloorTrack([{ ...row(0, "a", [1]), synthetic: true }, row(4000, "a", [2])], { ...options, lookaheadMs: 5000 })[0].floor).toBeNull();
  });
  it("does not let future telemetry overwrite an earlier geometric estimate", () => {
    const track = inferFloorTrack([row(0, "a", [1]), row(500, "a", [2], 2)], { ...options, lookaheadMs: 5000 });
    expect(track.map(value => [value.floor, value.source])).toEqual([[1, "geometry"], [2, "telemetry"]]);
  });
  it("does not refresh a stale anchor with synthetic cached votes", () => {
    const track = inferFloorTrack([row(0, "a", [1]), { ...row(4000, "a", [1], 1), synthetic: true }, row(6000, "a", [1, 2])], options);
    expect(track.map(value => value.floor)).toEqual([1, null, null]);
  });
  it("prefers fresh evidence to synthetic same-time duplicates regardless of order", () => {
    const rows = [{ ...row(0, "a", [1], 1), synthetic: true }, row(0, "a", [2], 2)];
    expect(inferFloorTrack(rows, options)).toEqual(inferFloorTrack([...rows].reverse(), options));
    expect(inferFloorTrack(rows, options)[0]).toMatchObject({ floor: 2, source: "telemetry" });
  });
  it("keeps overlaps unknown until independent party evidence anchors them", () => {
    const track = inferFloorTrack([row(0, "a", [1, 2]), row(1000, "a", [2]), row(2000, "a", [1, 2])], options);
    expect(track.map(x => [x.floor, x.source])).toEqual([[null, "unknown"], [2, "geometry"], [2, "continuity"]]);
  });
  it("expires continuity across gaps and does not perpetually refresh ambiguous evidence", () => {
    const track = inferFloorTrack([row(0, "a", [2]), row(4000, "a", [1, 2]), row(6000, "a", [1, 2])], options);
    expect(track.map(x => x.floor)).toEqual([2, 2, null]);
    expect(inferredFloorAt(track, 5500, 1000)).toBeNull();
  });
  it("gives each unit one vote and never breaks ties by input order", () => {
    const rows = [row(0, "a", [1]), row(0, "b", [2]), row(0, "a", [1])];
    expect(inferFloorTrack(rows, options)[0].floor).toBeNull();
    expect(inferFloorTrack([...rows].reverse(), options)).toEqual(inferFloorTrack(rows, options));
  });
  it("honors explicit telemetry over geometry and preserves raw observations", () => {
    const rows = [row(0, "a", [1], 3), row(0, "b", [1])];
    const before = JSON.stringify(rows);
    expect(inferFloorTrack(rows, options)[0]).toMatchObject({ floor: 3, source: "telemetry" });
    expect(JSON.stringify(rows)).toBe(before);
  });
  it("supports backward and forward seeking with no mutable playback state", () => {
    const track = inferFloorTrack([row(0, "a", [1]), row(1000, "a", [2])], options);
    expect([1000, 0, 1000, -1].map(t => inferredFloorAt(track, t, 5000)?.floor ?? null)).toEqual([2, 1, 2, null]);
  });
  it("does not infer from missing coverage, conflicting duplicates, or nonfinite times", () => {
    expect(inferFloorTrack([row(0, "a", [1]), row(0, "a", [2])], options)[0].floor).toBeNull();
    expect(inferFloorTrack([row(0, "a", []), row(NaN, "a", [1])], options)[0].floor).toBeNull();
  });
});
