import { describe, expect, it } from "vitest";
import type { TimelineCast } from "./rotationTimeline.processor";
import { clusterRailEvents, type RailEvent } from "./railClusters";

function ev(startMs: number, kind: RailEvent["kind"] = "proc"): RailEvent {
  return { kind, cast: { startMs, endMs: startMs, spellId: 1, spellName: "x" } as TimelineCast };
}

const sizes = (clusters: ReturnType<typeof clusterRailEvents>) => clusters.map((c) => c.events.length);

describe("clusterRailEvents", () => {
  it("groups events within a second of each other", () => {
    // Zoomed in far enough that nothing overlaps on screen.
    expect(sizes(clusterRailEvents([ev(0), ev(800), ev(1500), ev(5000)], 1, 20))).toEqual([3, 1]);
  });

  it("caps a time-based cluster at two seconds from its start", () => {
    expect(sizes(clusterRailEvents([ev(0), ev(900), ev(1800), ev(2700)], 1, 20))).toEqual([3, 1]);
  });

  it("groups events that would overlap on screen when zoomed out", () => {
    // 0.01 px/ms: 5s apart is 50px, closer than a 2-icon stack (20 + 10 + 20 + 4 = 54px).
    expect(sizes(clusterRailEvents([ev(0, "cd"), ev(5000)], 0.01, 20))).toEqual([2]);
  });

  it("keeps distant events apart", () => {
    const clusters = clusterRailEvents([ev(0), ev(10_000)], 0.05, 20);
    expect(sizes(clusters)).toEqual([1, 1]);
    expect(clusters[1]).toMatchObject({ startMs: 10_000, endMs: 10_000 });
  });
});
