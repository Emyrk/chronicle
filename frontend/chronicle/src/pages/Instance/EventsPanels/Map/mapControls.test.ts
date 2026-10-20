import { describe, expect, it } from "vitest";
import { actionForKey, DEFAULT_AD_STRAFE, easeAngleToward, keyLabel, MAP_CONTROL_ACTIONS, MAP_CONTROL_KEYBINDS, rightDragWalkAxes, setWalkMouseButton, shouldFollowWalkCamera, walkMovementYaw, walkMouseControl, WALK_TOGGLE_KEY } from "./mapControls";

describe("easeAngleToward", () => {
  it("eases toward the target without snapping", () => {
    const next = easeAngleToward(Math.PI / 2, 0, 1.5, 1 / 60);
    expect(next).toBeLessThan(Math.PI / 2);
    expect(next).toBeGreaterThan(0);
  });

  it("takes the shortest path across the angle wrap", () => {
    const current = Math.PI - 0.1;
    const target = -Math.PI + 0.1;
    expect(easeAngleToward(current, target, 1.5, 1 / 60)).toBeGreaterThan(current);
  });

  it("is stable without elapsed time", () => {
    expect(easeAngleToward(1, 2, 1.5, 0)).toBe(1);
  });
});

describe("setWalkMouseButton", () => {
  it("recognizes RMB pressed after movement has already started", () => {
    const buttons = setWalkMouseButton(0, 2, true);
    expect(walkMouseControl(buttons).steering).toBe(true);
  });

  it("preserves either button regardless of press and release order", () => {
    const both = setWalkMouseButton(setWalkMouseButton(0, 0, true), 2, true);
    expect(both).toBe(3);
    expect(setWalkMouseButton(both, 0, false)).toBe(2);
    expect(setWalkMouseButton(both, 2, false)).toBe(1);
  });
});

describe("walkMouseControl", () => {
  it("free-looks with left mouse only", () => {
    expect(walkMouseControl(1)).toEqual({ looking: true, steering: false, movingForward: false });
  });

  it("steers character and camera with right mouse only", () => {
    expect(walkMouseControl(2)).toEqual({ looking: true, steering: true, movingForward: false });
  });

  it("steers and runs forward while both mouse buttons are held", () => {
    expect(walkMouseControl(3)).toEqual({ looking: true, steering: true, movingForward: true });
  });

  it("does nothing without a mouse button", () => {
    expect(walkMouseControl(0)).toEqual({ looking: false, steering: false, movingForward: false });
  });
});

describe("rightDragWalkAxes", () => {
  it("changes left and right keyboard turns into matching strafes", () => {
    expect(rightDragWalkAxes(1, 0, true)).toEqual({ turn: 0, strafe: -1 });
    expect(rightDragWalkAxes(-1, 0, true)).toEqual({ turn: 0, strafe: 1 });
  });

  it("leaves turn controls alone without right-click", () => {
    expect(rightDragWalkAxes(1, 0, false)).toEqual({ turn: 1, strafe: 0 });
  });

  it("clamps combined strafe input to one movement axis", () => {
    expect(rightDragWalkAxes(1, -1, true)).toEqual({ turn: 0, strafe: -1 });
  });
});

describe("walkMovementYaw", () => {
  it("uses the camera direction while right-click is held", () => {
    expect(walkMovementYaw(0, Math.PI / 2, true)).toBe(Math.PI / 2);
  });

  it("keeps the character direction without right-click", () => {
    expect(walkMovementYaw(0, Math.PI / 2, false)).toBe(0);
  });
});

describe("shouldFollowWalkCamera", () => {
  it.each([
    ["forward", 1, 0, 0],
    ["backpedaling", -1, 0, 0],
    ["strafing", 0, 1, 0],
    ["diagonal movement", 1, -1, 0],
    ["keyboard turning", 0, 0, 1],
  ])("follows during %s", (_label, forward, strafe, turn) => {
    expect(shouldFollowWalkCamera(forward, strafe, turn, false)).toBe(true);
  });

  it("stays put without movement or while the user is dragging the camera", () => {
    expect(shouldFollowWalkCamera(0, 0, 0, false)).toBe(false);
    expect(shouldFollowWalkCamera(1, 1, 1, true)).toBe(false);
  });
});
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
