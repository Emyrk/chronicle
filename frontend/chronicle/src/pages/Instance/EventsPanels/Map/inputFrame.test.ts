import { describe, expect, it } from "vitest";
import { MOBILE_STICK_DEAD_ZONE, UNIT_CLICK_SLOP_PX } from "./controlProfile";
import { buildInputFrame, MapInputState, MouseDrag } from "./inputFrame";
import { IDLE_MOBILE_MAP_INPUT, mobileJoystickAxis, walkDragButton, type MapControlAction, type MobileMapInput } from "./mapControls";

const keys = (...actions: MapControlAction[]) => new Set<MapControlAction>(actions);
const pad = (input: Partial<MobileMapInput>): MobileMapInput => ({ ...IDLE_MOBILE_MAP_INPUT, ...input });

function drag(buttons: number[], engaged = true): MouseDrag {
  const result = new MouseDrag();
  for (const button of buttons) result.press(button, 0, 0);
  result.engaged = engaged;
  return result;
}

describe("InputFrame: keys", () => {
  it("W/S drive forward, A/D turn (+ is left), Space/Z the vertical", () => {
    expect(buildInputFrame(keys("forward"), false, IDLE_MOBILE_MAP_INPUT, null)).toMatchObject({ forward: 1, strafe: 0, turn: 0, vertical: 0, active: true });
    expect(buildInputFrame(keys("back"), false, IDLE_MOBILE_MAP_INPUT, null).forward).toBe(-1);
    expect(buildInputFrame(keys("turn_left"), false, IDLE_MOBILE_MAP_INPUT, null).turn).toBe(1);
    expect(buildInputFrame(keys("turn_right"), false, IDLE_MOBILE_MAP_INPUT, null).turn).toBe(-1);
    expect(buildInputFrame(keys("up"), false, IDLE_MOBILE_MAP_INPUT, null)).toMatchObject({ vertical: 1, jump: true, descend: false });
    expect(buildInputFrame(keys("down"), false, IDLE_MOBILE_MAP_INPUT, null)).toMatchObject({ vertical: -1, jump: false, descend: true });
  });

  it("opposite keys cancel; strafe keys strafe (+ is right)", () => {
    expect(buildInputFrame(keys("forward", "back"), false, IDLE_MOBILE_MAP_INPUT, null).forward).toBe(0);
    expect(buildInputFrame(keys("strafe_right"), false, IDLE_MOBILE_MAP_INPUT, null)).toMatchObject({ strafe: 1, turn: 0 });
    expect(buildInputFrame(keys("strafe_left"), false, IDLE_MOBILE_MAP_INPUT, null).strafe).toBe(-1);
  });

  it("Shift is the fast modifier", () => {
    expect(buildInputFrame(keys("forward"), true, IDLE_MOBILE_MAP_INPUT, null).fast).toBe(true);
  });
});

describe("InputFrame: mouse", () => {
  it("left-drag looks; right-drag looks and steers; both buttons move forward", () => {
    expect(buildInputFrame(keys(), false, IDLE_MOBILE_MAP_INPUT, drag([0]))).toMatchObject({ looking: true, steering: false, movingForward: false, forward: 0, dragging: true });
    expect(buildInputFrame(keys(), false, IDLE_MOBILE_MAP_INPUT, drag([2]))).toMatchObject({ looking: true, steering: true, movingForward: false });
    expect(buildInputFrame(keys(), false, IDLE_MOBILE_MAP_INPUT, drag([0, 2]))).toMatchObject({ looking: true, steering: true, movingForward: true, forward: 1, active: true });
  });

  it("both buttons and W together still move forward at full speed, no faster", () => {
    expect(buildInputFrame(keys("forward"), false, IDLE_MOBILE_MAP_INPUT, drag([0, 2])).forward).toBe(1);
  });

  it("a drag that has not engaged yet (the free cam's click slop) gives no buttons, but is held", () => {
    expect(buildInputFrame(keys(), false, IDLE_MOBILE_MAP_INPUT, drag([0, 2], false))).toMatchObject({ looking: false, steering: false, movingForward: false, forward: 0, dragging: true });
  });

  it("right-drag turns A/D into the matching strafe, whatever the A/D setting", () => {
    expect(buildInputFrame(keys("turn_left"), false, IDLE_MOBILE_MAP_INPUT, drag([2]))).toMatchObject({ turn: 0, strafe: -1 });
    expect(buildInputFrame(keys("turn_right"), false, IDLE_MOBILE_MAP_INPUT, drag([2]))).toMatchObject({ turn: 0, strafe: 1 });
    // A left-drag keeps A/D turning.
    expect(buildInputFrame(keys("turn_left"), false, IDLE_MOBILE_MAP_INPUT, drag([0]))).toMatchObject({ turn: 1, strafe: 0 });
  });

  it("a touch drags as a right-drag: it steers", () => {
    expect(walkDragButton("touch", 0)).toBe(2);
    expect(buildInputFrame(keys(), false, IDLE_MOBILE_MAP_INPUT, drag([walkDragButton("touch", 0)]))).toMatchObject({ looking: true, steering: true, movingForward: false });
  });
});

