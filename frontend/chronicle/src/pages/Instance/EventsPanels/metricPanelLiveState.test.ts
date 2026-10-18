import { describe, expect, it } from "vitest";
import { parseMetricPanelLiveState, updateMetricPanelLiveState } from "./metricPanelLiveState";

describe("metric panel live state", () => {
  it("parses the durable focused entity and rank display state", () => {
    expect(parseMetricPanelLiveState("g:merged,f:player-1,noranks")).toEqual({
      focusedEntityId: "player-1",
      showRanks: false,
    });
    expect(parseMetricPanelLiveState(null)).toEqual({ focusedEntityId: null, showRanks: true });
  });

  it("updates live state without discarding unrelated panel options", () => {
    const focused = updateMetricPanelLiveState("g:name,p:owner", { focusedEntityId: "player-2" });
    expect(focused).toBe("g:name,p:owner,f:player-2");
    expect(updateMetricPanelLiveState(focused, { showRanks: false })).toBe("g:name,p:owner,f:player-2,noranks");
    expect(updateMetricPanelLiveState("f:player-2,noranks", {
      focusedEntityId: null,
      showRanks: true,
    })).toBeNull();
  });

  it("rejects oversized shared options instead of applying partial state", () => {
    expect(parseMetricPanelLiveState(`f:${"x".repeat(5000)},noranks`)).toEqual({
      focusedEntityId: null,
      showRanks: true,
    });
  });
});
