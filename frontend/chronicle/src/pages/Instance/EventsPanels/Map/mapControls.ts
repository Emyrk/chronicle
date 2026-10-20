/**
 * Fixed replay map controls, WoW-style. Keys are KeyboardEvent.code values,
 * so a control follows the physical key on any keyboard layout. The same keys
 * drive the orbit camera and walk mode ("join the fight"), each its own way.
 */

export const MAP_CONTROL_ACTIONS = [
  { id: "forward", label: "Move forward", defaultKey: "KeyW" },
  { id: "back", label: "Move back", defaultKey: "KeyS" },
  { id: "turn_left", label: "Turn left", defaultKey: "KeyA" },
  { id: "turn_right", label: "Turn right", defaultKey: "KeyD" },
  { id: "strafe_left", label: "Strafe left", defaultKey: null },
  { id: "strafe_right", label: "Strafe right", defaultKey: null },
  { id: "up", label: "Up", defaultKey: "Space" },
  { id: "down", label: "Down", defaultKey: "KeyZ" },
] as const;

export type MapControlAction = (typeof MAP_CONTROL_ACTIONS)[number]["id"];

export const DEFAULT_AD_STRAFE = false;

// With A/D strafe enabled, A/D drive strafing instead of turning.
const STRAFE_SWAP: Partial<Record<MapControlAction, MapControlAction>> = {
  turn_left: "strafe_left",
  turn_right: "strafe_right",
};

/** The action a key drives, with A/D turning by default or strafing when enabled. */
export function actionForKey(code: string, adStrafe: boolean): MapControlAction | undefined {
  const action = MAP_CONTROL_ACTIONS.find((candidate) => candidate.defaultKey === code)?.id;
  return action && adStrafe ? STRAFE_SWAP[action] ?? action : action;
}

/**
 * Eases an angle toward a target along the shortest arc. The exponential
 * response is frame-rate independent and never snaps across the ±π boundary.
 */
export function easeAngleToward(current: number, target: number, rate: number, dt: number): number {
  if (dt <= 0) return current;
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + delta * (1 - Math.exp(-rate * dt));
}

/** Tracks left/right mouse state without relying on browser `event.buttons` updates. */
export function setWalkMouseButton(buttons: number, button: number, down: boolean): number {
  const bit = button === 0 ? 1 : button === 2 ? 2 : 0;
  return down ? buttons | bit : buttons & ~bit;
}

export interface WalkMouseControl {
  looking: boolean;
  steering: boolean;
  movingForward: boolean;
}

/** Decodes the browser mouse-button bitmask into WoW's walk-mode controls. */
export function walkMouseControl(buttons: number): WalkMouseControl {
  const left = (buttons & 1) !== 0;
  const right = (buttons & 2) !== 0;
  return {
    looking: left || right,
    steering: right,
    movingForward: left && right,
  };
}

/** Holding right-click changes keyboard turn input into the matching strafe, WoW-style. */
export function rightDragWalkAxes(turn: number, strafe: number, rightDragging: boolean): { turn: number; strafe: number } {
  if (!rightDragging) return { turn, strafe };
  return { turn: 0, strafe: Math.max(-1, Math.min(1, strafe - turn)) };
}

/** Right-drag movement and facing follow the camera, rather than the old character heading. */
export function walkMovementYaw(characterYaw: number, cameraYaw: number, rightDragging: boolean): number {
  return rightDragging ? cameraYaw : characterYaw;
}

/** Whether planar walk input should bring a free-look camera back behind the character. */
export function shouldFollowWalkCamera(forward: number, strafe: number, turn: number, dragging: boolean): boolean {
  return !dragging && (forward !== 0 || strafe !== 0 || turn !== 0);
}

/** Toggles walk mode while the pointer is over the map (or while walking). */
export const WALK_TOGGLE_KEY = "KeyG";

/** "KeyW" -> "W", "ArrowUp" -> "↑", "Numpad8" -> "Num 8". */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  const arrows: Record<string, string> = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" };
  return arrows[code] ?? code;
}

/** For the instance page's keybind help. */
export const MAP_CONTROL_KEYBINDS = [
  { keys: "W / S", action: "Move forward / back (pointer over the map, or while walking)" },
  { keys: "A / D", action: "Turn left / right (strafe with \"A/D strafe\" on in Map settings → Controls)" },
  { keys: "Q / E", action: "Rewind / fast forward replay by 1 second" },
  { keys: "Space / Z", action: "Zoom out / in; while walking: jump (hold to fly up) / fly down" },
  { keys: "X", action: "Play / pause the replay" },
  { keys: keyLabel(WALK_TOGGLE_KEY), action: "Walk mode on / off: join the fight on the ground" },
  { keys: "Esc", action: "Leave walk mode" },
  { keys: "Left-drag / right-drag", action: "While walking: free-look / steer character and camera. The cursor hides while you drag" },
  { keys: "Left + right mouse", action: "While walking: run forward and steer with the mouse" },
  { keys: "Right-drag + A / D", action: "Strafe left / right relative to the camera, whatever A/D strafe is set to" },
  { keys: "Mouse wheel", action: "Zoom; while walking, all the way in is first person" },
];
