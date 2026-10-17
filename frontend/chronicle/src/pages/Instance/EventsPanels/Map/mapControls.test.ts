import { describe, expect, it } from "vitest";
import { keyLabel, MAP_CONTROL_ACTIONS, MAP_CONTROL_KEYBINDS } from "./mapControls";

describe("mapControls", () => {
  it("uses fixed WASD controls with Q/E rotate and R/F zoom", () => {
    expect(MAP_CONTROL_ACTIONS.map((action) => action.defaultKey)).toEqual([
      "KeyW", "KeyS", "KeyA", "KeyD", "KeyQ", "KeyE", "KeyR", "KeyF",
    ]);
    expect(MAP_CONTROL_KEYBINDS).toHaveLength(MAP_CONTROL_ACTIONS.length);
  });

  it("labels keys like a keyboard", () => {
    expect(keyLabel("KeyW")).toBe("W");
    expect(keyLabel("ArrowUp")).toBe("↑");
    expect(keyLabel("Numpad8")).toBe("Num 8");
    expect(keyLabel("Space")).toBe("Space");
  });
});
