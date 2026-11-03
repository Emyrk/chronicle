/**
 * Fixed replay map controls, WoW-style. Keys are KeyboardEvent.code values,
 * so a control follows the physical key on any keyboard layout. The same keys
 * and drags drive the free camera and walk mode ("join the fight") the same
 * way: the free cam is walk mode with a hidden character (chronicle-1514).
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

/** Continuous touch input for the fullscreen mobile world. Values are normalized to -1…1. */
export interface MobileMapInput {
  forward: number;
  strafe: number;
  turn: number;
  pitch: number;
  jump: boolean;
}

export const IDLE_MOBILE_MAP_INPUT: MobileMapInput = {
  forward: 0,
  strafe: 0,
  turn: 0,
  pitch: 0,
  jump: false,
};

export function clampMobileMapInput(input: MobileMapInput): MobileMapInput {
  const clamp = (value: number) => Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
  return {
    forward: clamp(input.forward),
    strafe: clamp(input.strafe),
    turn: clamp(input.turn),
    pitch: clamp(input.pitch),
    jump: Boolean(input.jump),
  };
}

// With A/D strafe enabled, A/D drive strafing instead of turning.
const STRAFE_SWAP: Partial<Record<MapControlAction, MapControlAction>> = {
  turn_left: "strafe_left",
  turn_right: "strafe_right",
};

export function mobileJoystickAxis(value: number, deadZone = 0.14): number {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
  const magnitude = Math.abs(clamped);
  if (magnitude <= deadZone) return 0;
  return Math.sign(clamped) * ((magnitude - deadZone) / (1 - deadZone));
}

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

/**
 * How far the camera may sit from its pivot this frame when the mesh may be
 * in the way, WoW-style. A wall (`hit`: the distance to the first surface on
 * the line from the pivot out to `desired`, null when clear) pulls the camera
 * in at once, `padding` short of the wall; once clear, the camera eases back
 * out toward `desired` instead of popping. Never closer than `min`.
 */
export function cameraCollisionDistance(
  shown: number,
  desired: number,
  hit: number | null,
  padding: number,
  min: number,
  rate: number,
  dt: number,
): number {
  const allowed = Math.max(min, Math.min(desired, hit === null ? desired : hit - padding));
  if (allowed <= shown || dt <= 0) return Math.min(allowed, Math.max(shown, min));
  const next = shown + (allowed - shown) * (1 - Math.exp(-rate * dt));
  return allowed - next < 1e-4 * Math.max(1, allowed) ? allowed : next;
}

/** Mouse look: radians per pixel dragged, in both camera modes, whatever the window size. */
export const LOOK_RADIANS_PER_PX = 0.006;
/** The wheel scales the camera distance by e^(deltaY * this), in both camera modes. */
export const WHEEL_ZOOM_RATE = 0.0015;
/** Shift multiplies the free cam's travel speed by this. */
export const FREE_CAM_FAST_FACTOR = 3;

export interface CameraOffset {
  x: number;
  y: number;
  z: number;
}

/**
 * Where the camera sits relative to its pivot (the character's head, or the
 * free cam's hidden one): `yaw` around the vertical (0 is +z), `pitch` above
 * the horizon, `distance` out. Both camera modes place the camera with this.
 */
export function cameraOffset(yaw: number, pitch: number, distance: number): CameraOffset {
  const horizontal = Math.cos(pitch) * distance;
  return { x: Math.sin(yaw) * horizontal, y: Math.sin(pitch) * distance, z: Math.cos(yaw) * horizontal };
}

/** The inverse of cameraOffset: the yaw, pitch and distance of an offset from the pivot. */
export function cameraAngles(offset: CameraOffset): { yaw: number; pitch: number; distance: number } {
  const horizontal = Math.hypot(offset.x, offset.z);
  return {
    yaw: Math.abs(offset.x) + Math.abs(offset.z) < 1e-9 ? 0 : Math.atan2(offset.x, offset.z),
    pitch: Math.atan2(offset.y, horizontal),
    distance: Math.hypot(horizontal, offset.y),
  };
}

/** A mouse-look drag of (dx, dy) pixels: drag right turns the view right, drag down raises the camera. */
export function lookDrag(yaw: number, pitch: number, dx: number, dy: number, minPitch: number, maxPitch: number): { yaw: number; pitch: number } {
  return {
    yaw: yaw - dx * LOOK_RADIANS_PER_PX,
    pitch: Math.max(minPitch, Math.min(maxPitch, pitch + dy * LOOK_RADIANS_PER_PX)),
  };
}

/** One wheel step: the new camera distance, between `min` and `max`. */
export function wheelZoomDistance(distance: number, deltaY: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, distance * Math.exp(deltaY * WHEEL_ZOOM_RATE)));
}

/**
 * Ground movement for forward/strafe input (each -1…1) facing `yaw` (forward
 * is -z turned by yaw, away from a camera at that yaw), `step` long; a
 * diagonal is no faster than a straight line.
 */
export function planarStep(yaw: number, forward: number, strafe: number, step: number): { x: number; z: number } {
  const length = Math.hypot(forward, strafe);
  if (length === 0) return { x: 0, z: 0 };
  const scaled = step / length;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  return { x: (-sin * forward + cos * strafe) * scaled, z: (-cos * forward - sin * strafe) * scaled };
}

/** The free cam's travel speed (scene units per second): a fraction of the zoom distance, so it feels the same near or far; Shift travels faster. */
export function freeCamTravelSpeed(distance: number, fractionPerSecond: number, fast: boolean): number {
  return distance * fractionPerSecond * (fast ? FREE_CAM_FAST_FACTOR : 1);
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
  { keys: "Space / Z", action: "Fly up / down; while walking: jump (hold to fly up) / fly down" },
  { keys: "Shift", action: "Free camera: travel faster" },
  { keys: "X", action: "Play / pause the replay" },
  { keys: keyLabel(WALK_TOGGLE_KEY), action: "Walk mode on / off: join the fight on the ground" },
  { keys: "Esc", action: "Leave walk mode" },
  { keys: "Ctrl + Shift + F", action: "Map fills the browser window on / off (pointer over the map); Esc leaves" },
  { keys: "Ctrl + Alt + F", action: "Map fullscreen on / off (pointer over the map)" },
  { keys: "Left-drag / right-drag", action: "Look around / steer: movement follows the camera (while walking the character turns too). The cursor hides while you drag" },
  { keys: "Left + right mouse", action: "Move forward and steer with the mouse" },
  { keys: "Middle-drag", action: "Free camera: pan (grab the ground)" },
  { keys: "Right-drag + A / D", action: "Strafe left / right relative to the camera, whatever A/D strafe is set to" },
  { keys: "Mouse wheel", action: "Zoom; while walking, all the way in is first person" },
];
