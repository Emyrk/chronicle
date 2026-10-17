import { describe, expect, it } from "vitest";
import { keyLabel, MAP_CONTROL_ACTIONS, MAP_CONTROL_KEYBINDS, WALK_TOGGLE_KEY } from "./mapControls";

describe("mapControls", () => {
  it("uses WoW-style keys", () => {
    expect(MAP_CONTROL_ACTIONS.map((action) => action.defaultKey)).toEqual([
      "KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "Space", "KeyX",
    ]);
    expect(WALK_TOGGLE_KEY).toBe("KeyG");
    expect(MAP_CONTROL_KEYBINDS.some((keybind) => keybind.keys === "G")).toBe(true);
  });

  it("labels keys like a keyboard", () => {
    expect(keyLabel("KeyW")).toBe("W");
    expect(keyLabel("ArrowUp")).toBe("↑");
    expect(keyLabel("Numpad8")).toBe("Num 8");
    expect(keyLabel("Space")).toBe("Space");
  });
});
