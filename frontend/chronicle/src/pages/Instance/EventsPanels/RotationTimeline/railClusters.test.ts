import { describe, expect, it } from "vitest";
import type { TimelineCast } from "./rotationTimeline.processor";
import { clusterRailEvents, type RailEvent } from "./railClusters";

function ev(startMs: number, kind: RailEvent["kind"] = "proc"): RailEvent {
  return { kind, cast: { startMs, endMs: startMs, spellId: 1, spellName: "x" } as TimelineCast };
}

const sizes = (clusters: ReturnType<typeof clusterRailEvents>) => clusters.map((c) => c.events.length);

describe("clusterRailEvents", () => {
  it("keeps events apart when zoomed in enough for each icon", () => {
    // 1 px/ms: 800ms apart is 800px.
    expect(sizes(clusterRailEvents([ev(0), ev(800), ev(1500), ev(5000)], 1, 20))).toEqual([1, 1, 1, 1]);
  });

  it("groups events that would overlap on screen when zoomed out", () => {
    // 0.01 px/ms: 3s apart is 30px, closer than a 2-icon stack (20 + 10 + 4 = 34px).
    expect(sizes(clusterRailEvents([ev(0, "cd"), ev(3000)], 0.01, 20))).toEqual([2]);
  });

  it("keeps distant events apart", () => {
    const clusters = clusterRailEvents([ev(0), ev(10_000)], 0.05, 20);
    expect(sizes(clusters)).toEqual([1, 1]);
    expect(clusters[1]).toMatchObject({ startMs: 10_000, endMs: 10_000 });
  });
});