describe("InputFrame: the mobile pad and stick", () => {
  it("the pad moves; the stick turns (right is clockwise) and pitches; the button jumps", () => {
    expect(buildInputFrame(keys(), false, pad({ forward: 1, strafe: -1 }), null)).toMatchObject({ forward: 1, strafe: -1 });
    expect(buildInputFrame(keys(), false, pad({ turn: 0.5 }), null).turn).toBe(-0.5);
    expect(buildInputFrame(keys(), false, pad({ pitch: 0.25 }), null).pitch).toBe(0.25);
    expect(buildInputFrame(keys(), false, pad({ jump: true }), null)).toMatchObject({ jump: true, vertical: 1 });
  });

  it("keys and the pad add up, clamped to -1…1", () => {
    expect(buildInputFrame(keys("forward"), false, pad({ forward: 1 }), null).forward).toBe(1);
    expect(buildInputFrame(keys("turn_right"), false, pad({ turn: 1 }), null).turn).toBe(-1);
    expect(buildInputFrame(keys("up"), false, pad({ jump: true }), null).vertical).toBe(1);
    expect(buildInputFrame(keys("down"), false, pad({ jump: true }), null).vertical).toBe(0);
  });

  it("the stick's dead zone (from the control profile) reads as no input", () => {
    expect(mobileJoystickAxis(MOBILE_STICK_DEAD_ZONE)).toBe(0);
    expect(mobileJoystickAxis(-MOBILE_STICK_DEAD_ZONE / 2)).toBe(0);
    expect(mobileJoystickAxis(1)).toBe(1);
    expect(buildInputFrame(keys(), false, pad({ turn: mobileJoystickAxis(0.1), pitch: mobileJoystickAxis(-0.1) }), null)).toMatchObject({ turn: 0, pitch: 0 });
  });
});

describe("MouseDrag", () => {
  it("tracks buttons by bit, re-anchoring on each press", () => {
    const tracked = new MouseDrag();
    tracked.press(0, 10, 20);
    tracked.press(2, 30, 40);
    expect(tracked).toMatchObject({ buttons: 3, x: 30, y: 40 });
    expect(tracked.release(0)).toBe(2);
    expect(tracked.release(2)).toBe(0);
  });

  it("looks by the client delta, or by movementX/Y with the pointer locked", () => {
    const tracked = new MouseDrag();
    tracked.press(0, 100, 100);
    tracked.look({ clientX: 130, clientY: 90, movementX: 99, movementY: 99 }, false);
    expect([tracked.dx, tracked.dy, tracked.x, tracked.y]).toEqual([30, -10, 130, 90]);
    tracked.look({ clientX: 130, clientY: 90, movementX: 7, movementY: -3 }, true);
    expect([tracked.dx, tracked.dy]).toEqual([7, -3]);
  });

  it("is past the click slop only beyond it", () => {
    const tracked = new MouseDrag();
    tracked.press(0, 0, 0);
    expect(tracked.pastSlop(UNIT_CLICK_SLOP_PX, 0)).toBe(false);
    expect(tracked.pastSlop(UNIT_CLICK_SLOP_PX + 0.1, 0)).toBe(true);
  });
});

describe("MapInputState", () => {
  it("builds one frame object, refilled from the live state", () => {
    const state = new MapInputState();
    const first = state.frame();
    state.held.add("forward");
    const second = state.frame();
    expect(second).toBe(first);
    expect(second.forward).toBe(1);
  });
});
