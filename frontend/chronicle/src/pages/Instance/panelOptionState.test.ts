import { describe, expect, it } from "vitest";
import { updatePanelOptionState } from "./panelOptionState";

describe("updatePanelOptionState", () => {
  it("preserves state identity when a panel reports an unchanged option", () => {
    const state = { panelOptions: ["timeline-state", null], panels: ["player_timeline", "raid_frames"] };

    expect(updatePanelOptionState(state, 0, "timeline-state")).toBe(state);
    expect(updatePanelOptionState(state, 1, null)).toBe(state);
  });

  it("treats an absent option as null without extending the array", () => {
    const state = { panelOptions: [] as Array<string | null> };

    expect(updatePanelOptionState(state, 3, null)).toBe(state);
    expect(state.panelOptions).toEqual([]);
  });

  it("persists genuine changes without mutating previous state or unrelated fields", () => {
    const panels = ["player_timeline", "raid_frames"];
    const state = { panelOptions: ["old", "values"], panels };
    const next = updatePanelOptionState(state, 0, "new");

    expect(next).not.toBe(state);
    expect(next.panelOptions).toEqual(["new", "values"]);
    expect(next.panels).toBe(panels);
    expect(state.panelOptions).toEqual(["old", "values"]);
    expect(updatePanelOptionState(next, 0, "new")).toBe(next);
  });

  it("clears an option and settles subsequent empty reports", () => {
    const state = { panelOptions: ["old"] as Array<string | null> };
    const next = updatePanelOptionState(state, 0, null);

    expect(next.panelOptions).toEqual([null]);
    expect(updatePanelOptionState(next, 0, null)).toBe(next);
  });

  it("pads missing slots when storing a new option", () => {
    const state = { panelOptions: ["first"] };
    const next = updatePanelOptionState(state, 3, "last");

    expect(next.panelOptions).toEqual(["first", null, null, "last"]);
    expect(state.panelOptions).toEqual(["first"]);
    expect(updatePanelOptionState(next, 3, "last")).toBe(next);
  });
});
