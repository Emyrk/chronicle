import { describe, expect, it } from "vitest";
import { actionForKey, DEFAULT_AD_STRAFE, keyLabel, MAP_CONTROL_ACTIONS, MAP_CONTROL_KEYBINDS, WALK_TOGGLE_KEY } from "./mapControls";

describe("mapControls", () => {
  it("uses WoW-style keys", () => {
    expect(MAP_CONTROL_ACTIONS.map((action) => action.defaultKey)).toEqual([
      "KeyW", "KeyS", "KeyA", "KeyD", null, null, "Space", "KeyZ",
    ]);
    expect(WALK_TOGGLE_KEY).toBe("KeyG");
    expect(MAP_CONTROL_KEYBINDS.some((keybind) => keybind.keys === "G")).toBe(true);
  });

  it("turns with A/D by default", () => {
    expect(DEFAULT_AD_STRAFE).toBe(false);
    expect(actionForKey("KeyA", DEFAULT_AD_STRAFE)).toBe("turn_left");
    expect(actionForKey("KeyD", DEFAULT_AD_STRAFE)).toBe("turn_right");
  });

  it("uses A/D for turning or strafing and reserves Q/E for replay", () => {
    expect(["KeyA", "KeyD", "KeyQ", "KeyE", "KeyW"].map((code) => actionForKey(code, false)))
      .toEqual(["turn_left", "turn_right", undefined, undefined, "forward"]);
    expect(["KeyA", "KeyD", "KeyQ", "KeyE", "KeyW"].map((code) => actionForKey(code, true)))
      .toEqual(["strafe_left", "strafe_right", undefined, undefined, "forward"]);
    expect(actionForKey("KeyX", true)).toBeUndefined();
  });

  it("labels keys like a keyboard", () => {
    expect(keyLabel("KeyW")).toBe("W");
    expect(keyLabel("ArrowUp")).toBe("↑");
    expect(keyLabel("Numpad8")).toBe("Num 8");
    expect(keyLabel("Space")).toBe("Space");
  });
});
